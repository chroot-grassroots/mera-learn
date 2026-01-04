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
 * 2. initializationOrchestrator() called (YAML parse, progress loading, user decisions, core launch)
 * 3. Independent cycles begin (polling, saving, cleanup)
 * 
 * This module is the bridge between one-time initialization and continuous operation.
 */

import { orchestrateProgressLoading, RecoveryScenario, type ProgressLoadResult } from './progressLoader.js';
import { loadAndParseAllLessons } from './yamlParser.js';
import type { ParsedLessonData } from '../core/parsedLessonData.js';
import { showUserMessage, flashSuccess } from '../ui/userMessage.js';
import { MeraBridge } from '../solid/meraBridge.js';
import { SaveManager } from '../persistence/saveManager.js';
import { SaveCleaner } from '../persistence/saveCleaner.js';
import { showCriticalError } from '../ui/errorDisplay.js';
import { startCore } from '../core/startCore.js';

// ============================================================================
// MAIN ORCHESTRATION
// ============================================================================

/**
 * Orchestrate remaining initialization phases after bootstrap.
 * 
 * Called by bootstrap.ts as the final step. Coordinates:
 * - YAML lesson parsing (loaded once, used everywhere)
 * - Session file detection (distinguishes new users from catastrophic data loss)
 * - Progress loading from Solid Pod and localStorage
 * - User decision dialogs for recovery quality issues
 * - Background service startup (SaveManager, SaveCleaner)
 * - Core application launch with validated progress and lesson configs
 * 
 * After this function completes, the application runs independently via
 * polling cycles. This function does not return until the app is running
 * or the user has chosen to stop.
 * 
 * @throws Error if YAML parsing fails (critical - cannot proceed)
 * @throws Error if progressLoader returns null (bootstrap authentication failure)
 */
export async function initializationOrchestrator(): Promise<void> {
  console.log('🎯 Starting initialization orchestration...');
  
  // Phase 0: Load lesson configs (used by both progressLoader and Core)
  console.log('📚 Phase 0: Loading lesson configurations...');
  const rawLessons = await loadAndParseAllLessons();
  
  // Transform to ParsedLessonData format (flatten components from all pages)
  // ParsedLessonData is readonly - this is immutable preprocessed curriculum data
  const lessonConfigs: Map<number, ParsedLessonData> = new Map(
    Array.from(rawLessons.entries()).map(([id, lesson]) => {
      // Flatten all components from all pages into single array
      const components = lesson.pages.flatMap(page => page.components);
      
      return [id, {
        metadata: lesson.metadata,
        pages: lesson.pages,
        components: components
      }];
    })
  );
  
  console.log(`✅ Loaded ${lessonConfigs.size} lesson configurations`);
  
  // Phase 1: Check for session protection file (distinguishes new user from catastrophic loss)
  console.log('🔍 Phase 1: Checking session protection file...');
  const sessionFileExists = await checkSessionFileExists();
  console.log(`Session file exists: ${sessionFileExists}`);
  
  // Phase 2: Load and validate progress
  console.log('📦 Phase 2: Loading progress...');
  const loadResult = await orchestrateProgressLoading(lessonConfigs);
  
  if (loadResult === null) {
    // This should never happen - bootstrap validates authentication
    // If we reach here, something went very wrong
    showCriticalError({
      title: 'Authentication Failure',
      message: 'Cannot proceed - user authentication state is invalid. This indicates a critical bootstrap failure.',
      technicalDetails: 'progressLoader returned null despite bootstrap authentication check'
    });
    throw new Error('Authentication failure after bootstrap - critical error');
  }
  
  // Phase 3: Evaluate recovery scenario and make user decisions
  console.log('🤔 Phase 3: Evaluating recovery scenario...');
  const shouldProceed = await handleRecoveryScenario(loadResult, sessionFileExists);
  
  if (!shouldProceed) {
    // User chose to stop - show support information
    await showStopDialog();
    return; // Halt initialization - app remains frozen on stop dialog
  }
  
  // Phase 4: Start background services
  console.log('⚙️ Phase 4: Starting background services...');
  SaveManager.getInstance(); // Starts automatically on instantiation
  SaveCleaner.getInstance(); // Starts automatically on instantiation
  console.log('✅ Background services started');
  
  // Phase 5: Launch core application
  console.log('🚀 Phase 5: Launching core...');
  startCore(loadResult.bundle, lessonConfigs).then(
    () => {
      console.log('✅ Core started successfully');
    },
    (error) => {
      console.error('❌ Core initialization failed:', error);
      showCriticalError({
        title: 'Core Initialization Failed',
        message: 'The application failed to start.',
        technicalDetails: error instanceof Error ? error.message : String(error)
      });
    }
  );
  
  console.log('✅ Initialization complete - core launching independently');
}

// ============================================================================
// SESSION FILE DETECTION
// ============================================================================

/**
 * Check if session protection file exists in user's Pod.
 * 
 * This file is created on first save and indicates the user has previously
 * used Mera successfully. Its existence helps distinguish:
 * - New user (no file) vs catastrophic data loss (file exists but no progress)
 * 
 * @returns true if session file exists, false otherwise
 */
async function checkSessionFileExists(): Promise<boolean> {
  const bridge = MeraBridge.getInstance();
  const SESSION_FILE_PATH = 'mera_concurrent_session_protection.json';
  
  try {
    const result = await bridge.solidLoad(SESSION_FILE_PATH);
    return result.success;
  } catch (error) {
    // File doesn't exist or other error - treat as non-existent
    return false;
  }
}

