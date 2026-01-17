/**
 * @fileoverview Bootstrap initialization for Mera Learn platform
 * @module initialization/bootstrap
 *
 * Validates environment readiness before initializing the platform:
 * - Waits for DOM ready
 * - Polls for Solid Pod authentication
 * - Verifies client clock synchronization
 * - Hands off to initializationOrchestrator
 *
 * This module is the platform's entry point, triggered when the page loads.
 */

import { TimelineContainer } from "../ui/timelineContainer.js";
import { SolidConnectionErrorDisplay } from "../ui/errorDisplay.js";
import { MeraBridge } from "../solid/meraBridge.js";
import { initializationOrchestrator } from "./initializationOrchestrator.js";
import { initializeTimeline } from '../ui/timelineContainer.js';

// ============================================================================
// Configuration Constants
// ============================================================================

/**
 * Maximum acceptable clock skew between client and server (60 seconds).
 * Clock drift beyond this threshold could cause data integrity issues.
 */
const CLOCK_SKEW_THRESHOLD_MS = 60_000;

/**
 * Maximum number of polling attempts for Solid authentication (50 × 100ms = 5s).
 */
const MAX_ATTEMPTS = 50;

/**
 * Interval between Solid authentication checks (milliseconds).
 */
const POLL_INTERVAL_MS = 100;

// ============================================================================
// Module-Level State
// ============================================================================

/**
 * Timeline UI container for displaying initialization progress.
 */
let timeline: TimelineContainer | null = null;

/**
 * Error display system for showing bootstrap failures to users.
 */
let errorDisplay: SolidConnectionErrorDisplay | null = null;

// ============================================================================
// Setup & Error Handling
// ============================================================================

/**
 * Initialize UI components and prepare the learning environment.
 * 
 * Creates timeline container and error display system that will be used
 * throughout the application lifecycle.
 * 
 * @returns true if UI setup succeeded, false if it failed
 */
function setupUI(): boolean {
  try {
    console.log("🎨 Setting up UI components...");

    // Hide auth-status loading screen
    const authStatus = document.getElementById("auth-status");
    if (authStatus) {
      authStatus.classList.add("hidden");
    }

    // Show lesson-container for timeline
    const lessonContainer = document.getElementById("lesson-container");
    if (lessonContainer) {
      lessonContainer.classList.remove("hidden");
    }

    // Initialize timeline and error display
    timeline = initializeTimeline("lesson-container");
    errorDisplay = new SolidConnectionErrorDisplay(timeline);
    console.log("✅ UI components initialized");
    return true;
  } catch (error) {
    console.error("💥 UI setup failed:", error);
    return false;
  }
}

/**
 * Display bootstrap error to user using best available method.
 * 
 * Attempts to use error display system if available, otherwise falls back
 * to direct DOM manipulation.
 * 
 * @param error - The error that caused bootstrap to fail
 */
