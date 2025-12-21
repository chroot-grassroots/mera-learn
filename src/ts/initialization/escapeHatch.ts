/**
 * @fileoverview Escape hatch backup system for disaster recovery
 * @module initialization/escapeHatch
 * 
 * Creates insurance backups before potentially destructive operations (sanitization
 * or merging). These backups are raw, unvalidated JSON strings saved when:
 * - Data requires sanitization (!perfectlyValidInput)
 * - Offline merge is performed
 * 
 * Escape hatch backups are completely separate from the normal backup system:
 * - Not discovered by progressLoader (different filename pattern)
 * - Not cleaned by SaveCleaner (self-contained cleanup)
 * - Only for manual recovery after buggy releases
 * 
 * Retention: Maximum 20 backups, rate-limited to one per hour to prevent
 * excessive storage usage during repeated page refreshes.
 */

import { CURRENT_SCHEMA_VERSION } from '../persistence/schemaVersion.js';

// ============================================================================
// MODULE EXPORTS
// ============================================================================

/**
 * Create escape hatch backup of raw Pod data.
 * 
 * Saves unvalidated JSON string to Pod with .ehb. filename pattern.
 * Rate-limited to once per hour. Maintains maximum 20 backups.
 * 
 * This is fire-and-forget - failures are logged but don't block initialization.
 * If backup fails, user loses the escape hatch but app continues normally.
 * 
 * @param rawJson - Raw JSON string from Pod backup (unvalidated)
 */
export async function makeEscapeHatchBackup(rawJson: string): Promise<void> {
  try {
    // List existing backups once (used for rate limiting AND cleanup)
    const existingBackups = await listEscapeHatchBackups();
    
    // Check if recent escape hatch already exists (rate limiting)
    if (existingBackups.length > 0) {
      const mostRecent = existingBackups[0];
      const age = Date.now() - mostRecent.timestamp;
      
      if (age < MIN_INTERVAL_MS) {
        console.log('Skipping escape hatch: recent backup exists (< 1 hour old)');
        return;
      }
    }
    
    // Create new escape hatch backup
    const timestamp = Date.now();
    const filename = generateEscapeHatchFilename(timestamp);
    
    const { MeraBridge } = await import('../solid/meraBridge.js');
    const bridge = MeraBridge.getInstance();
    
    // Save raw JSON without validation
    const result = await bridge.solidSave(filename, rawJson);
    
    if (!result.success) {
      console.error('Failed to create escape hatch backup:', result.error);
      return;
    }
    
    console.log(`Escape hatch backup created: ${filename}`);
    
    // Clean up old backups (fire-and-forget)
    // Pass existing list + count for new backup we just created
    cleanupOldEscapeHatches(existingBackups.length + 1, existingBackups).catch(err => {
      console.error('Escape hatch cleanup failed:', err);
    });
    
  } catch (err) {
    console.error('Escape hatch backup failed:', err);
    // Don't throw - this is insurance, not critical path
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum number of escape hatch backups to keep */
const MAX_ESCAPE_HATCHES = 20;

/** Minimum time between escape hatch backups (1 hour in milliseconds) */
const MIN_INTERVAL_MS = 60 * 60 * 1000;

// ============================================================================
// FILENAME GENERATION
// ============================================================================

/**
 * Generate escape hatch backup filename.
 * 
 * Format: mera.{version}.ehb.{timestamp}.json
 * Pattern is distinct from normal backups (.sp., .sd., .lofp., etc)
 * so progressLoader and SaveCleaner won't discover these files.
 * 
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Filename for escape hatch backup
 */
function generateEscapeHatchFilename(timestamp: number): string {
  const v = CURRENT_SCHEMA_VERSION;
  return `mera.${v.major}.${v.minor}.${v.patch}.ehb.${timestamp}.json`;
}

// ============================================================================
// BACKUP ENUMERATION
// ============================================================================

/**
 * Escape hatch backup metadata
 */
interface EscapeHatchBackup {
  /** Filename in Pod */
  filename: string;
  
  /** Unix timestamp in milliseconds from filename */
  timestamp: number;
}

/**
 * List all escape hatch backups from Solid Pod.
 * 
 * @returns Array of escape hatch backups, sorted newest first
 */
async function listEscapeHatchBackups(): Promise<EscapeHatchBackup[]> {
  const { MeraBridge } = await import('../solid/meraBridge.js');
  const bridge = MeraBridge.getInstance();
  
  const result = await bridge.solidList('mera.*.*.*.ehb.*.json');
  
  if (!result.success || !result.data) {
    // Log but don't throw - cleanup failure isn't critical
    if (!result.success) {
      console.warn('Failed to list escape hatch backups:', result.error);
    }
    return [];
  }
  
  // Parse filenames into metadata
  const backups: EscapeHatchBackup[] = result.data
    .map(filename => {
      const match = filename.match(/\.(\d+)\.json$/);
      if (!match) {
        console.warn(`Invalid escape hatch filename: ${filename}`);
        return null;
      }
      
      return {
        filename,
        timestamp: parseInt(match[1], 10)
      };
    })
    .filter((b): b is EscapeHatchBackup => b !== null);
  
  // Sort newest first
  backups.sort((a, b) => b.timestamp - a.timestamp);
  
  return backups;
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Remove old escape hatch backups beyond MAX_ESCAPE_HATCHES limit.
 * 
 * Keeps the 20 most recent backups, deletes the rest.
 * Accepts existing backup count and list to avoid redundant network calls.
 * 
 * @param currentCount - Total number of backups including just-created one
 * @param existingBackups - List of backups before the new one was created
 */
export async function cleanupOldEscapeHatches(
  currentCount: number,
  existingBackups: EscapeHatchBackup[]
): Promise<void> {
  
  if (currentCount <= MAX_ESCAPE_HATCHES) {
    console.log(`Escape hatch cleanup: ${currentCount} backups, under limit`);
    return;
  }
  
  // We need to delete (currentCount - MAX_ESCAPE_HATCHES) backups
  // Since existingBackups is sorted newest-first and we just added one newest,
  // delete from the end of existingBackups list
  const numToDelete = currentCount - MAX_ESCAPE_HATCHES;
  const toDelete = existingBackups.slice(-numToDelete);
  
  console.log(`Escape hatch cleanup: deleting ${toDelete.length} old backups`);
  
  const { MeraBridge } = await import('../solid/meraBridge.js');
  const bridge = MeraBridge.getInstance();
  
  for (const backup of toDelete) {
    const result = await bridge.solidDelete(backup.filename);
    
    if (!result.success) {
      console.error(`Failed to delete escape hatch ${backup.filename}:`, result.error);
      // Continue trying to delete others
    }
  }
  
  console.log('Escape hatch cleanup complete');
}