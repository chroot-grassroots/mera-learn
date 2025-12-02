/**
 * @fileoverview Four-stage save orchestration with verification and cleanup
 * @module persistence/saveOrchestrator
 *
 * Implements defense-in-depth save strategy: save → load → verify.
 * Creates duplicate files at each stage for redundancy.
 * 
 * Four-stage process:
 * 1. Local save tagged "offline" (best effort, allows offline mode)
 * 2. Pod save (critical - determines overall success)
 * 3. Local save tagged "online" (replaces offline files after Pod success)
 * 4. Cleanup offline files (removes temporary offline copies)
 * 
 * Purpose of offline/online is for merge logic for offline progress in initialization logic.
 * 
 * All saves are verified via load-back and string equality check to catch
 * corruption immediately rather than discovering it later during recovery.
 */

import {
  PodStorageBundleSchema,
} from "./podStorageSchema.js";
import { SaveResult } from "./saveManager.js";
import { CURRENT_SCHEMA_VERSION } from "./schemaVersion.js";
import { MeraBridge } from "../solid/meraBridge.js";

/**
 * Filenames for six files created during save process.
 * 
 * Naming convention: mera.{major}.{minor}.{patch}.{type}.{timestamp}.json
 * - lofp/lofd: Local Offline Primary/Duplicate (temporary, pre-Pod-sync)
 * - sp/sd: Solid Primary/Duplicate (Pod backup files)
 * - lonp/lond: Local Online Primary/Duplicate (final localStorage copies)
 */
interface SaveFilenames {
  localOfflinePrimary: string;
  localOfflineDup: string;
  solidPrimary: string;
  solidDup: string;
  localOnlinePrimary: string;
  localOnlineDup: string;
}

/**
 * Orchestrates four-stage verified save process.
 * 
 * Strategy:
 * - Local offline files enable offline mode if Pod unreachable
 * - Pod save is the critical operation determining success/failure
 * - Local online files provide additional redundancy
 * - Duplicates at each stage provide redundancy if primary corrupts
 * 
 * Verification: Every save is immediately loaded back and verified via
 * string equality. Corrupted writes are deleted and reported as failures
 * rather than silently persisting bad data.
 * 
 * @param bundleJSON - Pre-stringified JSON representation of complete progress bundle
 * @param timestamp - Unix timestamp for backup filename generation
 * @returns SaveResult enum indicating which operations succeeded
 */
export async function orchestrateSave(
  bundleJSON: string,
  timestamp: number
): Promise<SaveResult> {
  const fileNames = generateFilenames(timestamp);

  // Stage 1: Local offline save (best effort)
  // Creates temporary offline copies that work without Pod access
  let localOfflineSucceeded = false;
  try {
    await Promise.all([
      saveLoadCheckCleanLocal(fileNames.localOfflinePrimary, bundleJSON),
      saveLoadCheckCleanLocal(fileNames.localOfflineDup, bundleJSON),
    ]);
    localOfflineSucceeded = true;
  } catch (localOfflineError) {
    console.error("Local offline save failed:", localOfflineError);
    // Continue anyway - Pod is what really matters
  }

  // Stage 2: Pod save (critical operation)
  // Pod sync determines overall success. If this fails, entire save fails.
  let podSucceeded = false;
  try {
    await Promise.all([
      saveLoadCheckCleanSolid(fileNames.solidPrimary, bundleJSON),
      saveLoadCheckCleanSolid(fileNames.solidDup, bundleJSON),
    ]);
    podSucceeded = true;
  } catch (podError) {
    console.error("Pod save failed:", podError);
  }

  // If Pod failed, stop here - no point updating local files
  if (!podSucceeded) {
    return localOfflineSucceeded
      ? SaveResult.OnlyLocalSucceeded
      : SaveResult.BothFailed;
  }

  // Stage 3: Local online save (best effort)
  // Pod succeeded, now create final localStorage copies
  try {
    await Promise.all([
      saveLoadCheckCleanLocal(fileNames.localOnlinePrimary, bundleJSON),
      saveLoadCheckCleanLocal(fileNames.localOnlineDup, bundleJSON),
    ]);

    // Stage 4: Cleanup offline files (best effort)
    // Remove temporary offline copies now that online copies exist
    const bridge = MeraBridge.getInstance();
    try {
      await Promise.all([
        bridge.localDelete(fileNames.localOfflinePrimary),
        bridge.localDelete(fileNames.localOfflineDup),
      ]);
    } catch (cleanupError) {
      console.warn("Cleanup failed:", cleanupError);
      // Not critical - orphaned files will be handled by recovery logic
    }

    return SaveResult.BothSucceeded;
  } catch (localOnlineError) {
    console.error("Local online save failed:", localOnlineError);
    // Pod succeeded but local failed - rare edge case
    return SaveResult.OnlySolidSucceeded;
  }
}

