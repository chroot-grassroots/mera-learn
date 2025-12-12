/**
 * @fileoverview Initialization orchestrator - coordinates progress loading and core launch
 * @module initialization/initializationOrchestrator
 * 
 * Called by bootstrap.ts after DOM ready, Solid auth, and UI setup complete.
 * Orchestrates the remaining initialization phases before handing off to the
 * independent polling cycles (Core, SaveManager, SaveCleaner).
 * 
 * Execution flow:
 * 1. bootstrap.ts completes (DOM, auth, UI)
 * 2. initializationOrchestrator() called (YAML parse, progress loading, core launch)
 * 3. Independent cycles begin (polling, saving, cleanup)
 * 
 * This module is the bridge between one-time initialization and continuous operation.
 */

import { orchestrateProgressLoading } from './progressLoader.js';
import { loadAndParseAllLessons } from './yamlParser.js';
import type { ParsedLessonData } from './progressIntegrity.js';

// ============================================================================
// MAIN ORCHESTRATION
// ============================================================================

/**
 * Orchestrate remaining initialization phases after bootstrap.
 * 
 * Called by bootstrap.ts as the final step. Coordinates:
 * - YAML lesson parsing (loaded once, used everywhere)
 * - Progress loading from Solid Pod and localStorage
 * - Core application launch with validated progress and lesson configs
 * 
 * After this function completes, the application runs independently via
 * polling cycles. This function does not return until the app is running.
 * 
 * @throws Error if YAML parsing fails
 * @throws Error if progress loading fails and cannot recover
 * @throws Error if core launch fails
 */
export async function initializationOrchestrator(): Promise<void> {
  console.log('🎯 Starting initialization orchestration...');
  
  // Phase 0: Load lesson configs (used by both progressLoader and Core)
  console.log('📚 Phase 0: Loading lesson configurations...');
  const rawLessons = await loadAndParseAllLessons();
  
  // Transform to ParsedLessonData format (flatten components from all pages)
  const lessonConfigs: Map<number, ParsedLessonData> = new Map();
  for (const [id, lesson] of rawLessons.entries()) {
    // Flatten all components from all pages into single array
    const components = lesson.pages.flatMap(page => page.components);
    
    lessonConfigs.set(id, {
      metadata: lesson.metadata,
      pages: lesson.pages,
      components: components
    });
  }
  
  console.log(`✅ Loaded ${lessonConfigs.size} lesson configurations`);
  
  // Phase 1: Load and validate progress
  console.log('📦 Phase 1: Loading progress...');
  const progressResult = await orchestrateProgressLoading(lessonConfigs);
  
  if (!progressResult) {
    // No valid backups found - initialize as new user
    console.log('👤 No valid backups found, initializing as new user');
    await initializeNewUser(lessonConfigs);
    return;
  }
  
  // Log recovery quality
  if (progressResult.perfectlyValidInput) {
    console.log('✅ Loaded perfect same-version backup');
  } else {
    console.log('⚠️ Loaded backup with migration/recovery:', {
      lessonsLostToCorruption: progressResult.recoveryMetrics.overallProgress.lessonsLostToCorruption,
      lessonsDroppedRatio: progressResult.recoveryMetrics.overallProgress.lessonsDroppedRatio,
      componentsDefaulted: progressResult.recoveryMetrics.combinedComponentProgress.componentsDefaulted,
    });
  }
  
  // Phase 2: Launch core application
  console.log('🚀 Phase 2: Launching core...');
  await launchCore(progressResult.bundle, lessonConfigs);
  
  console.log('✅ Initialization complete - app running');
}

// ============================================================================
// PHASE 2: CORE LAUNCH
// ============================================================================

/**
 * Launch the main application core with validated progress and lesson configs.
 * 
 * Initializes the core application with clean, validated progress data and
 * the parsed lesson configurations. After this completes, the app begins
 * its independent polling cycles.
 * 
 * TODO: Implement core instantiation and lifecycle startup
 * 
 * @param bundle - Validated progress bundle from progressLoader
 * @param lessonConfigs - Parsed lesson configurations (components, pages, metadata)
 */
async function launchCore(
  bundle: any,
  lessonConfigs: Map<number, ParsedLessonData>
): Promise<void> {
  // TODO: Implement core launch
  // - Instantiate Main Application Core with bundle and lessonConfigs
  // - Initialize component registry
  // - Start polling cycle (50ms)
  // - Start SaveManager polling (50ms)
  // - Start SaveCleaner intervals
  // - Render initial UI state
  
  console.warn('launchCore() not yet implemented - core launch is TODO');
  
  // Placeholder: Log that we would launch
  console.log('Core would launch with:', {
    webId: bundle.metadata.webId,
    lessonsCompleted: Object.keys(bundle.overallProgress.lessonCompletions).length,
    componentsCount: Object.keys(bundle.combinedComponentProgress.components).length,
    lessonConfigsAvailable: lessonConfigs.size,
  });
}

// ============================================================================
// NEW USER INITIALIZATION
// ============================================================================

/**
 * Initialize application for new user with no existing progress.
 * 
 * Creates fresh default progress and launches the core. This path is taken
 * when no valid backups exist (new user, or all backups corrupted beyond recovery).
 * 
 * TODO: Implement new user initialization
 * 
 * @param lessonConfigs - Parsed lesson configurations for creating default progress
 */
async function initializeNewUser(
  lessonConfigs: Map<number, ParsedLessonData>
): Promise<void> {
  // TODO: Implement new user initialization
  // - Create default progress bundle using lessonConfigs
  // - Show welcome/onboarding modal?
  // - Launch core with empty progress
  
  console.warn('initializeNewUser() not yet implemented - new user flow is TODO');
  
  // Placeholder: Log that we would initialize
  console.log('Would initialize new user with default progress');
  console.log('Lesson configs available:', lessonConfigs.size);
}