/**
 * @fileoverview Background backup cleanup with time-bracketed retention
 * @module persistence/saveCleaner
 *
 * Maintains temporal diversity in backup files through intelligent age-based
 * consolidation. Preserves recovery points at multiple time scales while
 * preventing unlimited storage accumulation.
 * 
 * Runs as fire-and-forget singleton, cleaning both localStorage and Solid Pod
 * backups every 60 seconds. Never deletes files less than 1 minute old,
 * ensuring zero collision with SaveOrchestrator.
 */

import { MeraBridge } from "../solid/meraBridge.js";
import { showCriticalError } from "../ui/errorDisplay.js";

/**
 * Represents a timestamped backup file with age calculation.
 */
interface BackupFile {
  /** Full filename including extension */
  filename: string;
  /** Unix timestamp extracted from filename */
  timestamp: number;
  /** Age in milliseconds from current time */
  ageMs: number;
}

/**
 * Background service managing time-bracketed backup retention.
 * 
 * Implements conditional deletion strategy that preserves temporal diversity:
 * only consolidates older time brackets when newer brackets have coverage.
 * This ensures graceful transition when resuming activity after idle periods,
 * preventing loss of historical recovery points before new ones are established.
 * 
 * Maintains minimum 4 backups at all times for corruption recovery.
 * 
 * @example
 * ```ts
 * // Start cleanup service (typically in initialization)
 * SaveCleaner.getInstance();
 * // Service runs automatically every 60 seconds
 * ```
 */
class SaveCleaner {
  private constructor() {
    this.startCleaning();
  }

  /**
   * Begins cleanup interval. Called automatically by constructor.
   * 
   * Runs cleanup every 60 seconds as fire-and-forget operations.
   * Errors are logged but do not stop the interval.
   */
  startCleaning() {
    setInterval(() => this.clean(), 60 * 1000);
  }

  private static instance: SaveCleaner;

  /**
   * Gets singleton instance, creating and starting it if needed.
   * 
   * @returns The global SaveCleaner instance
   */
  static getInstance(): SaveCleaner {
    if (!SaveCleaner.instance) {
      SaveCleaner.instance = new SaveCleaner();
    }
    return SaveCleaner.instance;
  }

  /**
   * Triggers cleanup for both storage locations in parallel.
   * 
   * Fire-and-forget pattern with error handling. Cleanup failures
   * are logged but don't block the interval or crash the app.
   */
  private clean() {
    const timestamp = Date.now();
    this.cleanSolid(timestamp).catch(err => 
      console.error('Solid cleanup failed:', err)
    );
    this.cleanLocal(timestamp).catch(err => 
      console.error('Local cleanup failed:', err)
    );
  }

  /**
   * Cleans Solid Pod backups using time-bracket retention strategy.
   * 
   * Treats primary/duplicate pairs as single units. Lists only primaries (.sp.)
   * for bracket logic, but deletes both primary and duplicate together.
   * 
   * Enforces minimum 4 backup pairs. Applies conditional deletion to preserve
   * temporal diversity during transition periods.
   * 
   * After bracket-based cleanup, removes orphaned duplicates older than 24 hours.
   * 
   * @param timestamp - Current time in milliseconds for age calculation
   */
  private async cleanSolid(timestamp: number): Promise<void> {
    const bridge = MeraBridge.getInstance();
    
    // List only primary files for counting and bracket logic
    // Pattern matches: mera.{version}.sp.{timestamp}.json
    const result = await bridge.solidList("mera.*.*.*.sp.*.json");
    
    if (!result.success || !result.data) {
        console.error('Failed to list Solid backups:', result.error);
        return;
    }
    
    const primaryFiles = result.data;
    
    // Enforce minimum backup pair count (4 primaries = 4 pairs)
    if (primaryFiles.length <= 4) {
      console.log("Skipping Solid cleanup: minimum 4 backups maintained");
      return;
    }

    const backups = this.parseBackupFiles(primaryFiles, timestamp);
    const toDelete = this.selectFilesForDeletion(backups);
    
    // Delete primary and duplicate together as a unit
    for (const primaryFilename of toDelete) {
      if (await this.canDeleteSolid()) {
        // Derive duplicate filename by replacing .sp. with .sd.
        const dupFilename = primaryFilename.replace('.sp.', '.sd.');
        
        // Delete both files in the pair
        const primaryResult = await bridge.solidDelete(primaryFilename);
        if (!primaryResult.success) {
          console.error(`Failed to delete ${primaryFilename}:`, primaryResult.error);
        }
        
        const dupResult = await bridge.solidDelete(dupFilename);
        if (!dupResult.success) {
          console.error(`Failed to delete ${dupFilename}:`, dupResult.error);
        }
      } else {
        // Minimum count reached, stop cleanup
        break;
      }
    }
    
    // Clean up orphaned duplicates older than 24 hours
    await this.cleanOrphanedDuplicates('solid', timestamp);
  }

