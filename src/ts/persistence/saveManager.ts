/**
 * @fileoverview Progress persistence manager with polling-based save cycle
 * @module persistence/saveManager
 *
 * Polls every 50ms to detect changed state and initiate save orchestration.
 * 
 * Fire-and-forget architecture: Main Core queues saves without blocking.
 * SaveManager handles timing, retries, and conflict prevention independently.
 */

import { orchestrateSave } from "./saveOrchestrator";
import { showCriticalError } from "../ui/errorDisplay.js";

/**
 * Results of dual-persistence save operation.
 * 
 * Used to track online status and determine retry behavior.
 */
enum SaveResult {
  /** Both localStorage and Solid Pod succeeded */
  BothSucceeded,
  /** Both localStorage and Solid Pod failed */
  BothFailed,
  /** localStorage succeeded, Solid Pod failed (offline mode) */
  OnlyLocalSucceeded,
  /** Solid Pod succeeded, localStorage failed (rare edge case) */
  OnlySolidSucceeded,
}

/**
 * Manages automatic background saves with retry logic.
 * 
 * Responsibilities:
 * - Poll every 50ms for dirty state
 * - Orchestrate saves without blocking Main Core
 * - Retry failed Pod saves automatically
 * - Prevent concurrent save operations
 * - Track online/offline status
 * 
 * Why 50ms polling: Fast enough for immediate UI feedback (<100ms imperceptible
 * to users), slow enough to not use excessive resources.
 */
class SaveManager {
  private static instance: SaveManager;
  
  /** Prevents concurrent save operations */
  private saveInProgress: boolean = false;
  
  /** Last save outcome, used for retry logic and online status */
  private lastSaveResult: SaveResult = SaveResult.BothSucceeded;
  
  /** Latest progress bundle JSON queued by Main Core */
  private queuedSave: string | null = null;
  
  /** Flag indicating bundle has changed since last save */
  private saveHasChanged: boolean = false;

  private constructor() {
    this.startPolling();
  }

  /**
   * Gets singleton instance, creating and starting it if needed.
   * 
   * @returns The global SaveManager instance
   */
  static getInstance(): SaveManager {
    if (!SaveManager.instance) {
      SaveManager.instance = new SaveManager();
    }
    return SaveManager.instance;
  }

  /**
   * Begins save polling cycle. Called automatically by constructor.
   * 
   * Runs every 50ms to check for changed state and trigger saves.
   */
  private startPolling(): void {
    setInterval(() => this.checkAndSave(), 50);
  }

  /**
   * Polling cycle that checks for changed state and triggers saves.
   * 
   * Save triggers when:
   * - No save currently in progress, AND
   * - Either progress has changed, OR last Pod save failed (retry logic)
   * 
   * However, core generally only calls queueSave() every 15 seconds except for with progress events
   * 
   * Fire-and-forget: orchestrateSave runs async, doesn't block polling.
   */
  private checkAndSave() {
    // Don't save if no bundle queued
    if (this.queuedSave === null) {
      return;
    }
    
    // Trigger save if not in progress and either changed or last Pod save failed
    if (
      !this.saveInProgress &&
      (this.saveHasChanged ||
        this.lastSaveResult === SaveResult.BothFailed ||
        this.lastSaveResult === SaveResult.OnlyLocalSucceeded)
    ) {
      // Mark save in progress to prevent concurrent operations
      this.saveInProgress = true;
      
      // Clear changed flag to prevent endless repeats
      this.saveHasChanged = false;
      
      // Capture string reference (no clone needed - strings are immutable)
      const bundleSnapshot = this.queuedSave;
      
      // Capture timestamp for backup filename
      const timestamp = Date.now();
      
      // Start async save operation
      orchestrateSave(bundleSnapshot, timestamp)
        .then((result: SaveResult) => {
          // Store result for retry logic and online status
          this.lastSaveResult = result;
          
          // Release lock for next save
          this.saveInProgress = false;
          
          // Log localStorage failures (rare edge case)
          if (result === SaveResult.OnlySolidSucceeded) {
            console.error(
              "⚠️ localStorage save failed - offline mode unavailable"
            );
          }
        })
        // Catch should never fire - indicates programming error in orchestrator
        .catch((error: Error) => {
          showCriticalError({
            title: "Save System Failure",
            message: "Progress is not being saved.",
            technicalDetails: error.stack,
            errorCode: "save-system-failure",
          });
          this.lastSaveResult = SaveResult.BothFailed;
          this.saveInProgress = false;
        });
    }
  }

  /**
   * Queues progress bundle JSON for next save cycle.
   * 
   * Called by Main Core after processing progress updates. Does not
   * block - save happens asynchronously during next polling cycle.
   * 
   * Typically happens once every 15 seconds if there had been a change
   * or happens with major progress event.
   * 
   * @param bundleJSON - Pre-stringified JSON representation of complete progress bundle
   * @param hasChanged - True if bundle differs from last save
   */
  queueSave(bundleJSON: string, hasChanged: boolean): void {
    this.queuedSave = bundleJSON;
    this.saveHasChanged = hasChanged;
  }

  /**
   * Returns whether Solid Pod sync is currently working.
   * 
   * Used by UI to display online/offline status. True if last save
   * succeeded in reaching the Pod, false if offline or Pod unreachable.
   * 
   * @returns True if Pod sync operational, false otherwise
   */
  getOnlineStatus(): boolean {
    if (
      this.lastSaveResult === SaveResult.BothSucceeded ||
      this.lastSaveResult === SaveResult.OnlySolidSucceeded
    ) {
      return true;
    } else {
      return false;
    }
  }
}

export { SaveManager, SaveResult };