function showBootstrapError(error: Error | unknown): void {
  const errorMessage =
    error instanceof Error ? error.message : "Unknown error occurred";

  // Use existing error display system if available
  if (errorDisplay) {
    errorDisplay.showSystemError(
      "bootstrap-init",
      "Bootstrap initialization failed",
      errorMessage
    );
    return;
  }

  // Simple fallback if error display isn't ready yet
  const authStatus = document.getElementById("auth-status");
  if (authStatus) {
    authStatus.innerHTML = `
      <div class="text-center py-12">
        <div class="text-red-600 mb-4">
          <span class="font-semibold">Bootstrap Failed</span>
        </div>
        <p class="text-sm text-red-500 mb-4">${errorMessage}</p>
        <button onclick="location.reload()" 
                class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg">
          Reload
        </button>
      </div>
    `;
  }
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Verify client clock is synchronized with server.
 * 
 * Clock synchronization is critical for:
 * - Preventing replay attacks via timestamps
 * - Ensuring data versioning integrity
 * - Avoiding confusion with lesson completion times
 * 
 * @throws {Error} If clock skew exceeds threshold or check fails
 */
async function checkClockSkew(): Promise<void> {
  try {
    const clientTime = Date.now();
    const response = await fetch("/", { method: "HEAD" });

    // Server returned error - cannot verify clock
    if (!response.ok) {
      throw new Error(
        `Server returned ${response.status} - cannot verify clock`
      );
    }

    // Extract server time from Date header
    const serverDateHeader = response.headers.get("Date");
    if (!serverDateHeader) {
      throw new Error("No Date header in server response - cannot verify clock");
    }

    const serverTime = new Date(serverDateHeader).getTime();
    const skewMs = Math.abs(clientTime - serverTime);

    // Check if skew exceeds threshold
    if (skewMs > CLOCK_SKEW_THRESHOLD_MS) {
      const skewSeconds = Math.floor(skewMs / 1000);
      throw new Error(
        `Clock skew detected: ${skewSeconds} seconds. Please check your device time settings.`
      );
    }

    console.log(`✅ Clock check passed (skew: ${skewMs}ms)`);
  } catch (error) {
    // All failures are critical - re-throw with context
    const message = error instanceof Error ? error.message : 'Unknown error during clock check';
    throw new Error(`Clock verification failed: ${message}`);
  }
}

// ============================================================================
// Flow Control Functions
// ============================================================================

/**
 * Hand off control to initialization orchestrator.
 * 
 * Fire-and-forget: Bootstrap validates environment, then launches initialization.
 * Bootstrap's Promise resolves when handoff completes, not when initialization
 * completes.
 * 
 * Success/failure of initialization is handled by orchestrator's own error
 * handling system.
 */
function continueToNextModule(): void {
  console.log("🔗 Solid Pod connected - starting initialization");

  // Fire and forget - let orchestrator handle its own errors
  initializationOrchestrator().then(
    () => {
      console.log("✅ Initialization completed successfully");
    },
    (error) => {
      console.error("❌ Initialization failed:", error);
      if (errorDisplay) {
        errorDisplay.showSystemError(
          "initialization-failed",
          "Failed to load user progress",
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    }
  );

  console.log("✅ Bootstrap complete - initialization running independently");
}

/**
 * Handle case where Solid Pod connection times out.
 * 
 * Shows user-friendly error prompting them to authenticate.
 */
function noSolidConnection(): void {
  console.log("🔐 No Solid connection - authentication required");
  if (errorDisplay) {
    errorDisplay.showConnectionError('solid');
  }
}

// ============================================================================
// Main Bootstrap Function
// ============================================================================

/**
 * Main bootstrap function - validates environment and initializes platform.
 * 
 * Execution sequence:
 * 1. Setup UI components
 * 2. Poll for Solid Pod authentication (up to 5 seconds)
 * 3. Verify client clock is synchronized with server
 * 4. Fire off initializationOrchestrator and exit
 * 5. Show authentication error if Solid unavailable
 * 
 * Fire-and-forget: Bootstrap validates environment readiness, then hands off
 * to initialization phase. Bootstrap's Promise resolves when handoff completes,
 * not when initialization completes.
 * 
 * @returns Promise that resolves when bootstrap handoff completes
 */
async function startBootstrap(): Promise<void> {
  try {
    // Setup UI first - exit if it fails
    if (!setupUI()) {
      console.error("Cannot continue - UI setup failed");
      return;
    }
    
    console.log("🔍 Checking for Solid Pod authentication...");

    const bridge = MeraBridge.getInstance();

    // Poll for Solid authentication with timeout
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      // Lightweight check - doesn't trigger initialization
      if (bridge.check()) {
        console.log(`✅ Solid Pod connected (attempt ${attempt})`);

        // Verify clock before proceeding
        await checkClockSkew();

        // Continue to initialization
        continueToNextModule();
        return;
      }

      // Not connected yet, wait and retry
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    // Timeout - no Solid connection after MAX_ATTEMPTS
    console.log(
      `❌ No Solid Pod connection after ${MAX_ATTEMPTS} attempts. Authentication required.`
    );
    noSolidConnection();
  } catch (error) {
    // Handle any errors during bootstrap
    console.error("💥 Bootstrap error:", error);
    showBootstrapError(error as Error);
  }
}

// ============================================================================
// Module Entry Point - Executes when module loads
// ============================================================================

// Check if DOM is already ready
if (document.readyState === "loading") {
  // DOM is still loading, wait for it
  document.addEventListener("DOMContentLoaded", () => {
    console.log("🚀 Starting initialization...");
    startBootstrap(); // Already has internal try-catch
  });
} else {
  // DOM is already ready (readyState is 'interactive' or 'complete')
  console.log("🚀 Starting initialization...");
  startBootstrap(); // Already has internal try-catch
}

// ============================================================================
// Exports (for testing only)
// ============================================================================

export { startBootstrap };