  /**
   * Cleans localStorage backups using time-bracket retention strategy.
   * 
   * Treats primary/duplicate pairs as single units. Lists both offline (.lofp.)
   * and online (.lonp.) primaries together, as both represent local backup history.
   * 
   * Why treat them together: Offline files persist if device stays offline,
   * online files replace them after Pod sync. Both contribute to the same
   * local recovery point timeline.
   * 
   * Enforces minimum 4 backup pairs. Applies conditional deletion strategy.
   * 
   * After bracket-based cleanup, removes orphaned duplicates older than 24 hours.
   * 
   * @param timestamp - Current time in milliseconds for age calculation
   */
  private async cleanLocal(timestamp: number): Promise<void> {
    const bridge = MeraBridge.getInstance();
    
    // List both offline and online primary files
    // This will need two separate list calls since pattern can't easily match both
    const offlineResult = await bridge.localList("mera.*.*.*.lofp.*.json");
    const onlineResult = await bridge.localList("mera.*.*.*.lonp.*.json");
    
    if (!offlineResult.success || !offlineResult.data) {
        console.error('Failed to list local offline backups:', offlineResult.error);
        return;
    }
    
    if (!onlineResult.success || !onlineResult.data) {
        console.error('Failed to list local online backups:', onlineResult.error);
        return;
    }
    
    // Combine both types into single list for unified retention policy
    const primaryFiles = [...offlineResult.data, ...onlineResult.data];
    
    // Enforce minimum backup pair count (4 primaries = 4 pairs)
    if (primaryFiles.length <= 4) {
      console.log("Skipping local cleanup: minimum 4 backups maintained");
      return;
    }

    const backups = this.parseBackupFiles(primaryFiles, timestamp);
    const toDelete = this.selectFilesForDeletion(backups);
    
    // Delete primary and duplicate together as a unit
    for (const primaryFilename of toDelete) {
      if (await this.canDeleteLocal()) {
        // Derive duplicate filename by replacing .lofp. or .lonp. with .lofd. or .lond.
        const dupFilename = primaryFilename.replace('.lofp.', '.lofd.').replace('.lonp.', '.lond.');
        
        // Delete both files in the pair
        const primaryResult = await bridge.localDelete(primaryFilename);
        if (!primaryResult.success) {
          console.error(`Failed to delete ${primaryFilename}:`, primaryResult.error);
        }
        
        const dupResult = await bridge.localDelete(dupFilename);
        if (!dupResult.success) {
          console.error(`Failed to delete ${dupFilename}:`, dupResult.error);
        }
      } else {
        // Minimum count reached, stop cleanup
        break;
      }
    }
    
    // Clean up orphaned duplicates older than 24 hours
    await this.cleanOrphanedDuplicates('local', timestamp);
  }

  /**
   * Parses backup filenames into structured objects with age calculation.
   * 
   * Extracts Unix timestamp from filename pattern:
   * "mera.{major}.{minor}.{patch}.{type}.{timestamp}.json"
   * 
   * Examples:
   * - mera.0.1.0.sp.1234567890.json (Solid primary)
   * - mera.0.1.0.lofp.1234567890.json (Local offline primary)
   * - mera.0.1.0.lonp.1234567890.json (Local online primary)
   * 
   * Calculates age relative to current time. Invalid filenames are filtered out.
   * 
   * @param filenames - Array of backup filenames to parse
   * @param currentTime - Current timestamp for age calculation
   * @returns Sorted array of backup objects, oldest first
   */
  private parseBackupFiles(filenames: string[], currentTime: number): BackupFile[] {
    return filenames
      .map(filename => {
        // Extract timestamp from "mera.{version}.{type}.{timestamp}.json"
        // Pattern matches version numbers, type code, and timestamp
        const match = filename.match(/mera\.\d+\.\d+\.\d+\.[a-z]+\.(\d+)\.json/);
        if (!match) return null;
        
        const timestamp = parseInt(match[1]);
        const ageMs = currentTime - timestamp;
        
        return { filename, timestamp, ageMs };
      })
      .filter((backup): backup is BackupFile => backup !== null)
      .sort((a, b) => a.timestamp - b.timestamp); // Oldest first for safe deletion order
  }

