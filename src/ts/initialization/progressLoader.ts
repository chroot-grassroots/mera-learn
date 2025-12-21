/**
 * @fileoverview Progress loading and backup selection
 * @module initialization/progressLoader
 * 
 * Orchestrates loading user progress from Solid Pod and localStorage backups,
 * selecting the best available backup using quality-based scoring, and handling
 * offline work merging.
 * 
 * Selection strategy:
 * - Perfect same-version backup wins immediately
 * - Score backups by data quality (corruption, defaulting, recency)
 * - When Pod quality is poor (score >= 1000), always merge with localStorage
 * - Merge Pod + localStorage when offline work exists
 * - Validate merged results - throws if merge creates corruption (fail-fast)
 * 
 * Scoring weights prioritize:
 * 1. Lesson completions (precious user achievements)
 * 2. Settings (user preferences)
 * 3. Component progress (ephemeral work-in-progress)
 * 4. Recency (minor tie-breaker)
 */

import { enforceDataIntegrity } from './progressIntegrity.js';
import type { EnforcementResult } from './progressIntegrity.js';
import type { PodStorageBundle } from '../persistence/podStorageSchema.js';
import { mergeBundles } from './progressMerger.js';

// Type alias for consistency with rest of codebase
type RecoveryResult = EnforcementResult;

// ============================================================================
// MODULE EXPORTS
// ============================================================================

/**
 * Orchestrate progress loading from all available sources.
 * 
 * Main entry point for initialization sequence. Gets webId from Solid session,
 * loads lesson configs, enumerates backups from Pod and localStorage, selects
 * best available backup using quality scoring, handles offline work merging,
 * and returns validated bundle ready for use.
 * 
 * @returns Recovery result with validated bundle, or null if no valid backups
 * @throws Error if merge creates corruption (bug in progressMerger)
 */
