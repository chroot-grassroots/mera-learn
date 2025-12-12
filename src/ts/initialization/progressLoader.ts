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
 * - When Pod quality is poor (score >= 1000), check localStorage as backup source
 * - Merge Pod + localStorage when offline work exists
 * - Validate merged results to catch counter mismatches
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
// PUBLIC API
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
 */
export async function orchestrateProgressLoading(
  lessonConfigs: Map<number, any>
): Promise<RecoveryResult | null> {
  console.log('Starting progress loading orchestration');
  
  // Get webId from meraBridge session
  const { MeraBridge } = await import('../solid/meraBridge.js');
  const bridge = MeraBridge.getInstance();
  const debugInfo = bridge.getDebugInfo();
  const webId = debugInfo.webId;
  
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
  
  /** Original backup metadata */
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
  
  /** All settings defaulted (binary penalty) */
  SETTINGS_DEFAULTED: 1_000,
  
  /** Per component defaulted (migration or corruption) */
  COMPONENT_DEFAULTED: 5,
  
  /** Per backup step back in time (recency tie-breaker) */
  BACKUP_STEP: 300,
  
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
 * Enumerates primary backup files from Pod using meraBridge.
 * Filename format: mera.{version}.sp.{timestamp}.json
 * 
 * @returns Array of backup metadata, sorted newest first
 */
async function listPodBackups(): Promise<Backup[]> {
  const { MeraBridge } = await import('../solid/meraBridge.js');
  const bridge = MeraBridge.getInstance();
  
  // List primary Solid Pod backups (*.sp.* = Solid Primary)
  const result = await bridge.solidList('mera.*.*.*.sp.*.json');
  
  if (!result.success || !result.data) {
    console.error('Failed to list Pod backups:', result.error);
    return [];
  }
  
  // Parse and sort backups
  const backups = result.data.map(filename => parseBackupFilename(filename, 'pod'));
  backups.sort((a, b) => b.timestamp - a.timestamp); // Newest first
  
  return backups;
}

/**
 * List all backup files from localStorage.
 * 
 * Enumerates both offline and online primary localStorage backups.
 * Filename formats:
 * - mera.{version}.lofp.{timestamp}.json (offline primary)
 * - mera.{version}.lonp.{timestamp}.json (online primary)
 * 
 * @returns Array of backup metadata, sorted newest first
 */
async function listLocalStorageBackups(): Promise<Backup[]> {
  const { MeraBridge } = await import('../solid/meraBridge.js');
  const bridge = MeraBridge.getInstance();
  
  // List offline primary backups (*.lofp.* = Local Offline Primary)
  const offlineResult = await bridge.localList('mera.*.*.*.lofp.*.json');
  
  // List online primary backups (*.lonp.* = Local Online Primary)
  const onlineResult = await bridge.localList('mera.*.*.*.lonp.*.json');
  
  const allBackups: Backup[] = [];
  
  if (offlineResult.success && offlineResult.data) {
    const offlineBackups = offlineResult.data.map(filename => 
      parseBackupFilename(filename, 'localStorage')
    );
    allBackups.push(...offlineBackups);
  } else if (!offlineResult.success) {
    console.error('Failed to list offline localStorage backups:', offlineResult.error);
  }
  
  if (onlineResult.success && onlineResult.data) {
    const onlineBackups = onlineResult.data.map(filename => 
      parseBackupFilename(filename, 'localStorage')
    );
    allBackups.push(...onlineBackups);
  } else if (!onlineResult.success) {
    console.error('Failed to list online localStorage backups:', onlineResult.error);
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
 * - Curriculum changes (defaulted lessons): 1,000 per lesson  
 * - Settings loss: 1,000 flat penalty
 * - Component defaulting: 5 per component
 * - Recency: 300 per backup step back
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
  
  // Curriculum reconciliation (lessons dropped from curriculum via lessonsDroppedRatio)
  const lessonsDropped = Math.round(
    result.recoveryMetrics.overallProgress.lessonsDroppedRatio * 100
  );
  score += lessonsDropped * SCORING.LESSON_DEFAULTED;
  
  // Settings defaulting (binary penalty)
  if (result.recoveryMetrics.settings.defaultedRatio > 0) {
    score += SCORING.SETTINGS_DEFAULTED;
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
 * the merged result. Falls back to primary if merge creates counter mismatches.
 * 
 * @param primary - Primary scored result (better quality or has offline tag)
 * @param secondary - Secondary scored result
 * @param webId - Expected user WebID
 * @param lessonConfigs - Parsed lesson configs for component validation
 * @returns Validated merged result, or primary on validation failure
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
    console.warn(
      'Merge created corruption (counter mismatch), falling back to primary source',
      {primary: primary.backup.filename, secondary: secondary.backup.filename }
    );
    return primary.result;
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
  
  // CASE 2: Pod backup has issues (score >= 1000)
  console.log('Pod backup has quality issues, checking localStorage as backup source');
  
  if (bestLocal.score < bestPod.score) {
    // localStorage is better quality
    if (hasOfflineTag(bestLocal.backup)) {
      console.log('localStorage is better AND has offline work, merging');
      return validateAndMerge(bestLocal, bestPod, webId, lessonConfigs);
    } else {
      console.log('localStorage is better but stale, using as backup source');
      return bestLocal.result;  // Just use localStorage, don't merge with worse Pod
    }
  }
  
  // localStorage isn't better, use Pod despite issues
  console.log('Pod is best option despite quality issues');
  return bestPod.result;
}