  /**
   * Selects files for deletion using conditional time-bracket strategy.
   * 
   * Time brackets (newest to oldest):
   * - <1 minute: Keep ALL (active saves, never delete)
   * - 1-10 minutes: Keep newest only (consolidate when recent bracket populated)
   * - 10 minutes-1 hour: Keep newest only (consolidate when 1-10min bracket populated)
   * - 1-24 hours: Keep newest only (consolidate when 10min-1hr bracket populated)
   * - >24 hours: Delete all (consolidate when 1-24hr bracket populated)
   * 
   * This conditional deletion preserves temporal diversity during idle-to-active
   * transitions. Old stratified backups remain until new recovery points establish.
   * 
   * @param backups - Sorted array of backup files with age data
   * @returns Array of filenames selected for deletion
   */
  private selectFilesForDeletion(backups: BackupFile[]): string[] {
    const oneMin = 60 * 1000;
    const tenMin = 10 * oneMin;
    const oneHour = 60 * oneMin;
    const twentyFourHours = 24 * oneHour;
    
    // Group backups into time brackets
    const brackets = {
      ancient: backups.filter(b => b.ageMs > twentyFourHours),
      day: backups.filter(b => b.ageMs > oneHour && b.ageMs <= twentyFourHours),
      hour: backups.filter(b => b.ageMs > tenMin && b.ageMs <= oneHour),
      tenMin: backups.filter(b => b.ageMs > oneMin && b.ageMs <= tenMin),
      recent: backups.filter(b => b.ageMs <= oneMin)
    };
    
    const toDelete: BackupFile[] = [];
    
    // Conditional deletion: only consolidate older brackets when younger ones have coverage
    
    // Only consolidate ancient (>24hr) if 1-24hr bracket has files
    if (brackets.day.length > 0) {
      toDelete.push(...brackets.ancient);
    }
    
    // Only consolidate 1-24hr bracket if 10min-1hr bracket has files
    if (brackets.hour.length > 0) {
      toDelete.push(...brackets.day.slice(0, -1));
    }
    
    // Only consolidate 10min-1hr bracket if 1-10min bracket has files
    if (brackets.tenMin.length > 0) {
      toDelete.push(...brackets.hour.slice(0, -1));
    }
    
    // Only consolidate 1-10min bracket if recent bracket has files
    if (brackets.recent.length > 0) {
      toDelete.push(...brackets.tenMin.slice(0, -1));
    }
    
    // Never delete recent (<1min) files - active save window
    
    return toDelete.map(b => b.filename);
  }

  /**
   * Removes orphaned duplicate files older than 24 hours.
   * 
   * Duplicates are orphaned when their primary doesn't exist (failed delete,
   * corruption, etc). Wait 24 hours before deleting in case they're the only
   * surviving copy.
   * 
   * @param storageType - 'solid' or 'local'
   * @param currentTime - Current timestamp for age calculation
   */
  private async cleanOrphanedDuplicates(
    storageType: 'solid' | 'local',
    currentTime: number
  ): Promise<void> {
    const bridge = MeraBridge.getInstance();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    
    // Get duplicate patterns and functions based on storage type
    const patterns = storageType === 'solid' 
      ? ['mera.*.*.*.sd.*.json']
      : ['mera.*.*.*.lofd.*.json', 'mera.*.*.*.lond.*.json'];
    
    const listFn = storageType === 'solid' ? bridge.solidList : bridge.localList;
    const loadFn = storageType === 'solid' ? bridge.solidLoad : bridge.localLoad;
    const deleteFn = storageType === 'solid' ? bridge.solidDelete : bridge.localDelete;
    
    const toPrimary = (dup: string) => 
      dup.replace('.sd.', '.sp.')
         .replace('.lofd.', '.lofp.')
         .replace('.lond.', '.lonp.');
    
    // Collect all duplicates
    const allDups: string[] = [];
    for (const pattern of patterns) {
      const result = await listFn.call(bridge, pattern);
      if (result.success && result.data) {
        allDups.push(...result.data);
      }
    }
    
    // Check each duplicate
    for (const dup of allDups) {
      const match = dup.match(/\.(\d+)\.json$/);
      if (!match) continue;
      
      const age = currentTime - parseInt(match[1]);
      if (age <= twentyFourHours) continue;
      
      // Check if primary exists
      const primary = toPrimary(dup);
      const primaryExists = await loadFn.call(bridge, primary);
      
      if (!primaryExists.success) {
        await deleteFn.call(bridge, dup);
      }
    }
  }

  /**
   * Checks if Solid Pod backup deletion is safe.
   * 
   * Re-lists primary files to verify count hasn't dropped below minimum.
   * This check happens before each deletion to handle concurrent
   * operations or failed deletes.
   * 
   * @returns True if more than 4 backup pairs exist, false otherwise
   */
  private async canDeleteSolid(): Promise<boolean> {
    const bridge = MeraBridge.getInstance();
    const result = await bridge.solidList("mera.*.*.*.sp.*.json");
    
    if (!result.success || !result.data) {
      return false; // Can't verify count, don't delete
    }
    
    return result.data.length > 4;
  }

  /**
   * Checks if localStorage backup deletion is safe.
   * 
   * Re-lists both offline and online primary files to verify count hasn't
   * dropped below minimum. This check happens before each deletion to handle
   * concurrent operations or failed deletes.
   * 
   * @returns True if more than 4 backup pairs exist, false otherwise
   */
  private async canDeleteLocal(): Promise<boolean> {
    const bridge = MeraBridge.getInstance();
    const offlineResult = await bridge.localList("mera.*.*.*.lofp.*.json");
    const onlineResult = await bridge.localList("mera.*.*.*.lonp.*.json");
    
    if (!offlineResult.success || !offlineResult.data || 
        !onlineResult.success || !onlineResult.data) {
      return false; // Can't verify count, don't delete
    }
    
    const totalPrimaries = offlineResult.data.length + onlineResult.data.length;
    return totalPrimaries > 4;
  }
}

export { SaveCleaner };