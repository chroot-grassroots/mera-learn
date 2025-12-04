/**
 * @fileoverview Progress persistence manager with polling-based save cycle
 * @module persistence/saveManager
 *
 * Polls every 50ms to detect changed state and initiate save orchestration.
 *
 * Sequential architecture: Each poll cycle completes before the next begins.
 * SaveManager handles timing, retries, and conflict prevention independently.
 */

import { orchestrateSave } from "./saveOrchestrator";
import { showCriticalError } from "../ui/errorDisplay.js";
import { MeraBridge } from "../solid/meraBridge";

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
 * Results of concurrent session check.
 * 
 * Determines whether to proceed with solid saves and whether to show errors.
 */
enum ConcurrenceCheckResult {
  /** Session check passed - proceed with all saves */
  Passed,
  /** Definitive concurrent session detected - halt everything, show error */
  ConcurrentSessionDetected,
  /** Failed to initialize session file - halt everything, show error */
  InitializationFailed,
  /** Network error during subsequent check - allow local saves only, block solid */
  NetworkError,
}

/**
 * Session protection file stored in Pod to detect concurrent access.
 */
interface SessionProtectionFile {
  sessionId: string;
}

/**
 * Manages automatic background saves with retry logic and concurrent session protection.
 *
 * Responsibilities:
 * - Poll every 50ms for dirty state
 * - Orchestrate saves without blocking Main Core
 * - Retry failed Pod saves automatically
 * - Prevent concurrent save operations
 * - Track online/offline status
 * - Detect concurrent sessions across devices/tabs (tamper-detection tripwire)
 *
 * Why 50ms polling: Fast enough for immediate UI feedback (<100ms imperceptible
 * to users), slow enough to not use excessive resources.
 */
class SaveManager {
  private static instance: SaveManager;

  // ============================================================================
  // CORE STATE
  // ============================================================================

  /** Prevents concurrent save operations */
  private saveInProgress: boolean = false;

  /** Last save outcome, used for retry logic and online status */
  private lastSaveResult: SaveResult = SaveResult.BothSucceeded;

  /** Latest progress bundle JSON queued by Main Core */
  private queuedSave: string | null = null;

  /** Flag indicating bundle has changed since last save */
  private saveHasChanged: boolean = false;

  // ============================================================================
  // CONCURRENT SESSION PROTECTION STATE
  // ============================================================================

  /** Session ID for concurrent session detection (null until first save) */
  private sessionId: string | null = null;

  /** Path to session protection file in Pod */
  private readonly SESSION_FILE_PATH =
    "mera_concurrent_session_protection.json";

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

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
   * Each poll cycle completes before scheduling the next one.
   */
  private startPolling(): void {
    const poll = async () => {
      await this.checkAndSave();
      setTimeout(poll, 50); // Wait 50ms before next check
    };
    poll(); 
  }

  // ============================================================================
  // CORE SAVE LOGIC
  // ============================================================================

  /**
   * Polling cycle that checks for changed state and triggers saves.
   *
   * Save triggers when:
   * - No save currently in progress, AND
   * - Either progress has changed, OR last Pod save failed (retry logic)
   *
   * However, core generally only calls queueSave() every 15 seconds except for with progress events
   *
   * Sequential execution: Each poll waits for save to complete before returning.
   */
  private async checkAndSave(): Promise<void> {
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
      // Mark save in progress to prevent concurrent operations. Not technically needed but extra safeguard.
      this.saveInProgress = true;

      // Clear changed flag to prevent endless repeats
      this.saveHasChanged = false;

      // Capture string reference (no clone needed - strings are immutable)
      const bundleSnapshot = this.queuedSave;

      // Capture timestamp for backup filename
      const timestamp = Date.now();

      // Sequential save operation with session protection
      const concurrenceCheck = await this.checkConcurrentSessions();

      // Handle critical failures - show error and stop everything
      if (concurrenceCheck === ConcurrenceCheckResult.ConcurrentSessionDetected) {
        showCriticalError({
          title: "Concurrent Session Detected",
          message: "Another device or tab is using this account. Please refresh to continue.",
          technicalDetails: "Session ID mismatch detected in Pod",
          errorCode: "concurrent-session",
        });
        this.lastSaveResult = SaveResult.BothFailed;
        return;
      }

      if (concurrenceCheck === ConcurrenceCheckResult.InitializationFailed) {
        showCriticalError({
          title: "Save System Failure",
          message: "Failed to initialize session protection. Progress is not being saved.",
          technicalDetails: "Could not write or verify session file after retries",
          errorCode: "session-init-failure",
        });
        this.lastSaveResult = SaveResult.BothFailed;
        return;
      }

      // Proceed with save
      // NetworkError: block solid saves but allow local saves to continue
      // Passed: proceed normally with all saves
      try {
        const allowSolidSaves = (concurrenceCheck === ConcurrenceCheckResult.Passed);
        const result = await orchestrateSave(bundleSnapshot, timestamp, allowSolidSaves);

        // Store result for retry logic and online status
        this.lastSaveResult = result;

        // Log localStorage failures (rare edge case)
        if (result === SaveResult.OnlySolidSucceeded) {
          console.error(
            "⚠️ localStorage save failed - offline mode unavailable"
          );
        }
      } catch (error: any) {
        // Orchestration failure (should be rare - mainly corruption detection)
        showCriticalError({
          title: "Save System Failure",
          message: "Progress is not being saved.",
          technicalDetails: error.stack,
          errorCode: "save-orchestration-failure",
        });
        this.lastSaveResult = SaveResult.BothFailed;
      } finally {
        // Always release lock
        this.saveInProgress = false;
      }
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

  // ============================================================================
  // CONCURRENT SESSION PROTECTION (Edge Case Prevention)
  // ============================================================================
  //
  // This section implements tamper-detection tripwire logic to prevent data
  // corruption when the same Pod is accessed from multiple devices/tabs.
  //
  // Strategy: Write a random session ID to the Pod, then verify it hasn't
  // changed before each save. If it changes, another session is active.
  //
  // This is NOT a lock - it's detection after the fact. The 50ms pause after
  // writing creates a window to catch near-simultaneous session starts.
  // ============================================================================

  /**
   * Generates a cryptographically random 128-bit session ID.
   *
   * @returns Hex-encoded 128-bit random ID
   */
  private generateSessionId(): string {
    const array = new Uint8Array(16); // 128 bits = 16 bytes
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
      ""
    );
  }

