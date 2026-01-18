/**
 * @fileoverview New user welcome component interface
 * @module components/interfaces/newUserWelcomeInterface
 * 
 * Renders multi-step welcome flow for new users to configure initial settings
 * Uses progressive disclosure (one screen at a time) for focused UX
 * 
 * KEY BEHAVIOR: Settings are queued IMMEDIATELY as user makes choices,
 * not deferred until "Finish" button. Accessibility options are applied
 * dynamically to provide instant visual feedback.
 */

import { 
  BaseComponentInterface,
  BaseComponentInterfaceInternalState 
} from "./baseComponentInterface.js";
import {
  NewUserWelcomeCore,
  NewUserWelcomeComponentConfig,
  NewUserWelcomeComponentProgress,
} from "../cores/newUserWelcomeCore.js";
import { TimelineContainer } from "../../ui/timelineContainer.js";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Internal state for welcome component interface
 * Tracks current screen and navigation history
 */
interface NewUserWelcomeInternalState extends BaseComponentInterfaceInternalState {
  currentScreen: WelcomeScreen;
  screenHistory: WelcomeScreen[];
  userChoices: UserChoices;
}

type WelcomeScreen =
  | "welcome"
  | "accessibility-gateway"
  | "accessibility-options"
  | "telemetry"
  | "learning-pace"
  | "week-start"
  | "complete";

type LearningPaceChoice = "accelerated" | "standard" | "flexible";
type WeekDay = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

interface AccessibilityOptions {
  fontSize: "small" | "medium" | "large";
  highContrast: boolean;
  reducedMotion: boolean;
  focusIndicatorStyle: "default" | "enhanced";
  audioEnabled: boolean;
}

interface UserChoices {
  showAccessibility: boolean;
  accessibilityOptions: AccessibilityOptions;
  optOutTelemetry: boolean;
  learningPace: LearningPaceChoice;
  weekStartDay: WeekDay;
  weekStartTime: string; // HH:MM in local time
}

// ============================================================================
// COMPONENT INTERFACE
// ============================================================================

export class NewUserWelcomeInterface extends BaseComponentInterface<
  NewUserWelcomeComponentConfig,
  NewUserWelcomeComponentProgress,
  NewUserWelcomeInternalState
