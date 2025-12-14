/**
 * @fileoverview Progress bundle merging using trump strategies
 * @module initialization/progressMerger
 * 
 * Merges two PodStorageBundles using trump strategies defined in manager classes.
 * Used for:
 * - Offline/online conflict resolution during initialization
 * 
 * Trump strategies ensure data preservation - they never destroy user progress
 * in favor of empty/default values. Examples:
 * - MAX: Choose higher timestamp or counter value
 * - UNION: Combine arrays preserving all unique values
 * - OR: Choose first non-default value
 * - LATEST_TIMESTAMP: Use value with most recent associated timestamp
 * 
 * The merge is conservative - when in doubt, preserve data rather than discard it.
 */

import type {
  PodStorageBundle,
} from '../persistence/podStorageSchema.js';
import type {
  OverallProgressData,
} from '../core/overallProgressSchema.js';
import type {
  SettingsData,
} from '../core/settingsSchema.js';
import type {
  NavigationState,
} from '../core/navigationSchema.js';
import type {
  CombinedComponentProgress,
} from '../core/combinedComponentProgressSchema.js';
import type { TrumpStrategy } from '../core/coreTypes.js';

// ============================================================================
// OVERALL PROGRESS MERGING
// ============================================================================

/**
 * Merge overall progress using trump strategies.
 * 
 * Applies strategies defined in OverallProgressManager:
 * - lessonCompletions: MAX timestamp per lesson (UNION of all lessons)
 * - domainsCompleted: UNION of arrays
 * - totalLessonsCompleted: Recalculated from merged completions
 * - totalDomainsCompleted: Recalculated from merged domains
 * - currentStreak: LATEST_TIMESTAMP (use lastStreakCheck to determine)
 * - lastStreakCheck: MAX
 * 
 * @param dataA - First progress data
 * @param dataB - Second progress data
 * @returns Merged progress data
 */
function mergeOverallProgress(
  dataA: OverallProgressData,
  dataB: OverallProgressData
): OverallProgressData {
  
  // Merge lessonCompletions: MAX timestamp wins per lesson (UNION of all lessons)
  // Start by copying all completions from dataA
  const mergedCompletions: Record<string, number> = { ...dataA.lessonCompletions };
  
  // Go through each completion from dataB
  // Keep it if the timestamp is newer or if the counterpart in dataA doesn't exist
  for (const [lessonId, timestamp] of Object.entries(dataB.lessonCompletions)) {
    const existingTimestamp = mergedCompletions[lessonId];
    const newTimestamp = timestamp as number;  // Type assertion - we know this is a number from OverallProgressData
    if (!existingTimestamp || newTimestamp > existingTimestamp) {
      mergedCompletions[lessonId] = newTimestamp;
    }
  }
  
  // Merge domainsCompleted: UNION
  const mergedDomains = Array.from(
    new Set([...dataA.domainsCompleted, ...dataB.domainsCompleted])
  );
  
  // Recalculate counters from merged data (not MAX of pre-merge counters)
  // This ensures counters accurately reflect the UNION of completions
  const mergedLessonsCount = Object.keys(mergedCompletions).length;
  const mergedDomainsCount = mergedDomains.length;
  
  // Merge streak: LATEST_TIMESTAMP (use lastStreakCheck to determine which is newer)
  // TODO: Revisit when motivation component is implemented
  const useDataA = dataA.lastStreakCheck >= dataB.lastStreakCheck;
  const mergedStreak = useDataA ? dataA.currentStreak : dataB.currentStreak;
  const mergedStreakCheck = Math.max(dataA.lastStreakCheck, dataB.lastStreakCheck);
  
  return {
    lessonCompletions: mergedCompletions,
    domainsCompleted: mergedDomains,
    totalLessonsCompleted: mergedLessonsCount,
    totalDomainsCompleted: mergedDomainsCount,
    currentStreak: mergedStreak,
    lastStreakCheck: mergedStreakCheck,
  };
}

// ============================================================================
// SETTINGS MERGING
// ============================================================================

/**
 * Merge settings using LATEST_TIMESTAMP strategy.
 * 
 * Settings use LATEST_TIMESTAMP for all fields - whichever bundle was
 * modified more recently wins entirely. This preserves user's most recent
 * preference changes as a cohesive set rather than mixing old and new.
 * 
 * Note: SettingsData doesn't have a lastUpdated field, so we rely on
 * the bundle-level filename timestamp to determine which is newer.
 * The caller (mergeBundles) passes bundleAIsNewer to indicate this.
 * 
 * @param dataA - First settings data
 * @param dataB - Second settings data
 * @param bundleAIsNewer - True if bundleA has more recent timestamp than bundleB
 * @returns Settings from newer source
 */
function mergeSettings(
  dataA: SettingsData,
  dataB: SettingsData,
  bundleAIsNewer: boolean
): SettingsData {
  
  // Use LATEST_TIMESTAMP strategy: newer bundle wins entirely
  return bundleAIsNewer ? dataA : dataB;
}

// ============================================================================
// NAVIGATION STATE MERGING
// ============================================================================

/**
 * Merge navigation state using LATEST_TIMESTAMP strategy.
 * 
 * Uses the navigation state with the most recent lastUpdated timestamp.
 * This preserves the user's most recent navigation position.
 * 
 * @param dataA - First navigation state
 * @param dataB - Second navigation state
 * @returns Merged navigation state
 */
function mergeNavigationState(
  dataA: NavigationState,
  dataB: NavigationState
): NavigationState {
  
  // Use whichever has more recent lastUpdated timestamp
  return dataA.lastUpdated >= dataB.lastUpdated ? dataA : dataB;
}

