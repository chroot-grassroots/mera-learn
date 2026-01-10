/**
 * @fileoverview Main Application Core - Runtime Polling Loop
 * @module core/runCore
 *
 * Implements the continuous 50ms polling cycle that drives the application.
 * Processes queued messages from components and coordinates state updates.
 *
 * This function never returns - it runs until page close/refresh.
 */

import type { BaseComponentProgressManager } from "../components/cores/baseComponentCore.js";
import type {
  NavigationStateManager,
  NavigationMessageHandler,
} from "./navigationSchema.js";
import type {
  OverallProgressManager,
  OverallProgressMessageHandler,
} from "./overallProgressSchema.js";
import type {
  SettingsDataManager,
  SettingsMessageHandler,
} from "./settingsSchema.js";
import type { ParsedLessonData } from "./parsedLessonData.js";
import type { CurriculumRegistry } from "../registry/mera-registry.js";
import {
  instantiateComponents,
  type InstantiatedComponents,
} from "./componentInstantiator.js";
import { componentIdToTypeMap } from "../registry/mera-registry.js";
import { SaveManager } from "../persistence/saveManager.js";
import { enforceDataIntegrity } from "../initialization/progressIntegrity.js";

/**
 * Parameters bundle for runCore.
 * All state managers, message handlers, and configuration data.
 */
export interface RunCoreParams {
  // State managers
  settingsManager: SettingsDataManager;
  navigationManager: NavigationStateManager;
  overallProgressManager: OverallProgressManager;
  componentManagers: Map<number, BaseComponentProgressManager<any, any>>;

  // Message handlers
  navigationHandler: NavigationMessageHandler;
  settingsHandler: SettingsMessageHandler;
  overallProgressHandler: OverallProgressMessageHandler;
  componentProgressHandlers: Map<string, any>; // Type from factory

  // Configuration data
  curriculumData: CurriculumRegistry;
  lessonConfigs: Map<number, ParsedLessonData>;
  webId: string;
}

/**
 * Run the main application core polling loop.
 *
 * Responsibilities:
 * - Poll components every 50ms for queued messages
 * - Process messages through appropriate handlers
 * - Update application state
 * - Trigger fire-and-forget persistence
 * - Manage component lifecycle (create/destroy)
 *
 * This function never returns - the polling loop runs continuously.
 *
 * @param params - Complete application state and handlers
 */
