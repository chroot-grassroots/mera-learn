"use strict";
(() => {
  // src/ts/ui/timelineContainer.ts
  var TimelineContainer = class {
    constructor(containerId = "lesson-container") {
      this.containerId = containerId;
      this.timelineId = `${containerId}-timeline`;
      this.errorSlotId = `${containerId}-error-slot`;
      this.setupTimelineStructure();
    }
    /**
     * Create the basic timeline DOM structure
     */
    setupTimelineStructure() {
      const container = document.getElementById(this.containerId);
      if (!container) {
        throw new Error(`Container ${this.containerId} not found`);
      }
      container.innerHTML = "";
      const timelineHtml = `
            <div class="timeline-wrapper max-w-4xl mx-auto">
                <!-- Error slot (hidden by default) -->
                <div id="${this.errorSlotId}" class="hidden mb-6"></div>
                
                <!-- Main timeline -->
                <div id="${this.timelineId}" class="timeline-track relative">
                    <!-- Timeline line -->
                    <div class="timeline-line absolute left-8 top-0 bottom-0 w-0.5 bg-gray-300"></div>
                    
                    <!-- Component slots will be added here -->
                </div>
            </div>
        `;
      container.innerHTML = timelineHtml;
      console.log(`\u2705 Timeline structure created for ${this.containerId}`);
    }
    /**
     * Add a spatial slot for a component - matches learn.html card styling
     * @param componentId Unique identifier for the component
     * @param position Where to add the slot ('bottom' or 'top')
     * @returns Success status
     */
    addComponentSlot(componentId, position = "bottom") {
      const timeline2 = document.getElementById(this.timelineId);
      if (!timeline2) {
        console.error(`Timeline ${this.timelineId} not found`);
        return false;
      }
      const slotHtml = `
            <div id="slot-${componentId}" class="timeline-item relative flex items-start">
                <!-- Timeline dot -->
                <div class="timeline-dot relative z-10 flex items-center justify-center w-4 h-4 bg-white dark:bg-gray-800 border-2 border-blue-500 rounded-full mt-6">
                    <div class="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                </div>
                
                <!-- Component content area - matches learn.html card styling -->
                <div id="component-${componentId}" class="component-content ml-6 flex-1 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
                    <!-- Core will inject component here -->
                    <div class="loading-placeholder text-center py-4">
                        <div class="flex items-center justify-center space-x-2 text-blue-600 dark:text-blue-400">
                            <svg class="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span class="text-sm font-medium">Loading component...</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
      if (position === "bottom") {
        timeline2.insertAdjacentHTML("beforeend", slotHtml);
      } else {
        timeline2.insertAdjacentHTML("afterbegin", slotHtml);
      }
      console.log(`\u2705 Added component slot for ${componentId}`);
      return true;
    }
    /**
     * Get the DOM element where core should inject the component
     * @param componentId Component identifier
     * @returns DOM element or null if not found
     */
    getComponentArea(componentId) {
      return document.getElementById(`component-${componentId}`);
    }
    /**
     * Remove a component slot from the timeline
     * @param componentId Component identifier
     * @returns Success status
     */
    removeComponentSlot(componentId) {
      const slot = document.getElementById(`slot-${componentId}`);
      if (slot) {
        slot.remove();
        console.log(`\u2705 Removed component slot for ${componentId}`);
        return true;
      }
      console.warn(`\u26A0\uFE0F Component slot ${componentId} not found for removal`);
      return false;
    }
    /**
     * Update visual state of a component slot (completed, active, locked)
     * @param componentId Component identifier
     * @param status New status to apply
     * @returns Success status
     */
    updateComponentStatus(componentId, status = "active") {
      const slot = document.getElementById(`slot-${componentId}`);
      if (!slot) {
        console.warn(`\u26A0\uFE0F Component slot ${componentId} not found for status update`);
        return false;
      }
      const dot = slot.querySelector(".timeline-dot div");
      const dotContainer = slot.querySelector(".timeline-dot");
      if (!dot || !dotContainer) {
        console.warn(`\u26A0\uFE0F Timeline dot elements not found for ${componentId}`);
        return false;
      }
      dot.className = "w-2 h-2 rounded-full";
      switch (status) {
        case "completed":
          dot.classList.add("bg-green-500");
          dotContainer.className = dotContainer.className.replace(/border-(blue|gray)-\d+/, "border-green-500");
          break;
        case "active":
          dot.classList.add("bg-blue-500");
          dotContainer.className = dotContainer.className.replace(/border-(green|gray)-\d+/, "border-blue-500");
          break;
        case "locked":
          dot.classList.add("bg-gray-400");
          dotContainer.className = dotContainer.className.replace(/border-(blue|green)-\d+/, "border-gray-400");
          break;
      }
      console.log(`\u2705 Updated component ${componentId} status to ${status}`);
      return true;
    }
    /**
     * Get the error display area for the error handler
     * @returns Error slot DOM element or null
     */
    getErrorSlot() {
      return document.getElementById(this.errorSlotId);
    }
    /**
     * Remove all component slots from the timeline
     */
    clearTimeline() {
      const timeline2 = document.getElementById(this.timelineId);
      if (timeline2) {
        const slots = timeline2.querySelectorAll(".timeline-item");
        slots.forEach((slot) => slot.remove());
        console.log("\u{1F9F9} Timeline cleared of all component slots");
      }
    }
    /**
     * Update the timeline line to show overall progress
     * @param completedCount Number of completed components
     * @param totalCount Total number of components
     */
    setTimelineProgress(completedCount, totalCount) {
      if (totalCount === 0) {
        console.warn("\u26A0\uFE0F Cannot set progress: total count is 0");
        return;
      }
      const progressPercent = completedCount / totalCount * 100;
      const timeline2 = document.getElementById(this.timelineId);
      if (!timeline2) {
        console.warn("\u26A0\uFE0F Timeline not found for progress update");
        return;
      }
      const timelineLine = timeline2.querySelector(".timeline-line");
      if (timelineLine) {
        timelineLine.innerHTML = `
                <div class="progress-fill absolute top-0 left-0 w-full bg-green-400" 
                     style="height: ${progressPercent}%; transition: height 0.3s ease;"></div>
            `;
        console.log(`\u{1F4CA} Timeline progress updated: ${completedCount}/${totalCount} (${progressPercent.toFixed(1)}%)`);
      }
    }
    /**
     * Get basic timeline statistics
     * @returns Object with timeline metrics
     */
    getTimelineStats() {
      const timeline2 = document.getElementById(this.timelineId);
      const totalSlots = timeline2 ? timeline2.querySelectorAll(".timeline-item").length : 0;
      return {
        totalSlots,
        containerId: this.containerId,
        timelineId: this.timelineId
      };
    }
  };

  // src/ts/ui/errorDisplay.ts
  var ErrorDisplay = class {
    constructor(timelineContainer = null) {
      this.activeErrors = /* @__PURE__ */ new Map();
      this.timelineContainer = timelineContainer;
    }
    /**
     * Display a system error (YAML loading, TypeScript issues, etc.)
     */
    showSystemError(errorId = "system", context = "", details = "") {
      this._showError({
        errorId,
        errorType: "system",
        title: "System Error",
        message: "We're having trouble loading lesson content.",
        context,
        details,
        actions: ["check_connection", "refresh", "email_support"]
      });
    }
    /**
     * Display a network connectivity error
     */
    showNetworkError(errorId = "network", context = "") {
      this._showError({
        errorId,
        errorType: "network",
        title: "Connection Issue",
        message: "Unable to reach the server.",
        context,
        actions: ["check_connection", "retry", "email_support"]
      });
    }
    /**
     * Display an error specific to a component
     */
    showComponentError(componentId, errorMessage) {
      this._showError({
        errorId: `component-${componentId}`,
        errorType: "component",
        title: "Component Error",
        message: `Component ${componentId} encountered an issue.`,
        context: errorMessage,
        actions: ["refresh", "skip_component", "email_support"]
      });
    }
    /**
     * Remove a specific error
     */
    clearError(errorId) {
      if (this.activeErrors.has(errorId)) {
        const errorElement = document.getElementById(`error-${errorId}`);
        if (errorElement) {
          errorElement.remove();
        }
        this.activeErrors.delete(errorId);
        console.log(`\u{1F9F9} Cleared error: ${errorId}`);
      }
      if (this.activeErrors.size === 0) {
        this._hideErrorSlot();
      }
    }
    /**
     * Clear all active errors
     */
    clearAllErrors() {
      const errorIds = Array.from(this.activeErrors.keys());
      for (const errorId of errorIds) {
        this.clearError(errorId);
      }
      console.log("\u{1F9F9} All errors cleared");
    }
    /**
     * Internal method to display an error in the timeline's error slot
     */
    _showError(params) {
      const { errorId, errorType, title, message, context = "", details = "", actions = ["refresh", "email_support"] } = params;
      this.activeErrors.set(errorId, {
        type: errorType,
        title,
        message,
        context
      });
      const errorSlot = this._getErrorSlot();
      if (!errorSlot) {
        this._createFloatingError(errorId, title, message, actions);
        return;
      }
      const errorHtml = this._buildErrorHtml(errorId, title, message, context, details, actions);
      errorSlot.className = errorSlot.className.replace("hidden", "block");
      errorSlot.insertAdjacentHTML("beforeend", errorHtml);
      console.log(`\u274C Displayed error: ${errorId} (${errorType})`);
    }
    /**
     * Build the HTML for an error display
     */
    _buildErrorHtml(errorId, title, message, context, details, actions) {
      const contextHtml = context ? `<p class="text-sm text-red-600 mt-1"><strong>Context:</strong> ${context}</p>` : "";
      const detailsHtml = details ? `<details class="mt-2 text-xs text-red-500"><summary>Technical Details</summary><pre>${details}</pre></details>` : "";
      const actionsHtml = this._buildActionButtons(errorId, actions);
      return `
            <div id="error-${errorId}" class="error-item bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <div class="flex items-start">
                    <div class="flex-shrink-0">
                        <svg class="w-5 h-5 text-red-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                    </div>
                    <div class="ml-3 flex-1">
                        <h3 class="text-sm font-medium text-red-800">${title}</h3>
                        <p class="text-sm text-red-700 mt-1">${message}</p>
                        ${contextHtml}
                        ${detailsHtml}
                        <div class="mt-3 flex space-x-2">
                            ${actionsHtml}
                            <button onclick="window.errorDisplay?.clearError('${errorId}')" 
                                    class="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700">
                                Dismiss
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    /**
     * Build action buttons based on the provided actions list
     */
    _buildActionButtons(errorId, actions) {
      const buttons = [];
      for (const action of actions) {
        switch (action) {
          case "refresh":
            buttons.push(`
                        <button onclick="location.reload()" 
                                class="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700">
                            Refresh Page
                        </button>
                    `);
            break;
          case "retry":
            buttons.push(`
                        <button onclick="window.errorDisplay?._retryAction('${errorId}')" 
                                class="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">
                            Retry
                        </button>
                    `);
            break;
          case "email_support":
            buttons.push(`
                        <button onclick="window.open('mailto:support@meralearn.org?subject=Mera%20Learning%20Error')" 
                                class="text-xs bg-gray-600 text-white px-2 py-1 rounded hover:bg-gray-700">
                            Email Support
                        </button>
                    `);
            break;
          case "skip_component":
            buttons.push(`
                        <button onclick="window.errorDisplay?._skipComponent('${errorId}')" 
                                class="text-xs bg-yellow-600 text-white px-2 py-1 rounded hover:bg-yellow-700">
                            Skip Component
                        </button>
                    `);
            break;
        }
      }
      return buttons.join(" ");
    }
    /**
     * Get the error slot from the timeline container
     */
    _getErrorSlot() {
      if (this.timelineContainer) {
        return this.timelineContainer.getErrorSlot();
      } else {
        return document.getElementById("lesson-container-error-slot");
      }
    }
    /**
     * Hide the error slot when no errors are active
     */
    _hideErrorSlot() {
      const errorSlot = this._getErrorSlot();
      if (errorSlot) {
        errorSlot.className = errorSlot.className.replace("block", "hidden");
        errorSlot.innerHTML = "";
        console.log("\u{1F47B} Error slot hidden");
      }
    }
    /**
     * Fallback: create a floating error if no timeline container is available
     */
    _createFloatingError(errorId, title, message, actions) {
      let floatingContainer = document.getElementById("floating-errors");
      if (!floatingContainer) {
        floatingContainer = document.createElement("div");
        floatingContainer.id = "floating-errors";
        floatingContainer.className = "fixed top-4 right-4 z-50 max-w-md";
        document.body.appendChild(floatingContainer);
      }
      const errorHtml = `
            <div id="error-${errorId}" class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-4 border">
                <div class="text-center">
                    <div class="flex items-center justify-center space-x-2 text-red-600 mb-2">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <span class="font-semibold">${title}</span>
                    </div>
                    <p class="text-red-500 text-sm mb-4">${message}</p>
                    <div class="flex justify-center space-x-2">
                        ${this._buildActionButtons(errorId, actions)}
                        <button onclick="window.errorDisplay?.clearError('${errorId}')" 
                                class="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors">
                            Dismiss
                        </button>
                    </div>
                </div>
            </div>
        `;
      floatingContainer.insertAdjacentHTML("beforeend", errorHtml);
      console.log(`\u{1F4AB} Created floating error: ${errorId}`);
    }
    /**
     * Handle retry action - to be implemented by core or overridden
     */
    _retryAction(errorId) {
      console.log(`\u{1F504} Retry requested for error: ${errorId}`);
      this.clearError(errorId);
    }
    /**
     * Handle skip component action - to be implemented by core or overridden
     */
    _skipComponent(errorId) {
      console.log(`\u23ED\uFE0F Skip component requested for error: ${errorId}`);
      this.clearError(errorId);
    }
  };
  var SolidConnectionErrorDisplay = class extends ErrorDisplay {
    /**
     * Display Solid Pod connection failure with retry option
     */
    showSolidConnectionError() {
      this._showError({
        errorId: "solid-connection",
        errorType: "solid",
        title: "Solid Pod Connection Failed",
        message: "Solid pod connection failed. Please try connecting to Solid pod again. If issues persist, please email support@meralearn.org.",
        context: "Authentication with your Solid Pod provider was unsuccessful",
        actions: ["retry_solid", "email_support"]
      });
    }
    /**
     * Override to add Solid-specific actions
     */
    _buildActionButtons(errorId, actions) {
      const buttons = [];
      for (const action of actions) {
        if (action === "retry_solid") {
          buttons.push(`
                    <button onclick="window.location.href = window.CONNECT_URL || '/pages/connect/'" 
                            class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors">
                        Try Connecting Again
                    </button>
                `);
        } else if (action === "email_support") {
          buttons.push(`
                    <button onclick="window.open('mailto:support@meralearn.org?subject=Solid%20Pod%20Connection%20Issue')" 
                            class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors">
                        Email Support
                    </button>
                `);
        } else {
          const parentButtons = super._buildActionButtons(errorId, [action]);
          if (parentButtons) {
            buttons.push(parentButtons);
          }
        }
      }
      return buttons.join(" ");
    }
  };
  window.ErrorDisplay = ErrorDisplay;
  window.SolidConnectionErrorDisplay = SolidConnectionErrorDisplay;

  // src/ts/initialization/progressLoading.ts
  function orchestrateProgressLoading() {
  }

  // src/ts/initialization/bootstrap.ts
  var MAX_ATTEMPTS = 50;
  var POLL_INTERVAL_MS = 100;
  var timeline = null;
  var errorDisplay = null;
  function initializeWhenReady() {
    console.log("\u{1F680} Starting initialization...");
    window.bootstrapInstance = bootstrapInstance;
    try {
      setupUI();
      console.log("Error UI setup successfully!");
    } catch (uiError) {
      console.error("\u{1F4A5} UI setup failed:", uiError);
      console.error("Cannot continue - refresh the page");
      return;
    }
    startBootstrap().catch((error) => {
      console.error("\u{1F4A5} Bootstrap startup failed:", error);
      showBootstrapError(error);
    });
  }
  function setupUI() {
    console.log("\u{1F3A8} Setting up UI components...");
    const authStatus = document.getElementById("auth-status");
    if (authStatus) {
      authStatus.classList.add("hidden");
    }
    const lessonContainer = document.getElementById("lesson-container");
    if (lessonContainer) {
      lessonContainer.classList.remove("hidden");
    }
    timeline = new TimelineContainer("lesson-container");
    errorDisplay = new SolidConnectionErrorDisplay(timeline);
    console.log("\u2705 UI components initialized");
  }
  function showBootstrapError(error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    if (errorDisplay) {
      errorDisplay.showSystemError(
        "bootstrap-init",
        "Bootstrap initialization failed",
        errorMessage
      );
      return;
    }
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
  async function startBootstrap() {
    console.log("\u{1F680} BOOTSTRAP: start_bootstrap() function called!");
    let solidSessionReady = false;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        if (window.meraBridge && await window.meraBridge.check()) {
          solidSessionReady = true;
          console.log(`\u2705 Bridge ready on attempt ${attempt + 1}`);
          break;
        } else {
          console.log(
            `\u{1F504} Attempt ${attempt + 1}/${MAX_ATTEMPTS} - Bridge not ready`
          );
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }
      } catch (error) {
        console.log(
          `\u274C Attempt ${attempt + 1}/${MAX_ATTEMPTS} - Error: ${error}`
        );
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    }
    if (solidSessionReady) {
      continueToNextModule();
    } else {
      console.log("\u274C Solid pod not connected. Authentication required.");
      noSolidConnection();
    }
  }
  function continueToNextModule() {
    console.log("\u{1F517} Solid Pod connected - initializing learning platform");
    try {
      orchestrateProgressLoading();
      console.log("\u2705 Initialization sequence started successfully");
    } catch (error) {
      console.error("\u274C Failed to start initialization sequence:", error);
      if (errorDisplay) {
        errorDisplay.showSystemError(
          "initialization-startup",
          "Failed to start learning platform initialization",
          error instanceof Error ? error.message : "Unknown startup error"
        );
      }
    }
  }
  function noSolidConnection() {
    console.log("\u{1F510} No Solid connection - authentication required");
    if (errorDisplay) {
      errorDisplay.showSolidConnectionError();
    }
  }
  var BootstrapManager = class {
    async retrySolidConnection() {
      console.log("\u{1F504} Retrying Solid Pod connection...");
      if (errorDisplay) {
        errorDisplay.clearError("solid-connection");
      }
      return startBootstrap();
    }
  };
  var bootstrapInstance = new BootstrapManager();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeWhenReady);
  } else {
    initializeWhenReady();
  }
})();
