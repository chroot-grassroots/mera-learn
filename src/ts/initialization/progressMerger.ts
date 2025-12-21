/**
 * @fileoverview Progress bundle merging using timestamp-based conflict resolution
 * @module initialization/progressMerger
 * 
 * Merges two PodStorageBundles using timestamp comparison for conflict resolution.
 * Used for offline/online conflict resolution during initialization.
 * 
 * Architecture:
 * - Each data structure carries its own timestamp(s)
 * - Merge logic: newest timestamp wins
 * - No field-level heuristics, no complex strategies
 * 
 * How timestamps work:
 * - Settings: Each field is [value, timestamp] tuple - per-field resolution
 * - Navigation: Single lastUpdated for whole state
 * - OverallProgress: CompletionData with lastUpdated per lesson/domain
 * - Components: Single lastUpdated per component (entire state is atomic)
 * 
 * The merge is conservative - it preserves user data by taking the most
 * recent version of each independent piece.
 */

import type { PodStorageBundle } from '../persistence/podStorageSchema.js';
import type { OverallProgressData, CompletionData } from '../core/overallProgressSchema.js';
import type { SettingsData } from '../core/settingsSchema.js';
import type { NavigationState } from '../core/navigationSchema.js';
import type { CombinedComponentProgress } from '../core/combinedComponentProgressSchema.js';

// ============================================================================
// OVERALL PROGRESS MERGING
// ============================================================================

/**
 * Merge overall progress using per-item timestamp comparison.
 * 
 * PRECONDITION: Both dataA and dataB have been reconciled against the curriculum
 * by progressIntegrity.ts, so they contain identical lesson/domain IDs.
 * 
 * Each lesson and domain completion has CompletionData with:
 * - firstCompleted: timestamp of first completion (null if incomplete)
 * - lastUpdated: timestamp of most recent state change
 * 
 * Merge strategy:
 * - For each lesson/domain, compare lastUpdated timestamps
 * - Take the CompletionData with the newer lastUpdated
 * - Recalculate counters from merged completion data
 * 
 * This correctly preserves both completions and incompletions. If a user marks
 * a lesson incomplete on one device (giving it a newer lastUpdated), that state
 * wins over an older completion state from another device.
 * 
 * @param dataA - First progress data (already reconciled)
 * @param dataB - Second progress data (already reconciled)
 * @returns Merged progress data with recalculated counters
 */
function mergeOverallProgress(
  dataA: OverallProgressData,
  dataB: OverallProgressData
): OverallProgressData {
  
  // Merge lessonCompletions: newest lastUpdated wins per lesson
  // Both inputs have same keys after reconciliation, so iterate over dataA
  const mergedLessons: Record<string, CompletionData> = {};
  
  for (const [lessonId, compA] of Object.entries(dataA.lessonCompletions)) {
    const compB = dataB.lessonCompletions[lessonId];
    
    // Newest timestamp wins
    mergedLessons[lessonId] = 
      compA.lastUpdated >= compB.lastUpdated ? compA : compB;
  }
  
  // Merge domainCompletions: same pattern
  const mergedDomains: Record<string, CompletionData> = {};
  
  for (const [domainId, compA] of Object.entries(dataA.domainCompletions)) {
    const compB = dataB.domainCompletions[domainId];
    
    // Newest timestamp wins
    mergedDomains[domainId] = 
      compA.lastUpdated >= compB.lastUpdated ? compA : compB;
  }
  
  // Recalculate counters from merged completion data
  // Count entries where firstCompleted is not null
  const totalLessonsCompleted = Object.values(mergedLessons)
    .filter(c => c.timeCompleted !== null).length;
  const totalDomainsCompleted = Object.values(mergedDomains)
    .filter(c => c.timeCompleted !== null).length;
  
  // Merge streak data: use lastStreakCheck to determine which is newer
  const useDataA = dataA.lastStreakCheck >= dataB.lastStreakCheck;
  const mergedStreak = useDataA ? dataA.currentStreak : dataB.currentStreak;
  const mergedStreakCheck = Math.max(dataA.lastStreakCheck, dataB.lastStreakCheck);
  
  return {
    lessonCompletions: mergedLessons,
    domainCompletions: mergedDomains,
    totalLessonsCompleted,
    totalDomainsCompleted,
    currentStreak: mergedStreak,
    lastStreakCheck: mergedStreakCheck,
  };
}

// ============================================================================
// SETTINGS MERGING
// ============================================================================

/**
 * Merge settings using per-field timestamp comparison.
 * 
 * Settings use [value, timestamp] tuple format for each field.
 * This enables granular conflict resolution - each setting merges independently
 * based on its own timestamp.
 * 
 * For example:
 * - Device A: theme=["dark", 1000], fontSize=["large", 2000]
 * - Device B: theme=["light", 3000], fontSize=["small", 500]
 * - Merged: theme=["light", 3000], fontSize=["large", 2000]
 * 
 * Benefits:
 * - Users may change different settings on different devices
 * - Each preference has independent conflict resolution
 * - No settings are lost due to timestamp of unrelated preference
 * 
 * @param dataA - First settings data
 * @param dataB - Second settings data
 * @returns Settings with per-field newest timestamp
 */
