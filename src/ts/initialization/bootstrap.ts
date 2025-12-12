/**
 * @fileoverview Application bootstrap and environment initialization
 * @module initialization/bootstrap
 *
 * Entry point that validates environment readiness before starting the learning platform.
 * 
 * Responsibilities:
 * - Verify DOM readiness
 * - Establish Solid Pod authentication
 * - Validate client clock synchronization
 * - Initialize error handling UI
 * - Hand off to initializationOrchestrator.ts when ready
 * 
 * Critical safety checks ensure timestamps are reliable for backup management
 * and concurrent session detection across multiple devices.
 */

import { TimelineContainer } from "../ui/timelineContainer.js";
import { SolidConnectionErrorDisplay } from "../ui/errorDisplay.js";
import { initializationOrchestrator } from "./initializationOrchestrator.js";
import { MeraBridge } from "../solid/meraBridge.js";

/**
 * Maximum polling attempts for Solid authentication readiness.
 * 
 * 50 attempts × 100ms = 5 second timeout before showing auth error.
 */
const MAX_ATTEMPTS = 50;

/**
 * Polling interval for Solid session detection.
 * 
 * 100ms balances responsiveness with resource usage.
 */
const POLL_INTERVAL_MS = 100;

/**
 * Clock skew tolerance threshold.
 * 
 * 60 seconds allows for high-latency networks while catching
 * severely incorrect device clocks (hours/days off).
 * 
 * Why 60s: Real clock problems are hours off, not seconds.
 * Satellite internet rarely exceeds 30s round-trip time.
 */
const CLOCK_SKEW_THRESHOLD_MS = 60000;

// Global UI components
let timeline: TimelineContainer | null = null;
let errorDisplay: SolidConnectionErrorDisplay | null = null;

/**
 * Bootstrap entry point - triggers initialization when DOM is ready.
 * 
 * Called either by DOMContentLoaded event or immediately if DOM already loaded.
 * Sets up UI skeleton before attempting Solid authentication.
 */
function initializeWhenReady(): void {
  console.log("🚀 Starting initialization...");
  window.bootstrapInstance = bootstrapInstance;

  // Setup UI first with simple console error handling
  try {
    setupUI();
    console.log("✅ UI setup successfully!");
  } catch (uiError) {
    console.error("💥 UI setup failed:", uiError);
    console.error("Cannot continue - refresh the page");
    return; // Don't continue if UI failed
  }

  startBootstrap().catch((error) => {
    console.error("💥 Bootstrap startup failed:", error);
    showBootstrapError(error);
  });
}

/**
 * Initialize UI components and prepare the learning environment.
 * 
 * Creates timeline container and error display system that will be used
 * throughout the application lifecycle.
 * 
 * @throws {Error} If DOM elements are missing or instantiation fails
 */
function setupUI(): void {
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
  timeline = new TimelineContainer("lesson-container");
  errorDisplay = new SolidConnectionErrorDisplay(timeline);
  console.log("✅ UI components initialized");
}

/**
 * Display bootstrap initialization error to user.
 * 
 * Uses error display system if available, falls back to simple
 * HTML injection if error display not yet initialized.
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

/**
 * Main bootstrap function - validates environment and initializes platform.
 * 
 * Execution sequence:
 * 1. Poll for Solid Pod authentication (up to 5 seconds)
 * 2. Verify client clock is synchronized with server
 * 3. Fire off initializationOrchestrator.ts and exit
 * 4. Show authentication error if Solid unavailable
 * 
 * Fire-and-forget: Bootstrap validates environment readiness, then hands off
 * to initialization phase. Bootstrap's Promise resolves when handoff completes,
 * not when initialization completes.
 * 
 * @throws {Error} If clock skew exceeds threshold or authentication fails
 */
