import {
  PodStorageBundle,
  PodStorageBundleSchema,
} from "./podStorageSchema.js";
import { SaveResult } from "./saveManager.js";
import { CURRENT_SCHEMA_VERSION } from "./schemaVersion.js";

declare global {
  // To Do: Add Proper Typing
  interface Window {
    meraBridge: any;
  }
}

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
  const files = generateFilenames(timestamp);

  // Stage 1: Try local offline (best effort)
  let localOfflineSucceeded = false;
  try {
    await Promise.all([
      saveLoadCheckCleanLocal(files.localOfflinePrimary, bundle),
      saveLoadCheckCleanLocal(files.localOfflineDup, bundle),
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
      saveLoadCheckCleanSolid(files.solidPrimary, bundle),
      saveLoadCheckCleanSolid(files.solidDup, bundle),
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
      saveLoadCheckCleanLocal(files.localOnlinePrimary, bundle),
      saveLoadCheckCleanLocal(files.localOnlineDup, bundle),
    ]);
    
    // Stage 4: Cleanup offline files (best effort)
    try {
      localStorage.removeItem(`mera_${files.localOfflinePrimary}`);
      localStorage.removeItem(`mera_${files.localOfflineDup}`);
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
  try {
    // Save
    const saveResult = await window.meraBridge.localSave(filename, bundle);
    if (!saveResult.success) throw new Error(saveResult.error);

    // Load
    const loadResult = await window.meraBridge.localLoad(filename);
    if (!loadResult.success) throw new Error(loadResult.error);

    // Check (Zod validation)
    PodStorageBundleSchema.parse(loadResult.data);

    // Check (deep equality)
    if (!deepEqual(bundle, loadResult.data)) {
      throw new Error(`Data mismatch in ${filename}`);
    }
  } catch (error) {
    // Clean up corrupted file
    const key = `mera_${filename}`;
    localStorage.removeItem(key);
    throw error;
  }
}

async function saveLoadCheckCleanSolid(
  filename: string,
  bundle: PodStorageBundle
): Promise<void> {
  try {
    // Save
    const saveResult = await window.meraBridge.solidSave(filename, bundle);
    if (!saveResult.success) throw new Error(saveResult.error);

    // Load
    const loadResult = await window.meraBridge.solidLoad(filename);
    if (!loadResult.success) throw new Error(loadResult.error);

    // Check (Zod validation)
    PodStorageBundleSchema.parse(loadResult.data);

    // Check (deep equality)
    if (!deepEqual(bundle, loadResult.data)) {
      throw new Error(`Data mismatch in ${filename}`);
    }
  } catch (error) {
    // Clean up corrupted file
    // TODO: Add solidDelete to bridge
    console.error(`Failed to clean up corrupted Pod file: ${filename}`);
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