/**
 * @fileoverview Main Application Core - Initialization Phase
 * @module core/startCore
 *
 * Handles one-time initialization of the Main Application Core by instantiating
 * all state managers, message handlers, and component progress managers from
 * validated progress data. After setup completes, hands off to runCore() for
 * continuous operation.
 *
 * Responsibilities:
 * - Instantiate all core state managers (settings, navigation, overall progress)
 * - Create component progress managers for all curriculum components
 * - Instantiate message handlers for validation and routing
 * - Launch the continuous polling cycle (runCore)
 *
 * This module handles INITIALIZATION ONLY. Runtime operation (polling, message
 * processing, component lifecycle) is implemented in runCore.ts.
 *
 * Philosophy:
 * - Fail-fast on deployment errors (registry bugs, YAML parse failures)
 * - Trust upstream validation (progressIntegrity, progressLoader)
 * - Pure TypeScript, no DOM access (components handle rendering)
 * - Readonly external interfaces (mutation only via validated methods)
 * - Message-based architecture (components queue changes)
 *
 * Error Handling Strategy:
 * - Data errors (corruption, version mismatch): Handled upstream by progressIntegrity
 * - Deployment errors (registry/YAML bugs): Fail-fast with clear messages (this module)
 * - Runtime errors (polling failures): Handled by runCore with try/catch wrapper
 */

import {
  BaseComponentConfig,
  BaseComponentProgressManager,
} from "../components/cores/baseComponentCore.js";
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
import { runCore } from "./runCore.js";

/**
 * Initialize and start the main application core.
 *
 * Called by initializationOrchestrator after:
 * - YAML lesson configs are loaded and parsed
 * - User progress is loaded and validated by progressLoader
 * - Data integrity enforced by progressIntegrity
 * - Background services (SaveManager, SaveCleaner) are started
 *
 * Input Guarantees (provided by upstream validation):
 * - Bundle contains valid, schema-compliant data
 * - All components in bundle exist in current curriculum
 * - Missing components have been initialized with defaults
 * - Deleted curriculum content has been reconciled
 * - Corruption has been detected and metrics recorded
 * - webId matches authenticated user
 *
 * Failure Modes (this module):
 * - Registry corruption: Component in bundle but missing from registry mappings
 * - YAML parse failure: Lesson config missing despite being in curriculum
 * - Structure mismatch: Component ID exists but not found in lesson YAML
 * All failures are deployment bugs and fail-fast with clear error messages.
 *
 * This function does not return - after initialization completes, runCore()
 * begins continuous polling until page close/refresh.
 *
 * @param bundle - Complete validated progress bundle from progressLoader
 * @param lessonConfigs - Immutable parsed YAML lesson configurations
 *
 * @example
 * await startCore(validatedBundle, lessonConfigs);
 * // Core is now running independently in polling loop
 *
 * @throws Error if registry mappings or YAML configs are inconsistent (deployment bug)
 */