> {
  // Type-safe reference to the specific core instance
  protected declare componentCore: NewUserWelcomeCore;

  constructor(
    core: NewUserWelcomeCore,
    timeline: TimelineContainer
  ) {
    super(core, timeline);
  }

  /**
   * Create initial internal state
   */
  protected createInternalState(): NewUserWelcomeInternalState {
    return {
      rendered: false,
      currentScreen: "welcome",
      screenHistory: [],
      userChoices: {
        showAccessibility: false,
        accessibilityOptions: {
          fontSize: "medium",
          highContrast: false,
          reducedMotion: false,
          focusIndicatorStyle: "default",
          audioEnabled: false,
        },
        optOutTelemetry: false,
        learningPace: "standard",
        weekStartDay: "monday",
        weekStartTime: "00:00",
      },
    };
  }

  /**
   * Load component-specific assets
   * No external assets needed for this component
   */
  async loadComponentSpecificAssets(): Promise<void> {
    // No assets to load
    return Promise.resolve();
  }

  /**
   * Cleanup method - remove event listeners
   */
  destroy(): void {
    // No persistent event listeners to clean up
    // All listeners are re-attached on each render
  }

  /**
   * Main render method - delegates to screen-specific renderers
   */
  render(): void {
    const slot = this.timelineContainer.getComponentArea(this.componentCore.config.id);
    if (!slot) {
      console.error(`Slot not found for component ${this.componentCore.config.id}`);
      return;
    }

    let screenHtml = "";
    switch (this.internal.currentScreen) {
      case "welcome":
        screenHtml = this.renderWelcomeScreen();
        break;
      case "accessibility-gateway":
        screenHtml = this.renderAccessibilityGatewayScreen();
        break;
      case "accessibility-options":
        screenHtml = this.renderAccessibilityOptionsScreen();
        break;
      case "telemetry":
        screenHtml = this.renderTelemetryScreen();
        break;
      case "learning-pace":
        screenHtml = this.renderLearningPaceScreen();
        break;
      case "week-start":
        screenHtml = this.renderWeekStartScreen();
        break;
      case "complete":
        screenHtml = this.renderCompleteScreen();
        break;
    }

    slot.innerHTML = screenHtml;
    this.attachEventListeners();
  }

  // ==========================================================================
  // SCREEN RENDERERS
  // ==========================================================================

  private renderWelcomeScreen(): string {
    return `
      <div class="max-w-2xl mx-auto text-center space-y-6">
        <h2 class="text-3xl font-bold text-gray-900 dark:text-white">
          Welcome to Mera! 🌱
        </h2>
        <p class="text-lg text-gray-700 dark:text-gray-300">
          Let's take a moment to set up your learning experience. 
          This will only take a minute.
        </p>
        <div class="pt-4">
          <button 
            id="btn-start"
            class="bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-lg font-bold text-lg transition-colors">
            Let's Get Started
          </button>
        </div>
      </div>
    `;
  }

  private renderAccessibilityGatewayScreen(): string {
    return `
      <div class="max-w-2xl mx-auto space-y-6">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white text-center">
          Accessibility Options
        </h2>
        <p class="text-lg text-gray-700 dark:text-gray-300 text-center">
          Mera is for everyone. Would you like to customize accessibility settings?
        </p>
        <p class="text-sm text-gray-600 dark:text-gray-400 text-center">
          If an option you need is missing, please let us know.
        </p>
        <div class="flex flex-col gap-4 pt-4">
          <div class="flex justify-between items-center">
            <button 
              id="btn-back"
              class="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-semibold">
              ← Back
            </button>
          </div>
          <div class="flex flex-col sm:flex-row gap-4 justify-center">
            <button 
              id="btn-show-accessibility"
              class="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors">
              Yes, Show Options
            </button>
            <button 
              id="btn-skip-accessibility"
              class="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors">
              No Thanks, Use Defaults
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderAccessibilityOptionsScreen(): string {
    const opts = this.internal.userChoices.accessibilityOptions;
    
    return `
      <div class="max-w-2xl mx-auto space-y-6">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
          Customize Accessibility
        </h2>
        <p class="text-gray-700 dark:text-gray-300">
          Select the options that work best for you. Changes apply immediately.
        </p>
        
        <div class="space-y-4">
          <!-- Font Size -->
          <div class="bg-white dark:bg-gray-700 p-4 rounded-lg">
            <label class="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Font Size
            </label>
            <select 
              id="select-font-size"
              class="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white">
              <option value="small" ${opts.fontSize === "small" ? "selected" : ""}>Small</option>
              <option value="medium" ${opts.fontSize === "medium" ? "selected" : ""}>Medium (Default)</option>
              <option value="large" ${opts.fontSize === "large" ? "selected" : ""}>Large</option>
            </select>
          </div>

          <!-- High Contrast -->
          <div class="bg-white dark:bg-gray-700 p-4 rounded-lg">
            <label class="flex items-center space-x-3">
              <input 
                type="checkbox" 
                id="check-high-contrast"
                ${opts.highContrast ? "checked" : ""}
                class="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500">
              <span class="text-sm font-semibold text-gray-900 dark:text-white">
                High Contrast Mode
              </span>
            </label>
          </div>

          <!-- Reduced Motion -->
          <div class="bg-white dark:bg-gray-700 p-4 rounded-lg">
            <label class="flex items-center space-x-3">
              <input 
                type="checkbox" 
                id="check-reduced-motion"
                ${opts.reducedMotion ? "checked" : ""}
                class="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500">
              <span class="text-sm font-semibold text-gray-900 dark:text-white">
                Reduce Motion & Animations
              </span>
            </label>
          </div>

          <!-- Focus Style -->
          <div class="bg-white dark:bg-gray-700 p-4 rounded-lg">
            <label class="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Focus Indicator Style
            </label>
            <select 
              id="select-focus-style"
              class="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white">
              <option value="default" ${opts.focusIndicatorStyle === "default" ? "selected" : ""}>Default</option>
              <option value="enhanced" ${opts.focusIndicatorStyle === "enhanced" ? "selected" : ""}>Enhanced (More Visible)</option>
            </select>
          </div>

          <!-- Audio -->
          <div class="bg-white dark:bg-gray-700 p-4 rounded-lg">
            <label class="flex items-center space-x-3">
              <input 
                type="checkbox" 
                id="check-audio-enabled"
                ${opts.audioEnabled ? "checked" : ""}
                class="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500">
              <span class="text-sm font-semibold text-gray-900 dark:text-white">
                Enable Audio Descriptions
              </span>
            </label>
          </div>
        </div>

        <div class="flex justify-between items-center pt-4">
          <button 
            id="btn-back"
            class="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-semibold">
            ← Back
          </button>
          <button 
            id="btn-continue-accessibility"
            class="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors">
            Continue
          </button>
        </div>
      </div>
    `;
  }

  private renderTelemetryScreen(): string {
    return `
      <div class="max-w-2xl mx-auto space-y-6">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
          Privacy & Telemetry
        </h2>
        <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-3">
          <p class="text-gray-700 dark:text-gray-300">
            We believe in <strong>privacy</strong>. We only collect simple anonymous counters:
          </p>
          <ul class="list-disc list-inside text-gray-700 dark:text-gray-300 space-y-1 ml-4">
            <li>Number of active users (daily ping)</li>
            <li>Major error reports (to fix bugs)</li>
          </ul>
          <p class="text-gray-700 dark:text-gray-300">
            These reveal <strong>nothing</strong> about your identity, location, or activity.
          </p>
        </div>
        
        <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <p class="text-sm text-gray-700 dark:text-gray-300">
            <strong>Note:</strong> We keep 48 hours of IP address logs to protect against 
            denial-of-service attacks. Use a VPN if you want to hide your IP address.
          </p>
        </div>

        <div class="flex flex-col gap-4 pt-4">
          <button 
            id="btn-back"
            class="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-semibold text-left">
            ← Back
          </button>
          <div class="flex flex-col sm:flex-row gap-4 justify-center">
            <button 
              id="btn-telemetry-accept"
              class="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors">
              That's Fine
            </button>
            <button 
              id="btn-telemetry-optout"
              class="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors">
              Opt Out
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderLearningPaceScreen(): string {
    return `
      <div class="max-w-2xl mx-auto space-y-6">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
          Your Learning Pace
        </h2>
        <p class="text-lg text-gray-700 dark:text-gray-300">
          Mera gently encourages you to stick with making digital security improvements 
          by tracking weekly goals. Lessons are typically 10 minutes long.
        </p>
        <p class="text-gray-700 dark:text-gray-300">
          How many lessons would you like to complete per week?
        </p>
        
        <div class="space-y-3">
          <button 
            id="btn-pace-accelerated"
            class="w-full bg-white dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 hover:border-green-600 dark:hover:border-green-500 p-4 rounded-lg text-left transition-colors">
            <div class="font-bold text-gray-900 dark:text-white text-lg">Accelerated (2 lessons)</div>
            <div class="text-gray-600 dark:text-gray-400 text-sm">For those who want to move quickly</div>
          </button>
          
          <button 
            id="btn-pace-standard"
            class="w-full bg-white dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 hover:border-green-600 dark:hover:border-green-500 p-4 rounded-lg text-left transition-colors">
            <div class="font-bold text-gray-900 dark:text-white text-lg">Standard (1 lesson) ⭐ Recommended</div>
            <div class="text-gray-600 dark:text-gray-400 text-sm">Steady progress without feeling rushed</div>
          </button>
          
          <button 
            id="btn-pace-flexible"
            class="w-full bg-white dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 hover:border-green-600 dark:hover:border-green-500 p-4 rounded-lg text-left transition-colors">
            <div class="font-bold text-gray-900 dark:text-white text-lg">Flexible (Learn at your own pace)</div>
            <div class="text-gray-600 dark:text-gray-400 text-sm">No weekly goals, just track your progress</div>
          </button>
        </div>

        <div class="pt-4">
          <button 
            id="btn-back"
            class="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-semibold">
            ← Back
          </button>
        </div>
      </div>
    `;
  }

  private renderWeekStartScreen(): string {
    const day = this.internal.userChoices.weekStartDay;
    const time = this.internal.userChoices.weekStartTime;
    
    return `
      <div class="max-w-2xl mx-auto space-y-6">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
          When Does Your Week Start?
        </h2>
        <p class="text-gray-700 dark:text-gray-300">
          Weekly goals reset at the start of your week. Choose when that should be:
        </p>
        
        <div class="space-y-4">
          <div class="bg-white dark:bg-gray-700 p-4 rounded-lg">
            <label class="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Day of Week
            </label>
            <select 
              id="select-week-day"
              class="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white">
              <option value="monday" ${day === "monday" ? "selected" : ""}>Monday</option>
              <option value="tuesday" ${day === "tuesday" ? "selected" : ""}>Tuesday</option>
              <option value="wednesday" ${day === "wednesday" ? "selected" : ""}>Wednesday</option>
              <option value="thursday" ${day === "thursday" ? "selected" : ""}>Thursday</option>
              <option value="friday" ${day === "friday" ? "selected" : ""}>Friday</option>
              <option value="saturday" ${day === "saturday" ? "selected" : ""}>Saturday</option>
              <option value="sunday" ${day === "sunday" ? "selected" : ""}>Sunday</option>
            </select>
          </div>

          <div class="bg-white dark:bg-gray-700 p-4 rounded-lg">
            <label class="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Time of Day (Your Local Time)
            </label>
            <input 
              type="time"
              id="input-week-time"
              value="${time}"
              class="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white">
          </div>
        </div>

        <div class="flex justify-between items-center pt-4">
          <button 
            id="btn-back"
            class="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-semibold">
            ← Back
          </button>
          <button 
            id="btn-save-week-start"
            class="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors">
            Continue
          </button>
        </div>
      </div>
    `;
  }

  private renderCompleteScreen(): string {
    return `
      <div class="max-w-2xl mx-auto text-center space-y-6">
        <div class="text-6xl">✅</div>
        <h2 class="text-3xl font-bold text-gray-900 dark:text-white">
          You're All Set!
        </h2>
        <p class="text-lg text-gray-700 dark:text-gray-300">
          Your settings have been saved. Let's begin your journey to better digital security.
        </p>
        <div class="pt-4">
          <button 
            id="btn-finish"
            class="bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-lg font-bold text-lg transition-colors">
            Start Learning
          </button>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================

  private attachEventListeners(): void {
    console.log(`🔗 Attaching event listeners for screen: ${this.internal.currentScreen}`);
    
    // Back button (common to most screens)
    document.getElementById("btn-back")?.addEventListener("click", () => {
      this.goBack();
    });

    // Welcome screen
    document.getElementById("btn-start")?.addEventListener("click", () => {
      this.advanceToScreen("accessibility-gateway");
    });

    // Accessibility gateway
    document.getElementById("btn-show-accessibility")?.addEventListener("click", () => {
      this.internal.userChoices.showAccessibility = true;
      this.advanceToScreen("accessibility-options");
    });

    document.getElementById("btn-skip-accessibility")?.addEventListener("click", () => {
      this.internal.userChoices.showAccessibility = false;
      // Queue default accessibility settings immediately
      this.queueAccessibilitySettings();
      this.advanceToScreen("telemetry");
    });

    // Accessibility options - attach listeners for IMMEDIATE queuing
    this.attachAccessibilityListeners();

    document.getElementById("btn-continue-accessibility")?.addEventListener("click", () => {
      // No need to queue here - already queued on each change
      this.advanceToScreen("telemetry");
    });

    // Telemetry
    document.getElementById("btn-telemetry-accept")?.addEventListener("click", () => {
      this.internal.userChoices.optOutTelemetry = false;
      // Queue telemetry setting immediately
      this.queueTelemetrySettings();
      this.advanceToScreen("learning-pace");
    });

    document.getElementById("btn-telemetry-optout")?.addEventListener("click", () => {
      this.internal.userChoices.optOutTelemetry = true;
      // Queue telemetry setting immediately
      this.queueTelemetrySettings();
      this.advanceToScreen("learning-pace");
    });

    // Learning pace
    document.getElementById("btn-pace-accelerated")?.addEventListener("click", () => {
      this.internal.userChoices.learningPace = "accelerated";
      // Queue learning pace immediately
      this.componentCore.queueSettingsMessage({
        method: "setLearningPace",
        args: ["accelerated"],
      });
      this.advanceToScreen("week-start");
    });

    document.getElementById("btn-pace-standard")?.addEventListener("click", () => {
      this.internal.userChoices.learningPace = "standard";
      // Queue learning pace immediately
      this.componentCore.queueSettingsMessage({
        method: "setLearningPace",
        args: ["standard"],
      });
      this.advanceToScreen("week-start");
    });

    document.getElementById("btn-pace-flexible")?.addEventListener("click", () => {
      this.internal.userChoices.learningPace = "flexible";
      // Queue learning pace immediately
      this.componentCore.queueSettingsMessage({
        method: "setLearningPace",
        args: ["flexible"],
      });
      // Skip week-start for flexible pace
      this.advanceToScreen("complete");
    });

    // Week start
    document.getElementById("btn-save-week-start")?.addEventListener("click", () => {
      // Capture and queue week start settings
      this.captureAndQueueWeekStartChoices();
      this.advanceToScreen("complete");
    });

    // Complete - queue theme and navigate
    document.getElementById("btn-finish")?.addEventListener("click", () => {
      console.log("✅ Finish button clicked - queuing theme and navigation");
      // Queue theme (always auto)
      this.componentCore.queueSettingsMessage({
        method: "setTheme",
        args: ["auto"],
      });
      // Queue navigation to main menu
      this.componentCore.queueNavigationToMainMenu();
    });
  }

  /**
   * Attach listeners for accessibility options that apply changes immediately
   */
  private attachAccessibilityListeners(): void {
    // Font size - queue and apply immediately
    const fontSizeSelect = document.getElementById("select-font-size") as HTMLSelectElement;
    fontSizeSelect?.addEventListener("change", () => {
      const fontSize = fontSizeSelect.value as "small" | "medium" | "large";
      this.internal.userChoices.accessibilityOptions.fontSize = fontSize;
      
      // Queue to settings
      this.componentCore.queueSettingsMessage({
        method: "setFontSize",
        args: [fontSize],
      });
      
      // Apply immediately to DOM
      this.applyFontSize(fontSize);
    });

    // High contrast - queue and apply immediately
    const highContrastCheck = document.getElementById("check-high-contrast") as HTMLInputElement;
    highContrastCheck?.addEventListener("change", () => {
      const highContrast = highContrastCheck.checked;
      this.internal.userChoices.accessibilityOptions.highContrast = highContrast;
      
      // Queue to settings
      this.componentCore.queueSettingsMessage({
        method: "setHighContrast",
        args: [highContrast],
      });
      
      // Apply immediately to DOM
      this.applyHighContrast(highContrast);
    });

    // Reduced motion - queue and apply immediately
    const reducedMotionCheck = document.getElementById("check-reduced-motion") as HTMLInputElement;
    reducedMotionCheck?.addEventListener("change", () => {
      const reducedMotion = reducedMotionCheck.checked;
      this.internal.userChoices.accessibilityOptions.reducedMotion = reducedMotion;
      
      // Queue to settings
      this.componentCore.queueSettingsMessage({
        method: "setReducedMotion",
        args: [reducedMotion],
      });
      
      // Apply immediately to DOM
      this.applyReducedMotion(reducedMotion);
    });

    // Focus style - queue and apply immediately
    const focusStyleSelect = document.getElementById("select-focus-style") as HTMLSelectElement;
    focusStyleSelect?.addEventListener("change", () => {
      const focusStyle = focusStyleSelect.value as "default" | "enhanced";
      this.internal.userChoices.accessibilityOptions.focusIndicatorStyle = focusStyle;
      
      // Queue to settings
      this.componentCore.queueSettingsMessage({
        method: "setFocusIndicatorStyle",
        args: [focusStyle],
      });
      
      // Apply immediately to DOM
      this.applyFocusStyle(focusStyle);
    });

    // Audio enabled - queue immediately
    const audioEnabledCheck = document.getElementById("check-audio-enabled") as HTMLInputElement;
    audioEnabledCheck?.addEventListener("change", () => {
      const audioEnabled = audioEnabledCheck.checked;
      this.internal.userChoices.accessibilityOptions.audioEnabled = audioEnabled;
      
      // Queue to settings
      this.componentCore.queueSettingsMessage({
        method: "setAudioEnabled",
        args: [audioEnabled],
      });
    });
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private advanceToScreen(screen: WelcomeScreen): void {
    // Save current screen to history
    this.internal.screenHistory.push(this.internal.currentScreen);
    this.internal.currentScreen = screen;
    this.render();
  }

  private goBack(): void {
    // Pop from history
    const previousScreen = this.internal.screenHistory.pop();
    if (previousScreen) {
      this.internal.currentScreen = previousScreen;
      this.render();
    }
  }

  /**
   * Queue all accessibility settings (used when skipping accessibility options)
   */
  private queueAccessibilitySettings(): void {
    const opts = this.internal.userChoices.accessibilityOptions;
    
    this.componentCore.queueSettingsMessage({
      method: "setFontSize",
      args: [opts.fontSize],
    });
    this.componentCore.queueSettingsMessage({
      method: "setHighContrast",
      args: [opts.highContrast],
    });
    this.componentCore.queueSettingsMessage({
      method: "setReducedMotion",
      args: [opts.reducedMotion],
    });
    this.componentCore.queueSettingsMessage({
      method: "setFocusIndicatorStyle",
      args: [opts.focusIndicatorStyle],
    });
    this.componentCore.queueSettingsMessage({
      method: "setAudioEnabled",
      args: [opts.audioEnabled],
    });
  }

  /**
   * Queue telemetry settings
   */
  private queueTelemetrySettings(): void {
    this.componentCore.queueSettingsMessage({
      method: "setOptOutDailyPing",
      args: [this.internal.userChoices.optOutTelemetry],
    });
    this.componentCore.queueSettingsMessage({
      method: "setOptOutErrorPing",
      args: [this.internal.userChoices.optOutTelemetry],
    });
  }

  /**
   * Capture week start choices from DOM and queue immediately
   */
  private captureAndQueueWeekStartChoices(): void {
    const day = (document.getElementById("select-week-day") as HTMLSelectElement)?.value || "monday";
    const time = (document.getElementById("input-week-time") as HTMLInputElement)?.value || "00:00";

    this.internal.userChoices.weekStartDay = day as WeekDay;
    this.internal.userChoices.weekStartTime = time;

    // Queue week start day
    this.componentCore.queueSettingsMessage({
      method: "setWeekStartDay",
      args: [day as WeekDay],
    });

    // Convert local time to UTC and queue
    const utcTime = this.convertLocalTimeToUTC(time);
    this.componentCore.queueSettingsMessage({
      method: "setWeekStartTimeUTC",
      args: [utcTime],
    });
  }

  /**
   * Convert local time to UTC for storage
   * 
   * @param localTime - Time in HH:MM format (local timezone)
   * @returns Time in HH:MM format (UTC timezone)
   */
  private convertLocalTimeToUTC(localTime: string): string {
    const [hours, minutes] = localTime.split(":").map(Number);
    
    // Create date object with today's date and specified time in local timezone
    const localDate = new Date();
    localDate.setHours(hours, minutes, 0, 0);
    
    // Get UTC hours and minutes
    const utcHours = localDate.getUTCHours();
    const utcMinutes = localDate.getUTCMinutes();
    
    // Format as HH:MM
    const utcTime = `${String(utcHours).padStart(2, "0")}:${String(utcMinutes).padStart(2, "0")}`;
    
    return utcTime;
  }

  // ==========================================================================
  // DYNAMIC ACCESSIBILITY APPLICATION
  // ==========================================================================

  /**
   * Apply font size changes to the document root
   */
  private applyFontSize(size: "small" | "medium" | "large"): void {
    const root = document.documentElement;
    root.classList.remove("font-size-small", "font-size-medium", "font-size-large");
    root.classList.add(`font-size-${size}`);
    console.log(`✨ Applied font size: ${size}`);
  }

  /**
   * Apply high contrast changes to the document root
   */
  private applyHighContrast(enabled: boolean): void {
    const root = document.documentElement;
    if (enabled) {
      root.classList.add("high-contrast");
    } else {
      root.classList.remove("high-contrast");
    }
    console.log(`✨ Applied high contrast: ${enabled}`);
  }

  /**
   * Apply reduced motion changes to the document root
   */
  private applyReducedMotion(enabled: boolean): void {
    const root = document.documentElement;
    if (enabled) {
      root.classList.add("reduce-motion");
    } else {
      root.classList.remove("reduce-motion");
    }
    console.log(`✨ Applied reduced motion: ${enabled}`);
  }

  /**
   * Apply focus indicator style changes to the document root
   */
  private applyFocusStyle(style: "default" | "enhanced"): void {
    const root = document.documentElement;
    root.classList.remove("focus-default", "focus-enhanced");
    root.classList.add(`focus-${style}`);
    console.log(`✨ Applied focus style: ${style}`);
  }
}