/**
 * Saves to localStorage with immediate verification and cleanup on failure.
 * 
 * Process: save → load → string equality check
 * 
 * If any step fails, deletes the corrupted file before throwing.
 * This prevents accumulation of invalid backup files that could
 * interfere with recovery logic.
 * 
 * @param filename - localStorage key for this backup
 * @param bundleJSON - Pre-stringified JSON to save
 * @throws Error if save, load, or equality check fails
 */
async function saveLoadCheckCleanLocal(
  filename: string,
  bundleJSON: string
): Promise<void> {
  const bridge = MeraBridge.getInstance();
  
  try {
    // Save to localStorage
    const saveResult = await bridge.localSave(filename, bundleJSON);
    if (!saveResult.success) {
      throw new Error(saveResult.error || 'Local save failed');
    }

    // Load back immediately for verification
    const loadResult = await bridge.localLoad(filename);
    if (!loadResult.success || !loadResult.data) {
      throw new Error(loadResult.error || 'Local load failed');
    }

    // Verify string equality (catches any corruption)
    if (loadResult.data !== bundleJSON) {
      throw new Error(`Data mismatch in ${filename}`);
    }
    
    // Success - file is verified and intact
  } catch (error) {
    // If error occurred, clean up corrupted file
    try {
      await bridge.localDelete(filename);
    } catch (cleanupError) {
      console.warn('Failed to cleanup after error:', cleanupError);
    }
    throw error;
  }
}

/**
 * Saves to Solid Pod with immediate verification and cleanup on failure.
 * 
 * Process: save → load → string equality check
 * 
 * If any step fails, deletes the corrupted Pod file before throwing.
 * This prevents accumulation of invalid backup files that could
 * interfere with recovery logic.
 * 
 * @param filename - Pod file path for this backup
 * @param bundleJSON - Pre-stringified JSON to save
 * @throws Error if save, load, or equality check fails
 */
async function saveLoadCheckCleanSolid(
  filename: string,
  bundleJSON: string
): Promise<void> {
  const bridge = MeraBridge.getInstance();
  
  try {
    // Save to Solid Pod
    const saveResult = await bridge.solidSave(filename, bundleJSON);
    if (!saveResult.success) {
      throw new Error(saveResult.error || 'Solid save failed');
    }

    // Load back immediately for verification
    const loadResult = await bridge.solidLoad(filename);
    if (!loadResult.success || !loadResult.data) {
      throw new Error(loadResult.error || 'Solid load failed');
    }

    // Verify string equality (catches any corruption)
    if (loadResult.data !== bundleJSON) {
      throw new Error(`Data mismatch in ${filename}`);
    }
    
    // Success - file is verified and intact
  } catch (error) {
    // If error occurred, clean up corrupted file
    try {
      await bridge.solidDelete(filename);
    } catch (cleanupError) {
      console.warn('Failed to cleanup corrupted Pod file:', cleanupError);
    }
    throw error;
  }
}

/**
 * Generates six filenames for the four-stage save process.
 * 
 * Naming convention: mera.{version}.{type}.{timestamp}.json
 * 
 * Version enables future migration logic to identify old formats.
 * Type distinguishes offline vs online and primary vs duplicate.
 * Timestamp enables time-bracketed backup retention by saveCleaner.
 * 
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Object with six filename strings
 */
function generateFilenames(timestamp: number): SaveFilenames {
  const v = CURRENT_SCHEMA_VERSION;
  const prefix = `mera.${v.major}.${v.minor}.${v.patch}`;

  return {
    localOfflinePrimary: `${prefix}.lofp.${timestamp}.json`,
    localOfflineDup: `${prefix}.lofd.${timestamp}.json`,
    solidPrimary: `${prefix}.sp.${timestamp}.json`,
    solidDup: `${prefix}.sd.${timestamp}.json`,
    localOnlinePrimary: `${prefix}.lonp.${timestamp}.json`,
    localOnlineDup: `${prefix}.lond.${timestamp}.json`,
  };
}