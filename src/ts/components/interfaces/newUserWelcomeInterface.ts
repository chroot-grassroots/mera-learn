/**
 * @fileoverview New user welcome component interface
 * @module components/interfaces/newUserWelcomeInterface
 * 
 * Renders multi-step welcome flow for new users to configure initial settings
 * Uses progressive disclosure (one screen at a time) for focused UX
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
              class="bg-amber-700 hover:bg-amber-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors">
              No Thanks, Use Defaults
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderAccessibilityOptionsScreen(): string {
    return `
      <div class="max-w-2xl mx-auto space-y-6">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
          Customize Accessibility
        </h2>
        <p class="text-gray-700 dark:text-gray-300">
          Select the options that work best for you:
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
              <option value="small">Small</option>
              <option value="medium" selected>Medium (Default)</option>
              <option value="large">Large</option>
            </select>
          </div>

          <!-- High Contrast -->
          <div class="bg-white dark:bg-gray-700 p-4 rounded-lg">
            <label class="flex items-center space-x-3">
              <input 
                type="checkbox" 
                id="check-high-contrast"
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
                class="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500">
              <span class="text-sm font-semibold text-gray-900 dark:text-white">
                Reduce Motion & Animations
              </span>
            </label>
          </div>

          <!-- Focus Indicator -->
          <div class="bg-white dark:bg-gray-700 p-4 rounded-lg">
            <label class="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Focus Indicators
            </label>
            <select 
              id="select-focus-style"
              class="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white">
              <option value="default" selected>Default</option>
              <option value="enhanced">Enhanced (More Visible)</option>
            </select>
          </div>

          <!-- Audio -->
          <div class="bg-white dark:bg-gray-700 p-4 rounded-lg">
            <label class="flex items-center space-x-3">
              <input 
                type="checkbox" 
                id="check-audio-enabled"
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
            id="btn-save-accessibility"
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

        <div class="space-y-4">
          <button 
            id="btn-back"
            class="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-semibold">
            ← Back
          </button>

          <button 
            id="btn-pace-accelerated"
            class="w-full bg-white dark:bg-gray-700 hover:bg-green-50 dark:hover:bg-gray-600 border-2 border-gray-300 dark:border-gray-600 hover:border-green-500 rounded-lg p-4 text-left transition-colors">
            <div class="font-bold text-gray-900 dark:text-white">6 lessons/week</div>
            <div class="text-sm text-gray-600 dark:text-gray-400">Complete curriculum in ~3 months</div>
          </button>

          <button 
            id="btn-pace-standard"
            class="w-full bg-white dark:bg-gray-700 hover:bg-green-50 dark:hover:bg-gray-600 border-2 border-gray-300 dark:border-gray-600 hover:border-green-500 rounded-lg p-4 text-left transition-colors">
            <div class="font-bold text-gray-900 dark:text-white">3 lessons/week (Recommended)</div>
            <div class="text-sm text-gray-600 dark:text-gray-400">Complete curriculum in ~6 months</div>
          </button>

          <button 
            id="btn-pace-flexible"
            class="w-full bg-white dark:bg-gray-700 hover:bg-green-50 dark:hover:bg-gray-600 border-2 border-gray-300 dark:border-gray-600 hover:border-green-500 rounded-lg p-4 text-left transition-colors">
            <div class="font-bold text-gray-900 dark:text-white">Go at your own pace</div>
            <div class="text-sm text-gray-600 dark:text-gray-400">No weekly goals, learn when you want</div>
          </button>
        </div>
      </div>
    `;
  }

  private renderWeekStartScreen(): string {
    return `
      <div class="max-w-2xl mx-auto space-y-6">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
          Week Start Time
        </h2>
        <p class="text-gray-700 dark:text-gray-300">
          When should your learning week begin? Choose a day and time that works for you.
        </p>

        <div class="space-y-4">
          <!-- Day of Week -->
          <div class="bg-white dark:bg-gray-700 p-4 rounded-lg">
            <label class="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Day of Week
            </label>
            <select 
              id="select-week-day"
              class="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white">
              <option value="monday" selected>Monday</option>
              <option value="tuesday">Tuesday</option>
              <option value="wednesday">Wednesday</option>
              <option value="thursday">Thursday</option>
              <option value="friday">Friday</option>
              <option value="saturday">Saturday</option>
              <option value="sunday">Sunday</option>
            </select>
          </div>

          <!-- Time -->
          <div class="bg-white dark:bg-gray-700 p-4 rounded-lg">
            <label class="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Time (in your local timezone)
            </label>
            <input 
              type="time" 
              id="input-week-time"
              value="00:00"
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
      this.advanceToScreen("telemetry");
    });

    // Accessibility options
    document.getElementById("btn-save-accessibility")?.addEventListener("click", () => {
      this.captureAccessibilityChoices();
      this.advanceToScreen("telemetry");
    });

    // Telemetry
    document.getElementById("btn-telemetry-accept")?.addEventListener("click", () => {
      this.internal.userChoices.optOutTelemetry = false;
      this.advanceToScreen("learning-pace");
    });

    document.getElementById("btn-telemetry-optout")?.addEventListener("click", () => {
      this.internal.userChoices.optOutTelemetry = true;
      this.advanceToScreen("learning-pace");
    });

    // Learning pace
    document.getElementById("btn-pace-accelerated")?.addEventListener("click", () => {
      this.internal.userChoices.learningPace = "accelerated";
      this.advanceToScreen("week-start");
    });

    document.getElementById("btn-pace-standard")?.addEventListener("click", () => {
      this.internal.userChoices.learningPace = "standard";
      this.advanceToScreen("week-start");
    });

    document.getElementById("btn-pace-flexible")?.addEventListener("click", () => {
      this.internal.userChoices.learningPace = "flexible";
      // Skip week-start for flexible pace
      this.advanceToScreen("complete");
    });

    // Week start
    document.getElementById("btn-save-week-start")?.addEventListener("click", () => {
      this.captureWeekStartChoices();
      this.advanceToScreen("complete");
    });

    // Complete
    document.getElementById("btn-finish")?.addEventListener("click", () => {
      this.queueAllSettingsAndNavigate();
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

  private captureAccessibilityChoices(): void {
    const fontSize = (document.getElementById("select-font-size") as HTMLSelectElement)?.value || "medium";
    const highContrast = (document.getElementById("check-high-contrast") as HTMLInputElement)?.checked || false;
    const reducedMotion = (document.getElementById("check-reduced-motion") as HTMLInputElement)?.checked || false;
    const focusStyle = (document.getElementById("select-focus-style") as HTMLSelectElement)?.value || "default";
    const audioEnabled = (document.getElementById("check-audio-enabled") as HTMLInputElement)?.checked || false;

    this.internal.userChoices.accessibilityOptions = {
      fontSize: fontSize as "small" | "medium" | "large",
      highContrast,
      reducedMotion,
      focusIndicatorStyle: focusStyle as "default" | "enhanced",
      audioEnabled,
    };
  }

  private captureWeekStartChoices(): void {
    const day = (document.getElementById("select-week-day") as HTMLSelectElement)?.value || "monday";
    const time = (document.getElementById("input-week-time") as HTMLInputElement)?.value || "00:00";

    this.internal.userChoices.weekStartDay = day as WeekDay;
    this.internal.userChoices.weekStartTime = time;
  }

  private queueAllSettingsAndNavigate(): void {
    // Queue theme (always auto)
    this.componentCore.queueSettingsMessage({
      method: "setTheme",
      args: ["auto"],
    });

    // Queue learning pace
    this.componentCore.queueSettingsMessage({
      method: "setLearningPace",
      args: [this.internal.userChoices.learningPace],
    });

    // Queue telemetry
    this.componentCore.queueSettingsMessage({
      method: "setOptOutDailyPing",
      args: [this.internal.userChoices.optOutTelemetry],
    });
    this.componentCore.queueSettingsMessage({
      method: "setOptOutErrorPing",
      args: [this.internal.userChoices.optOutTelemetry],
    });

    // Queue accessibility options
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

    // Queue week start (if not flexible)
    if (this.internal.userChoices.learningPace !== "flexible") {
      this.componentCore.queueSettingsMessage({
        method: "setWeekStartDay",
        args: [this.internal.userChoices.weekStartDay],
      });

      // Convert local time to UTC
      const utcTime = this.convertLocalTimeToUTC(this.internal.userChoices.weekStartTime);
      this.componentCore.queueSettingsMessage({
        method: "setWeekStartTimeUTC",
        args: [utcTime],
      });
    }

    // Queue navigation to main menu
    this.componentCore.queueNavigationToMainMenu();

    console.log("✅ Welcome flow complete - settings and navigation queued");
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
}