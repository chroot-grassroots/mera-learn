import {
  PodStorageBundle,
  PodStorageBundleSchema,
} from "./podStorageSchema.js";
import { SaveResult } from "./saveManager.js";
import { CURRENT_SCHEMA_VERSION } from "./schemaVersion.js";
import { MeraBridge } from "../solid/meraBridge.js";

interface SaveFilenames {
  localOfflinePrimary: string;
  localOfflineDup: string;
  solidPrimary: string;
  solidDup: string;
  localOnlinePrimary: string;
  localOnlineDup: string;
}

export async function orchestrateSave(
  bundle: PodStorageBundle,
  timestamp: number
): Promise<SaveResult> {
  const fileNames = generateFilenames(timestamp);

  // Stage 1: Try local offline (best effort)
  let localOfflineSucceeded = false;
  try {
    await Promise.all([
      saveLoadCheckCleanLocal(fileNames.localOfflinePrimary, bundle),
      saveLoadCheckCleanLocal(fileNames.localOfflineDup, bundle),
    ]);
    localOfflineSucceeded = true;
  } catch (localOfflineError) {
    console.error("Local offline save failed:", localOfflineError);
    // Continue anyway - Pod is what really matters
  }

  // Stage 2: Try Pod save
  let podSucceeded = false;
  try {
    await Promise.all([
      saveLoadCheckCleanSolid(fileNames.solidPrimary, bundle),
      saveLoadCheckCleanSolid(fileNames.solidDup, bundle),
    ]);
    podSucceeded = true;
  } catch (podError) {
    console.error("Pod save failed:", podError);
  }

  // If Pod failed, stop here
  if (!podSucceeded) {
    return localOfflineSucceeded
      ? SaveResult.OnlyLocalSucceeded
      : SaveResult.BothFailed;
  }

  // Stage 3: Pod succeeded, update local (best effort)
  try {
    await Promise.all([
      saveLoadCheckCleanLocal(fileNames.localOnlinePrimary, bundle),
      saveLoadCheckCleanLocal(fileNames.localOnlineDup, bundle),
    ]);

    // Stage 4: Cleanup offline files (best effort)
    const bridge = MeraBridge.getInstance();
    try {
      await Promise.all([
        bridge.localDelete(fileNames.localOfflinePrimary),
        bridge.localDelete(fileNames.localOfflineDup),
      ]);
    } catch (cleanupError) {
      console.warn("Cleanup failed:", cleanupError);
    }

    return SaveResult.BothSucceeded;
  } catch (localOnlineError) {
    console.error("Local online save failed:", localOnlineError);
    return SaveResult.OnlySolidSucceeded;
  }
}

async function saveLoadCheckCleanLocal(
  filename: string,
  bundle: PodStorageBundle
): Promise<void> {
  const bridge = MeraBridge.getInstance();
  
  try {
    // Save
    const saveResult = await bridge.localSave(filename, bundle);
    if (!saveResult.success) {
      throw new Error(saveResult.error || 'Local save failed');
    }

    // Load
    const loadResult = await bridge.localLoad(filename);
    if (!loadResult.success) {
      throw new Error(loadResult.error || 'Local load failed');
    }

    // Check (Zod validation)
    PodStorageBundleSchema.parse(loadResult.data);

    // Check (deep equality)
    if (!deepEqual(bundle, loadResult.data)) {
      // Clean up corrupted file BEFORE throwing
      await bridge.localDelete(filename);
      throw new Error(`Data mismatch in ${filename}`);
    }
    // Success - file is verified and intact
  } catch (error) {
    // If error occurred before we could delete, clean up now
    try {
      await bridge.localDelete(filename);
    } catch (cleanupError) {
      console.warn('Failed to cleanup after error:', cleanupError);
    }
    throw error;
  }
}

async function saveLoadCheckCleanSolid(
  filename: string,
  bundle: PodStorageBundle
): Promise<void> {
  const bridge = MeraBridge.getInstance();
  
  try {
    // Save
    const saveResult = await bridge.solidSave(filename, bundle);
    if (!saveResult.success) {
      throw new Error(saveResult.error || 'Solid save failed');
    }

    // Load
    const loadResult = await bridge.solidLoad(filename);
    if (!loadResult.success) {
      throw new Error(loadResult.error || 'Solid load failed');
    }

    // Check (Zod validation)
    PodStorageBundleSchema.parse(loadResult.data);

    // Check (deep equality)
    if (!deepEqual(bundle, loadResult.data)) {
      // Clean up corrupted file BEFORE throwing
      await bridge.solidDelete(filename);
      throw new Error(`Data mismatch in ${filename}`);
    }
    
    // Success - file is verified and intact
  } catch (error) {
    // If error occurred before we could delete, clean up now
    try {
      await bridge.solidDelete(filename);
    } catch (cleanupError) {
      console.warn('Failed to cleanup corrupted Pod file:', cleanupError);
    }
    throw error;
  }
}

function generateFilenames(timestamp: number) {
  const v = CURRENT_SCHEMA_VERSION;
  const prefix = `mera.${v.major}.${v.minor}.${v.patch}`;

  return {
    localOfflinePrimary: `${prefix}.lofo.${timestamp}.json`,
    localOfflineDup: `${prefix}.lofd.${timestamp}.json`,
    solidPrimary: `${prefix}.so.${timestamp}.json`,
    solidDup: `${prefix}.sd.${timestamp}.json`,
    localOnlinePrimary: `${prefix}.lono.${timestamp}.json`,
    localOnlineDup: `${prefix}.lond.${timestamp}.json`,
  };
}

function deepEqual(obj1: any, obj2: any): boolean {
  return JSON.stringify(obj1) === JSON.stringify(obj2);
}