// ============================================================================
// RECOVERY SCENARIO HANDLING
// ============================================================================

/**
 * Handle recovery scenario and get user decision on whether to proceed.
 * 
 * Different scenarios require different user communication:
 * - Perfect recovery: Brief success flash, auto-proceed
 * - Degraded recovery: Warning with details, user choice
 * - Catastrophic loss: Error with support contact, user choice
 * - New user: Silent proceed (no UI needed)
 * 
 * @param loadResult - Progress loading result with scenario classification
 * @param sessionFileExists - Whether session protection file exists in Pod
 * @returns true if should proceed with initialization, false if user chose to stop
 */
async function handleRecoveryScenario(
  loadResult: ProgressLoadResult,
  sessionFileExists: boolean
): Promise<boolean> {
  const { scenario, recoveryMetrics } = loadResult;
  
  // Handle catastrophic data loss (session exists but no usable progress)
  if (scenario === RecoveryScenario.DEFAULT_NO_SAVES && sessionFileExists) {
    return await handleCatastrophicLoss();
  }
  
  if (scenario === RecoveryScenario.DEFAULT_FAILED_RECOVERY && sessionFileExists) {
    return await handleCatastrophicLoss();
  }
  
  if (scenario === RecoveryScenario.DEFAULT_WEBID_MISMATCH && sessionFileExists) {
    return await handleCatastrophicLoss();
  }
  
  // Handle degraded recovery (corruption or significant data loss)
  if (scenario === RecoveryScenario.IMPERFECT_RECOVERY_CORRUPTION) {
    return await handleDegradedRecovery(recoveryMetrics);
  }
  
  // Handle clean scenarios (no user decision needed)
  if (scenario === RecoveryScenario.PERFECT_RECOVERY) {
    await flashSuccess('Progress loaded ✓', 1500);
    return true;
  }
  
  if (scenario === RecoveryScenario.IMPERFECT_RECOVERY_MIGRATION) {
    // Migration without corruption - proceed with brief notification
    await flashSuccess('Progress loaded ✓', 1500);
    return true;
  }
  
  if (scenario === RecoveryScenario.DEFAULT_NO_SAVES && !sessionFileExists) {
    // Truly new user - proceed silently
    console.log('New user - proceeding with default progress');
    return true;
  }
  
  // Fallback for any unhandled scenarios
  console.warn(`Unhandled recovery scenario: ${scenario}`);
  return true;
}

/**
 * Handle catastrophic data loss scenario.
 * 
 * User had previous saves (session file exists) but we couldn't recover
 * any usable data. This is a serious issue that requires user attention.
 * 
 * @returns true if user chose "Start Fresh", false if user chose "Stop Mera"
 */
async function handleCatastrophicLoss(): Promise<boolean> {
  const choice = await showUserMessage(
    'Data Recovery Failed',
    'We found evidence you\'ve used Mera before, but couldn\'t recover any of your progress. This is unusual and may indicate a serious issue.\n\nYou can start fresh with empty progress, or stop Mera to prevent further changes and contact support for manual recovery assistance.',
    'Start Fresh',
    'Stop Mera'
  );
  
  return choice === 'primary'; // true if "Start Fresh", false if "Stop Mera"
}

/**
 * Handle degraded recovery scenario.
 * 
 * We recovered progress but with some corruption or data loss. User should
 * be informed and given the choice to proceed or stop for manual recovery.
 * 
 * @param metrics - Recovery metrics showing what was lost/corrupted
 * @returns true if user chose "Proceed", false if user chose "Stop"
 */
async function handleDegradedRecovery(metrics: ProgressLoadResult['recoveryMetrics']): Promise<boolean> {
  // Build summary of issues
  const issues: string[] = [];
  
  if (metrics.overallProgress.lessonsLostToCorruption > 0) {
    issues.push(`${metrics.overallProgress.lessonsLostToCorruption} lessons lost to corruption`);
  }
  
  if (metrics.combinedComponentProgress.componentsDefaulted > 0) {
    issues.push(`${metrics.combinedComponentProgress.componentsDefaulted} components reset to defaults`);
  }
  
  if (metrics.settings.defaultedRatio > 0) {
    issues.push('Some settings were reset');
  }
  
  const issuesSummary = issues.length > 0 
    ? issues.join(', ') 
    : 'Some data required recovery';
  
  const choice = await showUserMessage(
    'Progress Recovered with Issues',
    `We recovered your progress but encountered some problems:\n\n${issuesSummary}\n\nYou can proceed with this recovered data, or stop Mera to contact support for manual recovery assistance. If you proceed, we'll save your current state as a backup, so manual recovery will still be possible later if needed.`,
    'Proceed',
    'Stop Mera'
  );
  
  return choice === 'primary'; // true if "Proceed", false if "Stop Mera"
}

/**
 * Show "stopped" dialog with support information.
 * 
 * Final dialog after user chose to stop. Explains the situation and
 * provides support contact info. Includes refresh button to restart
 * if they change their mind.
 */
async function showStopDialog(): Promise<void> {
  await showUserMessage(
    'Mera Stopped',
    'Stopping Mera prevents further changes to your data.\n\nFor manual recovery help, email support@meralearn.org.\n\nNote: If you choose to try recovery later, we\'ll save your current state as a backup before proceeding, so manual recovery will still be possible.',
    'Refresh to Restart'
  );
  
  // User clicked refresh - reload the page
  window.location.reload();
}