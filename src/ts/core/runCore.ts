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
import { componentCoordinator } from "../components/componentCoordinator.js";

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

  // Track whether overall progress specifically changed (for critical save marking)
  let overallProgressChanged = false;

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
        params.navigationManager,
      );

      pageChanged = false;
      console.log(
        `📦 Instantiated ${currentComponents.componentCores.size} components`,
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
          `CRITICAL: Component ${componentId} exists in componentCores but has no type in registry.` +
            ` This indicates registry generation bug or deployment error.` +
            ` Registry must be regenerated with current curriculum.`,
        );
      }

      // Component Progress Messages - isolated error handling (community code)
      // Catch errors to prevent single buggy component from crashing app
      if (currentComponents.componentProgressPolling.has(componentId)) {
        const messages = core.getComponentProgressMessages();
        if (messages.length > 0) {
          hasChanged = true;

          // SPLIT: Normal components vs. Main menu special authority
          const MAIN_MENU_COMPONENT_ID = 1000000;

          if (componentId !== MAIN_MENU_COMPONENT_ID) {
            // ================================================================
            // NORMAL COMPONENTS: Can only modify themselves
            // ================================================================
            for (const msg of messages) {
              try {
                // Enforce: message must target this component only
                if (msg.componentId !== componentId) {
                  throw new Error(
                    `Component ${componentId} attempted to modify component ${msg.componentId} (unauthorized)`,
                  );
                }

                const handler =
                  params.componentProgressHandlers.get(componentType);

                if (!handler) {
                  console.error(
                    `No handler for component type ${componentType}`,
                  );
                  continue;
                }

                handler(msg);
              } catch (error) {
                console.error(
                  `Component ${componentId} message failed:`,
                  error,
                );
                // Don't break - continue processing other messages
              }
            }
          } else {
            // ================================================================
            // MAIN MENU SPECIAL CASE: Can send messages to ANY component
            // ================================================================
            for (const msg of messages) {
              try {
                // Main menu can target any component - look up target's type
                const targetComponentType = componentIdToTypeMap.get(
                  msg.componentId,
                );

                if (!targetComponentType) {
                  console.error(
                    `Main menu targeted unknown component ${msg.componentId}`,
                  );
                  continue;
                }

                const handler =
                  params.componentProgressHandlers.get(targetComponentType);

                if (!handler) {
                  console.error(
                    `No handler for component type ${targetComponentType}`,
                  );
                  continue;
                }

                handler.handleMessage(msg);
              } catch (error) {
                console.error(
                  `Main menu message failed for component ${msg.componentId}:`,
                  error,
                );
              }
            }
          }
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
          overallProgressChanged = true; // Mark critical save needed
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
    // PHASE 3: Trigger Save (fire-and-forget)
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
        params.lessonConfigs,
      );

      if (!integrityCheck.perfectlyValidInput) {
        console.error("💥 CRITICAL: Generated corrupt bundle:", integrityCheck);
        throw new Error(
          "Bundle failed integrity check - this is a bug in state managers",
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
      (hasChanged && timeSinceLastSave >= SAVE_QUEUE_INTERVAL_MS) ||
      overallProgressChanged;

    if (shouldQueueSave) {
      saveManager.queueSave(bundleJSON, hasChanged, overallProgressChanged);
      lastSaveQueueTime = now;
      console.log(
        `💾 Save queued (hasChanged=${hasChanged}, critical=${overallProgressChanged})`,
      );
      hasChanged = false;
      overallProgressChanged = false;
    } else {
      // Only log occasionally to prove loop is running
      if (timeSinceLastSave % 30000 < 100) {
        // Every ~30s
        console.log(
          `⏭️ Core running, no save needed (no changes, last save ${Math.floor(timeSinceLastSave / 1000)}s ago)`,
        );
      }
    }

    // ========================================================================
    // PHASE 4: Delay for 50ms cycle
    // ========================================================================

    await new Promise((resolve) => setTimeout(resolve, 50));

    // ========================================================================
    // PHASE 5: Destroy Components If Navigation Changed
    // ========================================================================

    if (pageChanged && currentComponents !== null) {
      componentCoordinator.clearPage();

      currentComponents.componentCores.forEach((core) => {
        try {
          core.interface.destroy();
        } catch (error) {
          console.error(`Error destroying component ${core.config.id}:`, error);
        }
      });

      currentComponents = null;
    }
  }
}
