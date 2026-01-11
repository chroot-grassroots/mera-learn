/**
 * @fileoverview Component Instantiation Module
 * @module components/componentInstantiator
 *
 * Responsible for creating component Core instances based on current navigation state.
 * Determines which components should be polled for each message type based on
 * permission rules defined in componentPermissions.ts.
 *
 * Architecture: Primary/Secondary Managers Pattern
 * - Main Core maintains primary managers (single source of truth)
 * - Each component receives CLONED secondary manager with isolated state
 * - Component mutations apply to secondary copy only
 * - Component queues messages to Main Core
 * - Main Core replays mutations on primary managers
 * - Ensures all changes go through message queue (audit trail, validation)
 *
 * Security: Only components with explicit permission are included in polling maps,
 * preventing unauthorized components from triggering navigation, settings, or
 * overall progress changes.
 *
 * Error Handling Strategy:
 * - Deployment errors (registry bugs, missing managers): Fail-fast with clear diagnostics
 * - Component code errors (buggy constructors, broken render): Isolate and skip component
 */

import type {
  IReadonlyNavigationManager,
  NavigationState,
} from "../core/navigationSchema.js";
import type { ParsedLessonData } from "../core/parsedLessonData.js";
import type { BaseComponentCore } from "../components/cores/baseComponentCore.js";
import type { BaseComponentProgressManager } from "../components/cores/baseComponentCore.js";
import type { CurriculumRegistry } from "../registry/mera-registry.js";
import {
  hasPermissions,
  getPermissions,
} from "../components/componentPermissions.js";
import { componentIdToTypeMap } from "../registry/mera-registry.js";
import { createComponentCore } from "../components/componentCoreFactory.js";
import { createComponentProgressManager } from "../components/componentManagerFactory.js";
import { componentCoordinator } from "../components/componentCoordinator.js";
import { IReadonlySettingsManager } from "./settingsSchema.js";
import { IReadonlyOverallProgressManager } from "./overallProgressSchema.js";

/**
 * Results from component instantiation.
 * Contains component cores and four separate polling maps that determine
 * which components can queue which message types.
 */
export interface InstantiatedComponents {
  /** All component core instances, keyed by component ID */
  componentCores: Map<number, BaseComponentCore<any, any>>;

  /** Components allowed to queue component progress messages (componentId -> componentType) */
  componentProgressPolling: Map<number, string>;

  /** Components allowed to queue overall progress messages (componentId -> componentType) */
  overallProgressPolling: Map<number, string>;

  /** Components allowed to queue navigation messages (componentId -> componentType) */
  navigationPolling: Map<number, string>;

  /** Components allowed to queue settings messages (componentId -> componentType) */
  settingsPolling: Map<number, string>;
}

/**
 * Instantiate all components for the current page.
 *
 * Creates isolated component Core instances with cloned secondary managers.
 * Each component operates on its own secondary manager clone, queueing messages
 * to synchronize with Main Core's primary managers.
 *
 * @param navigationState - Current navigation state (determines which page)
 * @param lessonConfigs - Immutable parsed YAML lesson configurations
 * @param componentManagers - PRIMARY progress managers (Main Core's single source of truth)
 * @param curriculumData - Curriculum registry for validation
 * @param settingsManager - Readonly access to settings
 * @param overallProgressManager - Readonly access to overall progress
 * @param navigationManager - Readonly access to navigation state
 * @returns Component cores and permission-filtered polling maps
 */