export async function startCore(
  bundle: PodStorageBundle,
  lessonConfigs: Map<number, ParsedLessonData>
): Promise<void> {
  // Log initialization start with key metrics
  console.log("🚀 Starting Main Application Core initialization...");
  console.log("  Progress bundle:", {
    webId: bundle.metadata.webId,
    lessonsCompleted: Object.keys(bundle.overallProgress.lessonCompletions)
      .length,
    settings: Object.keys(bundle.settings).length,
    components: Object.keys(bundle.combinedComponentProgress.components).length,
  });
  console.log("  Lesson configs:", lessonConfigs.size, "lessons");

  // ========================================================================
  // PHASE 1: Instantiate Core State Managers
  // ========================================================================
  // Managers clone input data internally to prevent external mutation.
  // All managers expose readonly interfaces; mutations occur only through
  // validated methods that update internal cloned state.

  const settingsManager = new SettingsDataManager(bundle.settings);

  const navigationManager = new NavigationStateManager(
    bundle.navigationState,
    curriculumData
  );

  const overallProgressManager = new OverallProgressManager(
    bundle.overallProgress,
    curriculumData
  );

  // ========================================================================
  // PHASE 2: Instantiate Component Progress Managers
  // ========================================================================
  // Create manager for each component's progress data. Managers hold
  // persistent state and provide validated mutation methods.

  const componentManagers = new Map<
    number,
    BaseComponentProgressManager<any, any>
  >();

  for (const [componentIdStr, progressData] of Object.entries(
    bundle.combinedComponentProgress.components
  )) {
    // Parse component ID with explicit validation
    // Note: If invalid, subsequent registry lookups will fail with clear errors
    const componentId = Number(componentIdStr);
    if (!Number.isInteger(componentId)) {
      throw new Error(
        `Invalid component ID format in bundle: "${componentIdStr}" (expected integer)`
      );
    }

    // Look up component type in build-time registry
    // Failure indicates registry generation bug or bundle/registry version mismatch
    const componentType = componentIdToTypeMap.get(componentId);
    if (!componentType) {
      throw new Error(
        `No component type mapping found for component ID ${componentId}. ` +
          `This indicates registry generation bug or deployment error. ` +
          `Registry must be regenerated with current curriculum.`
      );
    }

    // Find which lesson contains this component
    // Registry mapping built at compile-time from YAML structure
    const lessonId = componentToLessonMap.get(componentId);
    if (!lessonId) {
      throw new Error(
        `No lesson mapping found for component ID ${componentId}. ` +
          `This indicates registry generation bug or corrupted mappings.`
      );
    }

    // Get the parsed lesson configuration
    // Failure indicates YAML parser didn't load all curriculum lessons
    const lessonConfig = lessonConfigs.get(lessonId);
    if (!lessonConfig) {
      throw new Error(
        `No lesson config found for lesson ID ${lessonId}. ` +
          `This indicates YAML parser failure or orchestration bug. ` +
          `Expected ${lessonConfigs.size} lessons, missing lesson ${lessonId}.`
      );
    }

    // Find component configuration within lesson
    // Failure indicates mismatch between registry and YAML structure
    const componentConfig = lessonConfig.components.find(
      (c) => c.id === componentId
    );
    if (!componentConfig) {
      throw new Error(
        `Component ${componentId} not found in lesson ${lessonId} config. ` +
          `This indicates structure mismatch between registry and YAML. ` +
          `Lesson has ${lessonConfig.components.length} components.`
      );
    }

    // Type cast is safe: YAML parser validates component configs against
    // component-specific schemas before reaching this point. All configs
    // are guaranteed to extend BaseComponentConfig.
    const typedConfig = componentConfig as BaseComponentConfig;

    // Factory creates appropriate manager subclass based on component type
    const manager = createComponentProgressManager(
      componentType,
      typedConfig,
      progressData
    );

    // Store manager indexed by component ID for message routing
    componentManagers.set(componentId, manager);
  }

  // ========================================================================
  // PHASE 3: Instantiate Message Handlers
  // ========================================================================
  // Handlers validate and route messages from components to appropriate
  // managers. Each handler corresponds to one of the four message queue types.

  const navigationHandler = new NavigationMessageHandler(
    navigationManager,
    curriculumData
  );

  const settingsHandler = new SettingsMessageHandler(settingsManager);

  const overallProgressHandler = new OverallProgressMessageHandler(
    overallProgressManager,
    curriculumData
  );

  // Component progress handlers created via factory pattern
  // Factory generates handler for each component type with method whitelisting
  const componentProgressHandlers =
    createComponentProgressHandlers(componentManagers);

  console.log("✅ All managers and handlers instantiated successfully");

  // ========================================================================
  // PHASE 4: Launch Continuous Polling Cycle
  // ========================================================================
  // Hand off to runCore for continuous operation. This function does not return.
  // Wrap in try/catch to distinguish initialization failures (above) from
  // runtime failures (runCore polling loop).

  try {
    await runCore({
      settingsManager,
      navigationManager,
      overallProgressManager,
      componentManagers,
      navigationHandler,
      settingsHandler,
      overallProgressHandler,
      componentProgressHandlers,
      curriculumData,
      lessonConfigs,
    });
  } catch (err) {
    console.error("💥 FATAL ERROR in runCore() polling loop:");
    throw err;
  }
}