async function startBootstrap(): Promise<void> {
  console.log("🚀 BOOTSTRAP: start_bootstrap() function called!");
  
  const bridge = MeraBridge.getInstance();
  let solidSessionReady = false;

  // Poll for Solid session readiness (up to 5 seconds)
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      if (await bridge.check()) {
        solidSessionReady = true;
        console.log(`✅ Bridge ready on attempt ${attempt + 1}`);
        break;
      } else {
        console.log(`🔄 Attempt ${attempt + 1}/${MAX_ATTEMPTS} - Bridge not ready`);
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (error) {
      console.log(`❌ Attempt ${attempt + 1}/${MAX_ATTEMPTS} - Error: ${error}`);
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  if (solidSessionReady) {
    // Verify clock synchronization before proceeding
    await checkClockSkew();
    
    // Fire and forget - bootstrap exits after handing off
    continueToNextModule();
  } else {
    console.log("❌ Solid pod not connected. Authentication required.");
    noSolidConnection();
  }
}

/**
 * Verify client clock is synchronized with server.
 * 
 * Uses Django's Date header from a HEAD request to static resource.
 * Ensures timestamps are reliable for:
 * - Backup file sorting
 * - Concurrent session detection
 * - Save collision prevention
 * 
 * Threshold rationale: 60 seconds catches seriously wrong clocks (hours/days off)
 * without falsely triggering on high-latency networks (satellite, Tor, etc.).
 * 
 * @throws {Error} If server unreachable, Date header missing, or skew exceeds threshold
 */
async function checkClockSkew(): Promise<void> {
  try {
    // Fetch small static resource to get Django's Date header
    const response = await fetch('/static/web/update-home-journey.js', { 
      method: 'HEAD',
      cache: 'no-store' // Ensure fresh response with current Date header
    });
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status} - cannot verify clock`);
    }
    
    const serverDateHeader = response.headers.get('Date');
    
    if (!serverDateHeader) {
      throw new Error('No Date header in server response - cannot verify clock');
    }
    
    const serverTime = new Date(serverDateHeader).getTime();
    const clientTime = Date.now();
    const skewMs = Math.abs(serverTime - clientTime);
    
    // Check against threshold
    if (skewMs > CLOCK_SKEW_THRESHOLD_MS) {
      const skewSeconds = Math.round(skewMs / 1000);
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

/**
 * Continue initialization after environment validation.
 * 
 * Called when Solid Pod is authenticated and clock is verified.
 * Fires off initializationOrchestrator.ts and exits - bootstrap's job is done.
 * 
 * Fire-and-forget pattern: Bootstrap verifies environment readiness, then hands
 * off to initialization. Each phase manages its own lifecycle independently.
 * 
 * Error handling: The Promise's .catch() handles initialization failures even
 * though we don't await it. The Promise still exists and can reject.
 */
function continueToNextModule(): void {
  console.log("🔗 Solid Pod connected - starting initialization");

  // Fire and forget - bootstrap's responsibility ends here
  initializationOrchestrator()
    .then(() => {
      console.log("✅ Initialization completed successfully");
    })
    .catch((error) => {
      console.error("❌ Initialization failed:", error);
      if (errorDisplay) {
        errorDisplay.showSystemError(
          "initialization-failed",
          "Failed to load user progress",
          error instanceof Error ? error.message : "Unknown initialization error"
        );
      }
    });
  
  console.log("✅ Bootstrap complete - initialization running independently");
}

/**
 * Handle case where Solid is NOT connected.
 * 
 * Shows authentication error requiring user to log in via Solid Provider.
 * Platform cannot proceed without authenticated Solid session.
 */
function noSolidConnection(): void {
  console.log("🔐 No Solid connection - authentication required");

  // Show Solid connection error - authentication required
  if (errorDisplay) {
    errorDisplay.showSolidConnectionError();
  }
}

/**
 * Bootstrap manager class for JavaScript interop.
 * 
 * Exposed globally for retry buttons in error UI to call back into TypeScript.
 */
class BootstrapManager {
  /**
   * Retry Solid Pod connection after error.
   * 
   * Called by "Retry" button in authentication error display.
   * Clears error UI and restarts bootstrap sequence.
   * 
   * @returns Promise that resolves when bootstrap completes or rejects on failure
   */
  async retrySolidConnection(): Promise<void> {
    console.log("🔄 Retrying Solid Pod connection...");
    if (errorDisplay) {
      errorDisplay.clearError("solid-connection");
    }
    return startBootstrap();
  }
}

// Create global bootstrap instance
const bootstrapInstance = new BootstrapManager();

// Make bootstrap instance available globally for error UI callbacks
declare global {
  interface Window {
    bootstrapInstance: BootstrapManager;
  }
}

// Check if DOM is already ready
if (document.readyState === "loading") {
  // DOM is still loading, wait for it
  document.addEventListener("DOMContentLoaded", initializeWhenReady);
} else {
  // DOM is already ready (readyState is 'interactive' or 'complete')
  initializeWhenReady();
}

export { BootstrapManager, startBootstrap };