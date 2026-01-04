/**
 * @fileoverview Main Application Core
 * @module core/core
 *
 * The Main Application Core is the heart of Mera Learn. It:
 * - Manages all application state (progress, settings, navigation)
 * - Instantiates and manages component lifecycles
 * - Runs the main polling cycle (50ms)
 * - Processes queued messages from components
 * - Coordinates UI rendering
 *
 * Philosophy:
 * - Pure TypeScript, no DOM access (components handle rendering)
 * - Synchronous operation (polling cycle handles timing)
 * - Readonly external interfaces (mutation only via validated methods)
 * - Message-based architecture (components queue changes)
 *
 * The Core is stateful and runs continuously once started.
 */

import { BaseComponentConfig, BaseComponentProgressManager } from "../components/cores/baseComponentCore.js";
import type { PodStorageBundle } from "../persistence/podStorageSchema.js";
import {
  NavigationStateManager,
  NavigationMessageHandler,
} from "./navigationSchema.js";
import {
  OverallProgressManager,
  OverallProgressMessageHandler,
} from "./overallProgressSchema.js";
import type { ParsedLessonData } from "./parsedLessonData.js";
import {
  SettingsDataManager,
  SettingsMessageHandler,
} from "./settingsSchema.js";
import { curriculumData } from "../registry/mera-registry.js";
import { createComponentProgressManager } from "../components/componentManagerFactory.js";
import { createComponentProgressHandlers } from "../components/componentProgressHandlerFactory.js";
import { componentIdToTypeMap } from "../registry/mera-registry.js";
import { componentToLessonMap } from "../registry/mera-registry.js";

/**
 * Start the main application core.
 *
 * Called by initializationOrchestrator after:
 * - YAML lesson configs are loaded and parsed
 * - User progress is loaded and validated
 * - Background services (SaveManager, SaveCleaner) are started
 *
 * Responsibilities:
 * - Instantiate Main Application Core with validated data
 * - Initialize component registry and create component instances
 * - Start main polling cycle (50ms intervals)
 * - Render initial UI state based on navigation
 * - Begin processing component message queues
 *
 * This function does not return - the core runs continuously via
 * its internal polling cycle until the page is closed/refreshed.
 *
 * @param bundle - Complete validated progress bundle from progressLoader
 * @param lessonConfigs - Immutable parsed YAML lesson configurations
 *
 * @example
 * await startCore(validatedBundle, lessonConfigs);
 * // Core is now running independently
 */
export async function startCore(
  bundle: PodStorageBundle,
  lessonConfigs: Map<number, ParsedLessonData>
): Promise<void> {
  //Debugging information to console
  console.log("🚀 Starting Main Application Core...");
  console.log("  Progress bundle:", {
    webId: bundle.metadata.webId,
    lessonsCompleted: Object.keys(bundle.overallProgress.lessonCompletions)
      .length,
    settings: Object.keys(bundle.settings).length,
    components: Object.keys(bundle.combinedComponentProgress.components).length,
  });
  console.log("  Lesson configs:", lessonConfigs.size, "lessons");

  // 1. Instantiate ALL core state managers (managers clone input internally)
  const settingsManager = new SettingsDataManager(bundle.settings);

  const navigationManager = new NavigationStateManager(
    bundle.navigationState,
    curriculumData
  );

  const overallProgressManager = new OverallProgressManager(
    bundle.overallProgress,
    curriculumData
  );

  // 2. Instantiate ALL component progress managers (persistent data holders)

  // Create map to store component progress managers by ID
  const componentManagers = new Map<
    number,
    BaseComponentProgressManager<any, any>
  >();

  // Iterate over each component's progress data from bundle
  for (const [componentIdStr, progressData] of Object.entries(
    bundle.combinedComponentProgress.components
  )) {
    const componentId = Number(componentIdStr);
    const componentType = componentIdToTypeMap.get(componentId);

    // Validate component type exists in registry
    if (!componentType) {
      throw new Error(
        `No component type mapping found for component ID ${componentId}. ` +
          `This indicates corrupted registry or progress data.`
      );
    }

    // Look up which lesson this component belongs to
    const lessonId = componentToLessonMap.get(componentId);
    if (!lessonId) {
      throw new Error(
        `No lesson mapping found for component ID ${componentId}`
      );
    }

    // Get the lesson config
    const lessonConfig = lessonConfigs.get(lessonId);
    if (!lessonConfig) {
      throw new Error(`No lesson config found for lesson ID ${lessonId}`);
    }

    // Find the component config within the lesson
    const componentConfig = lessonConfig.components.find(
      (c) => c.id === componentId
    );
    if (!componentConfig) {
      throw new Error(
        `Component ${componentId} not found in lesson ${lessonId} config`
      );
    }

    // Factory pattern to create right manager type (now with config)
    const manager = createComponentProgressManager(
      componentType,
      componentConfig as BaseComponentConfig, // Pass config as second parameter
      progressData
    );

    // Store manager in map for component ID
    componentManagers.set(componentId, manager);
  }

  // 3. Instantiate message handlers
  const navigationHandler = new NavigationMessageHandler(
    navigationManager,
    curriculumData
  );

  const settingsHandler = new SettingsMessageHandler(settingsManager);

  const overallProgressHandler = new OverallProgressMessageHandler(
    overallProgressManager,
    curriculumData
  );

  // Component progress handlers - factory creates them all as a Map
  const componentProgressHandlers =
    createComponentProgressHandlers(componentManagers);

  console.warn("⚠️  startCore() is a stub - core implementation needed");

  // TODO: 4. Start the polling loop (never returns)
  // runCore({
  //   settingsManager,
  //   navigationManager,
  //   overallProgressManager,
  //   componentManagers,
  //   navigationHandler,
  //   settingsHandler,
  //   overallProgressHandler,
  //   componentProgressHandlers,
  //   curriculumData,
  //   lessonConfigs,
  // });

  // Placeholder: Keep function alive (real implementation has polling loop)
  await new Promise(() => {}); // Never resolves - simulates running core
}