export async function orchestrateProgressLoading(
  lessonConfigs: Map<number, any>
): Promise<RecoveryResult | null> {
  console.log('Starting progress loading orchestration');
  
  // Get webId from meraBridge session
  const { MeraBridge } = await import('../solid/meraBridge.js');
  const bridge = MeraBridge.getInstance();
  const webId = bridge.getWebId();
  
  if (!webId) {
    console.error('No webId available - user not authenticated');
    return null;
  }
  
  console.log(`Loading progress for webId: ${webId}, with ${lessonConfigs.size} lesson configs`);
  
  // Enumerate all available backups
  const podBackups = await listPodBackups();
  const localBackups = await listLocalStorageBackups();
  
  console.log(`Found ${podBackups.length} Pod backups, ${localBackups.length} localStorage backups`);
  
  // Select best backup using quality scoring
  const result = await selectBestBackup(podBackups, localBackups, webId, lessonConfigs);
  
  if (!result) {
    console.error('No valid backups available');
    return null;
  }
  
  // Log recovery metrics for debugging
  console.log('Progress loading complete:', {
    perfectlyValidInput: result.perfectlyValidInput,
    lessonsLostToCorruption: result.recoveryMetrics.overallProgress.lessonsLostToCorruption,
    lessonsDroppedRatio: result.recoveryMetrics.overallProgress.lessonsDroppedRatio,
    componentsDefaulted: result.recoveryMetrics.combinedComponentProgress.componentsDefaulted,
  });
  
  return result;
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Backup file metadata from storage
 */
interface Backup {
  /** Unix timestamp in milliseconds from filename */
  timestamp: number;
  
  /** Full backup data */
  data: unknown;
  
  /** Source location */
  source: 'pod' | 'localStorage';
  
  /** Original filename */
  filename: string;
}

/**
 * Recovery result with quality score
 */
interface ScoredResult {
  /** Validation/recovery result from progressIntegrity */
  result: RecoveryResult;
  
  /** Quality score (lower = better) */
  score: number;
  
  /** Backup including timestamp, data, source, and filename */
  backup: Backup;
}

// ============================================================================
// SCORING CONFIGURATION
// ============================================================================

/**
 * Scoring penalties for backup quality issues.
 * Lower score = better backup.
 * 
 * Threshold: score >= 1000 triggers localStorage backup check
 */
const SCORING = {
  /** Per lesson lost to corruption (counter mismatch) */
  LESSON_LOST: 20_000,
  
  /** Per lesson removed from curriculum (reconciliation) */
  LESSON_DEFAULTED: 1_000,
  
  /** Baseline penalty for any settings defaulted */
  SETTINGS_BASELINE: 1_000,
  
  /** Additional proportional penalty for settings (scaled by ratio) */
  SETTINGS_PROPORTIONAL: 4_000,
  
  /** Per component defaulted (migration or corruption) */
  COMPONENT_DEFAULTED: 5,
  
  /** Per backup step back in time (recency tie-breaker) */
  BACKUP_STEP: 500,
  
  /** Quality threshold - above this, check localStorage as backup source */
  QUALITY_THRESHOLD: 1000,
} as const;

// ============================================================================
// BACKUP ENUMERATION
// ============================================================================

/**
 * Parse backup filename into metadata.
 * 
 * Expected formats:
 * - Pod: mera.{major}.{minor}.{patch}.sp.{timestamp}.json
 * - localStorage offline: mera.{major}.{minor}.{patch}.lofp.{timestamp}.json
 * - localStorage online: mera.{major}.{minor}.{patch}.lonp.{timestamp}.json
 * 
 * @param filename - Backup filename to parse
 * @param source - Storage source ('pod' or 'localStorage')
 * @returns Parsed backup metadata
 */
function parseBackupFilename(filename: string, source: 'pod' | 'localStorage'): Backup {
  // Extract timestamp from filename
  // Format: mera.X.Y.Z.{type}.{timestamp}.json
  const match = filename.match(/\.(\d+)\.json$/);
  
  if (!match) {
    throw new Error(`Invalid backup filename format: ${filename}`);
  }
  
  const timestamp = parseInt(match[1], 10);
  
  // Placeholder for data - will be loaded on-demand during scoring
  return {
    filename,
    timestamp,
    source,
    data: null as any, // Will load when scoring
  };
}

/**
 * Load backup data from storage.
 * 
 * Lazy-loads backup content when needed for validation/scoring.
 * 
 * @param backup - Backup metadata with filename
 * @returns Loaded backup data, or null on failure
 */
async function loadBackupData(backup: Backup): Promise<unknown | null> {
  const { MeraBridge } = await import('../solid/meraBridge.js');
  const bridge = MeraBridge.getInstance();
  
  const loadFn = backup.source === 'pod' ? bridge.solidLoad : bridge.localLoad;
  const result = await loadFn.call(bridge, backup.filename);
  
  if (!result.success || !result.data) {
    console.error(`Failed to load backup ${backup.filename}:`, result.error);
    return null;
  }
  
  return result.data;
}

/**
 * List all backup files from Solid Pod.
 * 
 * Enumerates both primary and duplicate backup files from Pod using meraBridge.
 * Filename formats:
 * - mera.{version}.sp.{timestamp}.json (primary)
 * - mera.{version}.sd.{timestamp}.json (duplicate)
 * 
 * @returns Array of backup metadata, sorted newest first
 */
async function listPodBackups(): Promise<Backup[]> {
  const { MeraBridge } = await import('../solid/meraBridge.js');
  const bridge = MeraBridge.getInstance();
  
  // List Solid Primary backups (*.sp.* = Solid Primary)
  const primaryResult = await bridge.solidList('mera.*.*.*.sp.*.json');
  
  // List Solid Duplicate backups (*.sd.* = Solid Duplicate)
  const duplicateResult = await bridge.solidList('mera.*.*.*.sd.*.json');
  
  const allBackups: Backup[] = [];
  
  if (primaryResult.success && primaryResult.data) {
    const primaryBackups = primaryResult.data.map(filename => 
      parseBackupFilename(filename, 'pod')
    );
    allBackups.push(...primaryBackups);
  } else if (!primaryResult.success) {
    console.error('Failed to list Pod primary backups:', primaryResult.error);
  }
  
  if (duplicateResult.success && duplicateResult.data) {
    const duplicateBackups = duplicateResult.data.map(filename => 
      parseBackupFilename(filename, 'pod')
    );
    allBackups.push(...duplicateBackups);
  } else if (!duplicateResult.success) {
    console.error('Failed to list Pod duplicate backups:', duplicateResult.error);
  }
  
  // Sort newest first
  allBackups.sort((a, b) => b.timestamp - a.timestamp);
  
  return allBackups;
}

/**
 * List all backup files from localStorage.
 * 
 * Enumerates both primary and duplicate backups, both offline and online.
 * Filename formats:
 * - mera.{version}.lofp.{timestamp}.json (offline primary)
 * - mera.{version}.lofd.{timestamp}.json (offline duplicate)
 * - mera.{version}.lonp.{timestamp}.json (online primary)
 * - mera.{version}.lond.{timestamp}.json (online duplicate)
 * 
 * @returns Array of backup metadata, sorted newest first
 */
async function listLocalStorageBackups(): Promise<Backup[]> {
  const { MeraBridge } = await import('../solid/meraBridge.js');
  const bridge = MeraBridge.getInstance();
  
  // List all four types of localStorage backups
  const offlinePrimaryResult = await bridge.localList('mera.*.*.*.lofp.*.json');
  const offlineDuplicateResult = await bridge.localList('mera.*.*.*.lofd.*.json');
  const onlinePrimaryResult = await bridge.localList('mera.*.*.*.lonp.*.json');
  const onlineDuplicateResult = await bridge.localList('mera.*.*.*.lond.*.json');
  
  const allBackups: Backup[] = [];
  
  // Collect offline primary backups
  if (offlinePrimaryResult.success && offlinePrimaryResult.data) {
    const backups = offlinePrimaryResult.data.map(filename => 
      parseBackupFilename(filename, 'localStorage')
    );
    allBackups.push(...backups);
  } else if (!offlinePrimaryResult.success) {
    console.error('Failed to list offline primary localStorage backups:', offlinePrimaryResult.error);
  }
  
  // Collect offline duplicate backups
  if (offlineDuplicateResult.success && offlineDuplicateResult.data) {
    const backups = offlineDuplicateResult.data.map(filename => 
      parseBackupFilename(filename, 'localStorage')
    );
    allBackups.push(...backups);
  } else if (!offlineDuplicateResult.success) {
    console.error('Failed to list offline duplicate localStorage backups:', offlineDuplicateResult.error);
  }
  
  // Collect online primary backups
  if (onlinePrimaryResult.success && onlinePrimaryResult.data) {
    const backups = onlinePrimaryResult.data.map(filename => 
      parseBackupFilename(filename, 'localStorage')
    );
    allBackups.push(...backups);
  } else if (!onlinePrimaryResult.success) {
    console.error('Failed to list online primary localStorage backups:', onlinePrimaryResult.error);
  }
  
  // Collect online duplicate backups
  if (onlineDuplicateResult.success && onlineDuplicateResult.data) {
    const backups = onlineDuplicateResult.data.map(filename => 
      parseBackupFilename(filename, 'localStorage')
    );
    allBackups.push(...backups);
  } else if (!onlineDuplicateResult.success) {
    console.error('Failed to list online duplicate localStorage backups:', onlineDuplicateResult.error);
  }
  
  // Sort newest first
  allBackups.sort((a, b) => b.timestamp - a.timestamp);
  
  return allBackups;
}

// ============================================================================
// BACKUP SCORING
// ============================================================================

/**
 * Calculate quality score for a backup.
 * 
 * Lower score = better backup. Perfect same-version backup scores 0.
 * 
 * Scoring factors:
 * - Data loss (lesson corruption): 20,000 per lesson
 * - Curriculum changes (defaulted lessons): 600 per lesson  
 * - Settings loss: 1,000 baseline + up to 4,000 proportional
 *   (10% → 1,400 pts, 50% → 3,000 pts, 100% → 5,000 pts)
 * - Component defaulting: 2 per component
 * - Recency: 600 per backup step back
 * 
 * @param result - Recovery result from enforceDataIntegrity
 * @param backupIndex - Position in sorted backup list (0 = newest)
 * @returns Quality score (lower = better)
 */
function scoreBackup(result: RecoveryResult, backupIndex: number): number {
  // Perfect backup wins immediately
  if (result.perfectlyValidInput) {
    return 0;
  }
  
  let score = 0;
  
  // Recency penalty
  score += backupIndex * SCORING.BACKUP_STEP;
  
  // Data corruption (lesson loss via counter mismatch)
  score += result.recoveryMetrics.overallProgress.lessonsLostToCorruption * SCORING.LESSON_LOST;
  
  // Curriculum reconciliation (lessons dropped from curriculum)
  score += result.recoveryMetrics.overallProgress.lessonsDroppedCount * SCORING.LESSON_DEFAULTED;
  
  // Settings defaulting (baseline + proportional penalty)
  // Ensures ANY settings loss is noticed, with scaling for severity
  if (result.recoveryMetrics.settings.defaultedRatio > 0) {
    const settingsBaseline = SCORING.SETTINGS_BASELINE;
    const settingsProportional = Math.round(
      result.recoveryMetrics.settings.defaultedRatio * SCORING.SETTINGS_PROPORTIONAL
    );
    score += settingsBaseline + settingsProportional;
  }
  
  // Component defaulting (expected in migrations, still a minor penalty)
  score += result.recoveryMetrics.combinedComponentProgress.componentsDefaulted * SCORING.COMPONENT_DEFAULTED;
  
  return score;
}

/**
 * Find best backup from sorted list using quality scoring.
 * 
 * Iterates through backups newest-first, loading and scoring each.
 * Stops immediately on finding perfect backup. Otherwise returns lowest-scored.
 * 
 * @param backups - Sorted backups (newest first)
 * @param webId - Expected user WebID
 * @param lessonConfigs - Parsed lesson configs for component validation
 * @returns Best scored result, or null if all backups disqualified
 */
async function scoreSortedBackups(
  backups: Backup[],
  webId: string,
  lessonConfigs: Map<number, any>
): Promise<ScoredResult | null> {
  if (backups.length === 0) {
    return null;
  }
  
  let bestResult: ScoredResult | null = null;
  let bestScore = Infinity;
  
  for (let i = 0; i < backups.length; i++) {
    const backup = backups[i];
    
    // Load backup data
    const data = await loadBackupData(backup);
    if (!data) {
      console.warn(`Skipping backup ${backup.filename}: failed to load`);
      continue;
    }
    
    // meraBridge MUST return strings (verified by saveOrchestrator design)
    // If it returns anything else, that's a bug that should fail loudly
    if (typeof data !== 'string') {
      throw new Error(
        `meraBridge returned non-string data for ${backup.filename}. ` +
        `This is a bug in meraBridge. Expected string, got ${typeof data}`
      );
    }
    
    // Validate and recover backup data
    const result = enforceDataIntegrity(data, webId, lessonConfigs);
    
    // Disqualify wrong-user backups
    if (result.criticalFailures.webIdMismatch) {
      console.warn(`Backup ${backup.filename} is for different user, skipping`);
      continue;
    }
    
    // Score this backup
    const score = scoreBackup(result, i);
    
    // Perfect backup - stop immediately
    if (score === 0) {
      console.log(`Perfect backup found: ${backup.filename}`);
      return { result, score, backup };
    }
    
    // Track best so far (ties go to first/newest via < not <=)
    if (score < bestScore) {
      bestScore = score;
      bestResult = { result, score, backup };
    }
  }
  
  if (bestResult) {
    console.log(`Best backup: ${bestResult.backup.filename} (score: ${bestResult.score})`);
  }
  
  return bestResult;
}

// ============================================================================
// OFFLINE WORK DETECTION
// ============================================================================

/**
 * Check if a backup has the offline work flag.
 * 
 * Offline backups are indicated by filename pattern:
 * - mera.{version}.lofp.{timestamp}.json (Local Offline Primary)
 * 
 * The offline flag is set by SaveManager when Pod saves fail, indicating
 * localStorage contains work done while offline that may not exist in Pod.
 * 
 * @param backup - Backup metadata to check
 * @returns True if offline work exists
 */
function hasOfflineTag(backup: Backup): boolean {
  // Check if filename contains offline indicator (.lofp.)
  return backup.filename.includes('.lofp.');
}

// ============================================================================
// BACKUP MERGING
// ============================================================================

/**
 * Merge and validate two backup results.
 * 
 * Merges bundles using trump strategies from progressMerger, then validates
 * the merged result. Both inputs are already sanitized by enforceDataIntegrity,
 * so any corruption detected after merge indicates a bug in progressMerger.
 * 
 * @param primary - Primary scored result (better quality or has offline tag)
 * @param secondary - Secondary scored result
 * @param webId - Expected user WebID
 * @param lessonConfigs - Parsed lesson configs for component validation
 * @returns Validated merged result
 * @throws Error if merge creates counter mismatches (bug in progressMerger)
 */
async function validateAndMerge(
  primary: ScoredResult,
  secondary: ScoredResult,
  webId: string,
  lessonConfigs: Map<number, any>
): Promise<RecoveryResult> {
  console.log(`Merging ${primary.backup.filename} + ${secondary.backup.filename}`);
  
  // Merge using trump strategies
  const mergedBundle = mergeBundles(
    primary.result.bundle,
    secondary.result.bundle
  );
  
  // Validate merged result (convert back to JSON string for validation)
  const mergedJson = JSON.stringify(mergedBundle);
  const finalResult = enforceDataIntegrity(mergedJson, webId, lessonConfigs);
  
  // Check for merge-induced problems
  if (finalResult.recoveryMetrics.overallProgress.corruptionDetected) {
    // This should NEVER happen - both inputs are sanitized bundles
    // If merge creates corruption, this is a bug in progressMerger
    throw new Error(
      `Merge created corruption (counter mismatch). This is a bug in progressMerger.ts. ` +
      `Primary: ${primary.backup.filename}, Secondary: ${secondary.backup.filename}, ` +
      `Corruption: ${finalResult.recoveryMetrics.overallProgress.lessonsLostToCorruption} lessons lost`
    );
  }
  
  console.log('Merge successful');
  return finalResult;
}

// ============================================================================
// MAIN SELECTION LOGIC
// ============================================================================

/**
 * Select best backup from Pod and localStorage sources.
 * 
 * Strategy:
 * 1. Score best Pod backup
 * 2. If Pod is good quality (score < 1000):
 *    - Use Pod unless localStorage has offline work
 *    - If offline work exists, merge Pod + localStorage
 * 3. If Pod is poor quality (score >= 1000):
 *    - Check localStorage as backup source
 *    - Merge if localStorage is better AND has offline work
 *    - Use localStorage alone if better but stale
 *    - Fall back to Pod if localStorage is worse
 * 
 * @param podBackups - Sorted Pod backups (newest first)
 * @param localBackups - Sorted localStorage backups (newest first)
 * @param webId - Expected user WebID
 * @param lessonConfigs - Parsed lesson configs for component validation
 * @returns Best recovery result, or null if no valid backups
 */
async function selectBestBackup(
  podBackups: Backup[],
  localBackups: Backup[],
  webId: string,
  lessonConfigs: Map<number, any>
): Promise<RecoveryResult | null> {
  
  // Score both sources
  const bestPod = await scoreSortedBackups(podBackups, webId, lessonConfigs);
  const bestLocal = await scoreSortedBackups(localBackups, webId, lessonConfigs);
  
  // Handle missing sources
  if (!bestPod && !bestLocal) {
    console.error('No valid backups found in either Pod or localStorage');
    return null;
  }
  
  if (!bestPod) {
    console.log('No valid Pod backups, using localStorage');
    return bestLocal!.result;
  }
  
  if (!bestLocal) {
    console.log('No valid localStorage backups, using Pod');
    return bestPod.result;
  }
  
  // CASE 1: Pod backup is good quality (score < 1000)
  if (bestPod.score < SCORING.QUALITY_THRESHOLD) {
    // Check for offline work
    if (hasOfflineTag(bestLocal.backup)) {
      console.log('Good Pod backup + offline work detected, merging');
      return validateAndMerge(bestPod, bestLocal, webId, lessonConfigs);
    }
    
    // No offline work, Pod is good quality, use it
    console.log('Good Pod backup, no offline work, using Pod');
    return bestPod.result;
  }
  
  // CASE 2: Pod backup has quality issues (score >= 1000)
  // Always merge - localStorage might have better data that Pod is missing
  console.log('Pod backup has quality issues, merging with localStorage');
  return validateAndMerge(bestLocal, bestPod, webId, lessonConfigs);
}