export async function runCore(params: RunCoreParams): Promise<void> {
  console.log("🔄 Starting main polling loop (50ms)...");

  // Always need to make components on first run
  let pageChanged = true;

  // Track currently instantiated components
  let currentComponents: InstantiatedComponents | null = null;

  // Track whether any state changed (for save optimization)
  let hasChanged = false;

  // Get SaveManager singleton
  const saveManager = SaveManager.getInstance();

  // Track last save queue time for 15-second periodic saves
  let lastSaveQueueTime = Date.now();
  const SAVE_QUEUE_INTERVAL_MS = 15000; // 15 seconds

  // Core loop that drives app. Runs forever unless hits error or page refresh.
  while (true) {
    // Capture navigation state at start of iteration for change detection
    const navStateAtStart = params.navigationManager.getState();

    // ========================================================================
    // PHASE 1: Component Lifecycle (if navigation changed)
    // ========================================================================

    if (pageChanged) {
      const navigationState = params.navigationManager.getState();

      currentComponents = instantiateComponents(
        navigationState,
        params.lessonConfigs,
        params.componentManagers,
        params.curriculumData,
        params.settingsManager,
        params.overallProgressManager,
        params.navigationManager
      );

      pageChanged = false;
      console.log(
        `📦 Instantiated ${currentComponents.componentCores.size} components`
      );
    }

    // Ensure we have components before proceeding
    if (!currentComponents) {
      throw new Error("No components instantiated - this should never happen");
    }

    // ========================================================================
    // PHASE 2: Poll and Process Messages (iterate once per component)
    // ========================================================================

    for (const [componentId, core] of currentComponents.componentCores) {
      // Get component type from registry (single source of truth)
      const componentType = componentIdToTypeMap.get(componentId);
      if (!componentType) {
        throw new Error(
          `CRITICAL: Component ${componentId} exists in componentCores but has no type in registry. ` +
            `This indicates registry corruption or deployment mismatch.`
        );
      }

      // Component Progress Messages - graceful degradation on errors
      if (currentComponents.componentProgressPolling.has(componentId)) {
        try {
          const messages = core.getComponentProgressMessages();
          if (messages.length > 0) {
            hasChanged = true;

            const handler = params.componentProgressHandlers.get(componentType);
            if (!handler) {
              throw new Error(
                `No handler found for component type '${componentType}'`
              );
            }

            for (const msg of messages) {
              // SECURITY CHECK: Verify message claims correct componentId
              // componentId from map key is source of truth
              if (msg.componentId !== componentId) {
                throw new Error(
                  `Component ${componentId} sent message claiming to be from component ${msg.componentId}`
                );
              }
              handler.handleMessage(msg);
            }
          }
        } catch (error) {
          console.error(
            `❌ Component ${componentId} (${componentType}) failed during component progress polling/processing:`,
            error
          );

          // Destroy component (should internally notify componentCoordinator)
          try {
            core.interface.destroy();
          } catch (destroyError) {
            console.error(
              `Failed to destroy component ${componentId}:`,
              destroyError
            );
          }

          // TODO: Ensure BaseComponentInterface.destroy() calls componentCoordinator.removeComponent()
          // This prevents coordinator from holding stale references after component failure
          // Interface will need componentCoordinator passed to constructor

          currentComponents.componentCores.delete(componentId);
          currentComponents.componentProgressPolling.delete(componentId);
          currentComponents.overallProgressPolling.delete(componentId);
          currentComponents.navigationPolling.delete(componentId);
          currentComponents.settingsPolling.delete(componentId);

          continue; // Skip to next component
        }
      }

      // Settings Messages - crash on errors (core system code)
      if (currentComponents.settingsPolling.has(componentId)) {
        const messages = core.getSettingsMessages();
        if (messages.length > 0) {
          hasChanged = true;
          for (const msg of messages) {
            params.settingsHandler.handleMessage(msg);
          }
        }
      }

      // Overall Progress Messages - crash on errors (core system code)
      if (currentComponents.overallProgressPolling.has(componentId)) {
        const messages = core.getOverallProgressMessages();
        if (messages.length > 0) {
          hasChanged = true;
          for (const msg of messages) {
            params.overallProgressHandler.handleMessage(msg);
          }
        }
      }

      // Navigation Messages - crash on errors (core system code)
      if (currentComponents.navigationPolling.has(componentId)) {
        const messages = core.getNavigationMessages();
        if (messages.length > 0) {
          hasChanged = true;
          for (const msg of messages) {
            params.navigationHandler.handleMessage(msg);
          }
        }
      }
    }

    // Check if navigation state changed during this iteration
    const navStateAtEnd = params.navigationManager.getState();
    if (
      navStateAtEnd.currentEntityId !== navStateAtStart.currentEntityId ||
      navStateAtEnd.currentPage !== navStateAtStart.currentPage
    ) {
      pageChanged = true;
    }

    // ========================================================================
    // PHASE 3: Destroy Components If Navigation Changed
    // ========================================================================

    if (pageChanged && currentComponents !== null) {
      currentComponents.componentCores.forEach((core) => {
        try {
          core.interface.destroy();
        } catch (error) {
          console.error(`Error destroying component ${core.config.id}:`, error);
        }
      });

      // TODO: Each destroy() call should internally notify componentCoordinator.removeComponent()
      // This prevents coordinator from holding stale references when page changes

      currentComponents = null;
    }

    // ========================================================================
    // PHASE 4: Trigger Save (fire-and-forget)
    // ========================================================================

    // Build bundle from current state
    const componentProgressObj: { [key: string]: any } = {};
    for (const [componentId, manager] of params.componentManagers) {
      componentProgressObj[componentId.toString()] = manager.getProgress();
    }

    const bundle = {
      metadata: { webId: params.webId },
      overallProgress: params.overallProgressManager.getProgress(),
      settings: params.settingsManager.getSettings(),
      navigationState: params.navigationManager.getState(),
      combinedComponentProgress: {
        components: componentProgressObj,
      },
    };

    const bundleJSON = JSON.stringify(bundle);

    // Validate bundle integrity before saving
    try {
      const integrityCheck = enforceDataIntegrity(
        bundleJSON,
        params.webId,
        params.lessonConfigs
      );

      if (!integrityCheck.perfectlyValidInput) {
        console.error("💥 CRITICAL: Generated corrupt bundle:", integrityCheck);
        throw new Error(
          "Bundle failed integrity check - this is a bug in state managers"
        );
      }
    } catch (error) {
      console.error("💥 CRITICAL: Bundle integrity validation failed:", error);
      throw error; // Re-throw to crash
    }

    // Queue save if: (1) state changed, OR (2) 15 seconds elapsed
    const now = Date.now();
    const timeSinceLastSave = now - lastSaveQueueTime;
    const shouldQueueSave =
      hasChanged || timeSinceLastSave >= SAVE_QUEUE_INTERVAL_MS;

    if (shouldQueueSave) {
      saveManager.queueSave(bundleJSON, hasChanged);
      lastSaveQueueTime = now;
      hasChanged = false; // Reset for next iteration
    }

    // ========================================================================
    // PHASE 5: Delay for 50ms cycle
    // ========================================================================

    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