  /**
   * Checks for concurrent sessions by verifying session ID in Pod.
   *
   * First call: Writes random session ID, waits, verifies write succeeded
   * Subsequent calls: Reads session ID, verifies it matches local copy
   *
   * This is a tamper-detection tripwire, not a lock. If another device/tab
   * starts a session, we detect the ID change and halt to prevent corruption.
   *
   * @returns ConcurrenceCheckResult indicating what happened
   */
  private async checkConcurrentSessions(): Promise<ConcurrenceCheckResult> {
    const bridge = MeraBridge.getInstance();

    if (this.sessionId === null) {
      // First call: Initialize session protection
      const newSessionId = this.generateSessionId();
      const sessionFile: SessionProtectionFile = { sessionId: newSessionId };

      // Write session ID to Pod with retry
      const maxRetries = 5;
      let retryCount = 0;
      let writeSucceeded = false;

      while (retryCount < maxRetries && !writeSucceeded) {
        try {
          await bridge.solidSave(
            this.SESSION_FILE_PATH,
            JSON.stringify(sessionFile)
          );
          writeSucceeded = true;
        } catch (error) {
          retryCount++;
          if (retryCount >= maxRetries) {
            console.error(`Failed to write session protection file after ${maxRetries} attempts:`, error);
            return ConcurrenceCheckResult.InitializationFailed;
          }
          // Exponential backoff: 50ms, 100ms, 200ms, 400ms, 800ms
          await new Promise((resolve) =>
            setTimeout(resolve, 50 * Math.pow(2, retryCount - 1))
          );
        }
      }

      // Pause briefly to catch near-simultaneous writes from other sessions
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify our write succeeded (read back and check)
      try {
        const readBackResult = await bridge.solidLoad(this.SESSION_FILE_PATH);
        if (!readBackResult.success || !readBackResult.data) {
          console.error("Session file read failed:", readBackResult.error);
          return ConcurrenceCheckResult.InitializationFailed;
        }
        const verified: SessionProtectionFile = JSON.parse(readBackResult.data);

        if (verified.sessionId !== newSessionId) {
          console.error("Concurrent session detected during initialization - another device/tab overwrote session ID");
          return ConcurrenceCheckResult.ConcurrentSessionDetected;
        }

        // Success - store session ID locally
        this.sessionId = newSessionId;
        return ConcurrenceCheckResult.Passed;
      } catch (error) {
        console.error("Session verification failed:", error);
        return ConcurrenceCheckResult.InitializationFailed;
      }
    } else {
      // Subsequent calls: Verify session ID hasn't changed
      try {
        const currentResult = await bridge.solidLoad(this.SESSION_FILE_PATH);
        if (!currentResult.success || !currentResult.data) {
          // Network error reading session file - degrade gracefully
          console.warn("Session check network error, blocking solid saves:", currentResult.error);
          return ConcurrenceCheckResult.NetworkError;
        }
        const currentFile: SessionProtectionFile = JSON.parse(
          currentResult.data
        );

        if (currentFile.sessionId !== this.sessionId) {
          console.error("Concurrent session detected - session ID changed. Another device/tab is active.");
          return ConcurrenceCheckResult.ConcurrentSessionDetected;
        }
        
        return ConcurrenceCheckResult.Passed;
      } catch (error: any) {
        // Parse error or other unexpected failure - degrade gracefully
        console.warn("Session check failed, blocking solid saves:", error);
        return ConcurrenceCheckResult.NetworkError;
      }
    }
  }
}

export { SaveManager, SaveResult };