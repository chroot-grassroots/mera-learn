// Application entry point that initializes the learning platform

import { TimelineContainer } from "../ui/timelineContainer.js";
import { SolidConnectionErrorDisplay } from "../ui/errorDisplay.js";
import { buildValidationSystem } from "./validationBuilder.js";

// Configuration constants
const MAX_ATTEMPTS = 50;
const POLL_INTERVAL_MS = 100;

// Global UI components
let timeline: TimelineContainer | null = null;
let errorDisplay: SolidConnectionErrorDisplay | null = null;
let initialized = false;

// Starts the module once DOM is ready.
function initializeWhenReady() {
  console.log("🚀 Starting initialization...");
  window.bootstrapInstance = bootstrapInstance;

  // Setup UI first, with simple console error handling
  try {
    setupUI();
    console.log("Error UI setup successfully!");
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
 * Initialize UI components and prepare the learning environment
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

  // Store references for JavaScript access
  bootstrapInstance.timeline = timeline;
  bootstrapInstance.errorDisplay = errorDisplay;

  console.log("✅ UI components initialized");
}

// Shows an error if startBootstrap fails.
function showBootstrapError(error: Error | unknown): void {
  const errorMessage =
    error instanceof Error ? error.message : "Unknown error occurred";

  // Use your existing error display system if available
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
 * Main bootstrap function - checks Solid readiness and initializes appropriately
 */
async function startBootstrap(): Promise<void> {
  console.log("🚀 BOOTSTRAP: start_bootstrap() function called!");

  let solidSessionReady = false;

  // Poll for bridge readiness
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      // Check if bridge exists and is ready
      if (window.meraBridge && (await window.meraBridge.check())) {
        solidSessionReady = true;
        console.log(`✅ Bridge ready on attempt ${attempt + 1}`);
        break;
      } else {
        console.log(
          `🔄 Attempt ${attempt + 1}/${MAX_ATTEMPTS} - Bridge not ready`
        );
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (error) {
      console.log(
        `❌ Attempt ${attempt + 1}/${MAX_ATTEMPTS} - Error: ${error}`
      );
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  // Initialize based on Solid connection status
  if (solidSessionReady) {
    await initializeStateSolid();
  } else {
    console.log("❌ Solid pod not connected. Authentication required.");
    await noSolidConnection();
  }
}

/**
 * Initialize when Solid IS connected - full learning environment setup
 */
async function initializeStateSolid(): Promise<void> {
  console.log("🔗 Solid Pod connected - initializing with cloud sync");

  try {
    await buildValidationSystem();
    console.log("✅ Validation system built successful");

    // System is ready for lesson loading
    console.log("🚀 Learning platform ready!");
    initialized = true;
  } catch (error) {
    console.error("❌ Validation system build failed:", error);
    if (errorDisplay) {
      errorDisplay.showSystemError(
        "validation-build",
        "Validation system initialization failed",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }
}

/**
 * Handle case where Solid is NOT connected - show error and require authentication
 */
async function noSolidConnection(): Promise<void> {
  console.log("🔐 No Solid connection - authentication required");

  // Show Solid connection error - authentication required
  if (errorDisplay) {
    errorDisplay.showSolidConnectionError();
  }
}

/**
 * Bootstrap manager class for JavaScript interop
 */
class BootstrapManager {
  public timeline: TimelineContainer | null = null;
  public errorDisplay: SolidConnectionErrorDisplay | null = null;

  async retrySolidConnection(): Promise<void> {
    console.log("🔄 Retrying Solid Pod connection...");
    if (this.errorDisplay) {
      this.errorDisplay.clearError("solid-connection");
    }
    // Restart the bootstrap process
    await startBootstrap();
  }

  getInitializationStatus(): {
    initialized: boolean;
    hasTimeline: boolean;
    hasErrorDisplay: boolean;
  } {
    return {
      initialized,
      hasTimeline: timeline !== null,
      hasErrorDisplay: errorDisplay !== null,
    };
  }
}

// Create global bootstrap instance
const bootstrapInstance = new BootstrapManager();

// Make bootstrap instance available globally
declare global {
  interface Window {
    bootstrapInstance: BootstrapManager;
    meraBridge: any; // Will be properly typed later
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