export function instantiateComponents(
  navigationState: Readonly<NavigationState>,
  lessonConfigs: ReadonlyMap<number, ParsedLessonData>,
  componentManagers: ReadonlyMap<
    number,
    BaseComponentProgressManager<any, any>
  >,
  curriculumData: CurriculumRegistry,
  settingsManager: IReadonlySettingsManager,
  overallProgressManager: IReadonlyOverallProgressManager,
  navigationManager: IReadonlyNavigationManager
): InstantiatedComponents {
  // ========================================================================
  // PHASE 1: Determine which components to instantiate
  // ========================================================================

  const currentEntityId = navigationState.currentEntityId;
  const currentPage = navigationState.currentPage;

  // Get lesson configuration (main menu entityId=0 handled separately if needed)
  const lessonConfig = lessonConfigs.get(currentEntityId);
  if (!lessonConfig) {
    throw new Error(
      `Lesson config not found for entity ${currentEntityId}. ` +
        `This indicates curriculum/YAML mismatch.`
    );
  }

  // Find components that exist on the current page
  // Filter lessonConfig.components by page number
  const componentsOnPage = lessonConfig.components.filter(
    (component) => component.page === currentPage
  );
  componentsOnPage.sort((a, b) => a.order - b.order);

  console.log(
    `📄 Page ${currentPage} of entity ${currentEntityId}: ` +
      `${componentsOnPage.length} components to instantiate`
  );

  // ========================================================================
  // PHASE 2: Instantiate component cores and build polling maps
  // ========================================================================

  const componentCores = new Map<number, BaseComponentCore<any, any>>();
  const componentProgressPolling = new Map<number, string>();
  const overallProgressPolling = new Map<number, string>();
  const navigationPolling = new Map<number, string>();
  const settingsPolling = new Map<number, string>();

  for (const componentConfig of componentsOnPage) {
    const componentId = componentConfig.id;

    // ======================================================================
    // Registry Lookups - FAIL FAST (deployment bugs)
    // ======================================================================

    // Look up component type from registry
    const componentType = componentIdToTypeMap.get(componentId);
    if (!componentType) {
      throw new Error(
        `Component ${componentId} not found in componentIdToTypeMap. ` +
          `This indicates registry generation bug.`
      );
    }

    // Verify permissions are defined for this component type
    if (!hasPermissions(componentType)) {
      throw new Error(
        `Component type '${componentType}' has no defined permissions. ` +
          `Add to MESSAGE_TYPE_PERMISSIONS in componentPermissions.ts`
      );
    }

    // Get PRIMARY progress manager (Main Core's single source of truth)
    const primaryManager = componentManagers.get(componentId);
    if (!primaryManager) {
      throw new Error(
        `Progress manager not found for component ${componentId}. ` +
          `This indicates startCore instantiation bug.`
      );
    }

    // =====================================================================
    // Create SECONDARY manager with cloned progress data.
    // Component operates on this isolated copy and queues messages.
    // Main Core replays messages on primary manager to maintain sync.
    //
    // Why clone?
    // - Prevents component from bypassing message queue
    // - Ensures all mutations go through validation
    // - Provides audit trail via message replay
    // - Isolates component failures (buggy component can't corrupt primary)

    const secondaryManager = createComponentProgressManager(
      componentType,
      componentConfig as any, // Type assertion: YAML parser guarantees BaseComponentConfig structure
      primaryManager.getProgress() // ← Already cloned by getProgress()!
    );

    // ======================================================================
    // Component Instantiation - ISOLATE ERRORS (component code bugs)
    // ======================================================================

    try {
      // Create component core via factory
      // Factory handles type-specific construction
      const core = createComponentCore(
        componentType,
        componentConfig,
        secondaryManager, // ← Component gets CLONED secondary manager
        curriculumData,
        overallProgressManager,
        navigationManager,
        settingsManager
      );

      componentCores.set(componentId, core);

      // ====================================================================
      // PHASE 3: Build permission-filtered polling maps
      // ====================================================================
      // Only add successfully instantiated components to polling maps

      const permissions = getPermissions(componentType);
      if (!permissions) {
        // Should never happen due to hasPermissions check above
        throw new Error(
          `Permissions unexpectedly undefined for ${componentType}`
        );
      }

      // Add to polling maps based on permissions
      if (permissions.componentProgress) {
        componentProgressPolling.set(componentId, componentType);
      }

      if (permissions.overallProgress) {
        overallProgressPolling.set(componentId, componentType);
      }

      if (permissions.navigation) {
        navigationPolling.set(componentId, componentType);
      }

      if (permissions.settings) {
        settingsPolling.set(componentId, componentType);
      }
    } catch (err) {
      // Component code bug - isolate and skip this component
      // Page continues loading with remaining components
      console.error(
        `⚠️ Component ${componentId} (${componentType}) failed to instantiate - skipping:`,
        err
      );
      // Continue to next component without adding to cores or polling maps
      continue;
    }
  }

  console.log(`✅ Created ${componentCores.size} component cores`);
  console.log(
    `   - componentProgress: ${componentProgressPolling.size} allowed`
  );
  console.log(`   - overallProgress: ${overallProgressPolling.size} allowed`);
  console.log(`   - navigation: ${navigationPolling.size} allowed`);
  console.log(`   - settings: ${settingsPolling.size} allowed`);

  // ========================================================================
  // PHASE 4: Hand cores to coordinator for UI management
  // ========================================================================

  componentCoordinator.beginPageLoad(componentCores).catch((err) => {
    console.error("Component coordinator failed:", err);
  });

  // ========================================================================
  // PHASE 5: Return polling maps to runCore
  // ========================================================================

  return {
    componentCores,
    componentProgressPolling,
    overallProgressPolling,
    navigationPolling,
    settingsPolling,
  };
}
