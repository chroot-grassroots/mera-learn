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

  // Core loop that drives app. Runs forever unless hits error or page refresh.
  while (true) {
    // ========================================================================
    // PHASE 1: Component Lifecycle (if navigation changed)
    // ========================================================================

    // Instantiate new components for current page
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

    // ========================================================================
    // PHASE 2: Message Polling (all four queue types)
    // ========================================================================
    // TODO: Poll each message type and collect messages
    // TODO: Wrap in try-catch per component to isolate failures
    // ========================================================================
    // PHASE 3: Message Processing
    // ========================================================================
    // TODO: Process navigation messages first (may set pageChanged = true)
    // TODO: Process other message types through handlers
    // ========================================================================
    // PHASE 4: Delete Components If Navigation State Changes
    // ========================================================================
    // TODO: If Navigation state changed, destroy components.
    // ========================================================================
    // PHASE 5: Trigger Save (fire-and-forget)
    // ========================================================================
    // TODO: Build bundle and call saveManager.queueSave()
    // ========================================================================
    // PHASE 6: Delay for 50ms cycle
    // ========================================================================
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