// ============================================================================
// COMPONENT PROGRESS MERGING
// ============================================================================

/**
 * Merge component progress using trump strategies per component.
 * 
 * Each component type defines its own trump strategies via getAllTrumpStrategies().
 * Common strategies:
 * - ELEMENT_WISE_OR: For checkbox arrays (if either checked, keep checked)
 * - MAX: For counters, scores, attempt counts
 * - LATEST_TIMESTAMP: For timestamped data
 * 
 * This implementation currently uses a simple "keep most complete" heuristic.
 * Full implementation would:
 * 1. Look up component type from registry
 * 2. Get trump strategies from component's progress manager
 * 3. Apply strategies field-by-field
 * 
 * @param dataA - First component progress data
 * @param dataB - Second component progress data
 * @returns Merged component progress data
 */
function mergeCombinedComponentProgress(
  dataA: CombinedComponentProgress,
  dataB: CombinedComponentProgress
): CombinedComponentProgress {
  
  const mergedComponents: Record<string, any> = { ...dataA.components };
  
  // Merge each component from dataB
  for (const [componentId, progressB] of Object.entries(dataB.components)) {
    const progressA = mergedComponents[componentId];
    
    if (!progressA) {
      // Component only exists in B, use it
      mergedComponents[componentId] = progressB;
      continue;
    }
    
    // Both exist - apply component-specific trump strategies
    // TODO: Full implementation would:
    // 1. const componentType = curriculumData.getComponentType(componentId);
    // 2. const strategies = componentTrumpStrategyMap.get(componentType);
    // 3. Apply each strategy field-by-field
    
    // Simple heuristic for now: count non-default values
    const scoreA = countNonDefaultValues(progressA);
    const scoreB = countNonDefaultValues(progressB);
    
    // Keep whichever has more progress
    mergedComponents[componentId] = scoreA >= scoreB ? progressA : progressB;
  }
  
  return {
    components: mergedComponents,
  };
}

/**
 * Count non-default values in component progress (heuristic for "completeness").
 * 
 * Used as simple merge heuristic until full trump strategy implementation.
 * 
 * @param progress - Component progress object
 * @returns Score representing amount of progress
 */
function countNonDefaultValues(progress: any): number {
  let score = 0;
  
  for (const value of Object.values(progress)) {
    if (Array.isArray(value)) {
      // Count true/checked values in arrays
      score += value.filter(v => v === true).length;
    } else if (typeof value === 'number' && value > 0) {
      score += value;
    } else if (typeof value === 'boolean' && value) {
      score += 1;
    } else if (typeof value === 'string' && value.length > 0) {
      score += 1;
    }
  }
  
  return score;
}

// ============================================================================
// TOP-LEVEL BUNDLE MERGING
// ============================================================================

/**
 * Merge two PodStorageBundles using trump strategies.
 * 
 * Merges each section independently:
 * - metadata: Use primary (bundleA)
 * - overallProgress: Merge using trump strategies (UNION + MAX per field)
 * - settings: Use LATEST_TIMESTAMP (newer bundle)
 * - navigationState: Use LATEST_TIMESTAMP (per navigationState.lastUpdated)
 * - combinedComponentProgress: Merge per-component using heuristic
 * 
 * The metadata (webId) is always taken from bundleA (primary).
 * Only user data sections are merged.
 * 
 * @param bundleA - Primary bundle (better quality or has offline work)
 * @param bundleB - Secondary bundle
 * @param bundleAIsNewer - True if bundleA has more recent filename timestamp than bundleB
 * @returns Merged bundle preserving best data from both sources
 */
export function mergeBundles(
  bundleA: PodStorageBundle,
  bundleB: PodStorageBundle,
  bundleAIsNewer: boolean
): PodStorageBundle {
  
  console.log('Merging bundles using trump strategies');
  
  return {
    // Metadata from primary bundle
    metadata: bundleA.metadata,
    
    // Merge user data sections
    overallProgress: mergeOverallProgress(
      bundleA.overallProgress,
      bundleB.overallProgress
    ),
    
    settings: mergeSettings(
      bundleA.settings,
      bundleB.settings,
      bundleAIsNewer
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

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Helper to determine if a value is "default" or "set".
 * 
 * Used in OR strategy to decide which value to keep.
 * Default values are empty/falsy, set values have user data.
 * 
 * @param value - Value to check
 * @returns True if value is considered "default" (empty)
 */
function isDefaultValue(value: any): boolean {
  if (value === null || value === undefined) return true;
  if (value === false) return true;
  if (value === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === 'object' && Object.keys(value).length === 0) return true;
  return false;
}

/**
 * Merge two objects using OR strategy per field.
 * 
 * For each field, uses first non-default value.
 * Useful for settings and preference objects.
 * 
 * @param objA - First object (primary)
 * @param objB - Second object (fallback)
 * @returns Merged object
 */
export function mergeObjectsOR<T extends Record<string, any>>(
  objA: T,
  objB: T
): T {
  const result: any = {};
  
  // Get all keys from both objects
  const allKeys = new Set([...Object.keys(objA), ...Object.keys(objB)]);
  
  for (const key of allKeys) {
    const valueA = objA[key];
    const valueB = objB[key];
    
    // Use A if it's set, otherwise use B
    if (!isDefaultValue(valueA)) {
      result[key] = valueA;
    } else {
      result[key] = valueB;
    }
  }
  
  return result;
}