function mergeSettings(
  dataA: SettingsData,
  dataB: SettingsData
): SettingsData {
  
  // Merge each field independently - newest timestamp wins per field
  return {
    weekStartDay: dataA.weekStartDay[1] >= dataB.weekStartDay[1] 
      ? dataA.weekStartDay 
      : dataB.weekStartDay,
    
    weekStartTimeUTC: dataA.weekStartTimeUTC[1] >= dataB.weekStartTimeUTC[1]
      ? dataA.weekStartTimeUTC
      : dataB.weekStartTimeUTC,
    
    theme: dataA.theme[1] >= dataB.theme[1]
      ? dataA.theme
      : dataB.theme,
    
    learningPace: dataA.learningPace[1] >= dataB.learningPace[1]
      ? dataA.learningPace
      : dataB.learningPace,
    
    optOutDailyPing: dataA.optOutDailyPing[1] >= dataB.optOutDailyPing[1]
      ? dataA.optOutDailyPing
      : dataB.optOutDailyPing,
    
    optOutErrorPing: dataA.optOutErrorPing[1] >= dataB.optOutErrorPing[1]
      ? dataA.optOutErrorPing
      : dataB.optOutErrorPing,
    
    fontSize: dataA.fontSize[1] >= dataB.fontSize[1]
      ? dataA.fontSize
      : dataB.fontSize,
    
    highContrast: dataA.highContrast[1] >= dataB.highContrast[1]
      ? dataA.highContrast
      : dataB.highContrast,
    
    reducedMotion: dataA.reducedMotion[1] >= dataB.reducedMotion[1]
      ? dataA.reducedMotion
      : dataB.reducedMotion,
    
    focusIndicatorStyle: dataA.focusIndicatorStyle[1] >= dataB.focusIndicatorStyle[1]
      ? dataA.focusIndicatorStyle
      : dataB.focusIndicatorStyle,
    
    audioEnabled: dataA.audioEnabled[1] >= dataB.audioEnabled[1]
      ? dataA.audioEnabled
      : dataB.audioEnabled,
  };
}

// ============================================================================
// NAVIGATION STATE MERGING
// ============================================================================

/**
 * Merge navigation state using lastUpdated timestamp.
 * 
 * Navigation already had a lastUpdated field tracking position changes.
 * Simple strategy: newest timestamp wins.
 * 
 * This preserves the user's most recent navigation position regardless
 * of which device it came from.
 * 
 * @param dataA - First navigation state
 * @param dataB - Second navigation state
 * @returns Navigation state with newer lastUpdated
 */
function mergeNavigationState(
  dataA: NavigationState,
  dataB: NavigationState
): NavigationState {
  
  // Newest timestamp wins
  return dataA.lastUpdated >= dataB.lastUpdated ? dataA : dataB;
}

// ============================================================================
// COMPONENT PROGRESS MERGING
// ============================================================================

/**
 * Merge component progress using per-component timestamp comparison.
 * 
 * PRECONDITION: Both dataA and dataB have been reconciled against the curriculum
 * by progressIntegrity.ts, so they contain identical component IDs.
 * 
 * Each component has a lastUpdated timestamp. Merge strategy:
 * - Take the entire component with the newer timestamp
 * - Component state is atomic (no field-level merging)
 * 
 * This works because when a user interacts with a component, they update its
 * entire state together, so taking the newest version preserves their most
 * recent interaction.
 * 
 * @param dataA - First component progress data (already reconciled)
 * @param dataB - Second component progress data (already reconciled)
 * @returns Merged component progress data
 */
function mergeCombinedComponentProgress(
  dataA: CombinedComponentProgress,
  dataB: CombinedComponentProgress
): CombinedComponentProgress {
  
  const mergedComponents: Record<string, any> = {};
  
  // Both inputs have same component IDs after reconciliation
  for (const [componentId, progA] of Object.entries(dataA.components)) {
    const progB = dataB.components[componentId];
    
    // Newest timestamp wins entire component
    mergedComponents[componentId] = 
      progA.lastUpdated >= progB.lastUpdated ? progA : progB;
  }
  
  return { components: mergedComponents };
}

// ============================================================================
// TOP-LEVEL BUNDLE MERGING
// ============================================================================

/**
 * Merge two PodStorageBundles using timestamp-based conflict resolution.
 * 
 * Merges each section independently using newest-wins strategy:
 * - metadata: Use primary bundle's metadata (webId should be identical)
 * - overallProgress: Per-lesson/domain timestamp comparison
 * - settings: Per-field timestamp comparison
 * - navigationState: Whole-object timestamp comparison
 * - combinedComponentProgress: Per-component timestamp comparison
 * 
 * @param bundleA - Primary bundle (typically has offline work or better quality)
 * @param bundleB - Secondary bundle
 * @returns Merged bundle preserving most recent data from both sources
 */
export function mergeBundles(
  bundleA: PodStorageBundle,
  bundleB: PodStorageBundle
): PodStorageBundle {
  
  console.log('Merging bundles using timestamp-based conflict resolution');
  
  return {
    // Metadata from primary bundle (webId should be identical in both)
    metadata: bundleA.metadata,
    
    // Merge user data sections using timestamps
    overallProgress: mergeOverallProgress(
      bundleA.overallProgress,
      bundleB.overallProgress
    ),
    
    settings: mergeSettings(
      bundleA.settings,
      bundleB.settings
    ),
    
    navigationState: mergeNavigationState(
      bundleA.navigationState,
      bundleB.navigationState
    ),
    
    combinedComponentProgress: mergeCombinedComponentProgress(
      bundleA.combinedComponentProgress,
      bundleB.combinedComponentProgress
    ),
  };
}