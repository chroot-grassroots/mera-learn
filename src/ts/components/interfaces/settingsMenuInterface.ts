/**
 * @fileoverview Settings Menu Component Interface
 * @module components/interfaces/settingsMenuInterface
 * 
 * Renders settings controls and queues changes immediately.
 * Changes apply as user interacts with controls.
 */

import {
  BaseComponentInterface,
  BaseComponentInterfaceInternalState,
} from "./baseComponentInterface.js";
import type {
  SettingsMenuCore,
  SettingsMenuComponentConfig,
  SettingsMenuComponentProgress,
} from "../cores/settingsMenuCore.js";
import type { TimelineContainer } from "../../ui/timelineContainer.js";
import { MeraStyles } from "../../ui/meraStyles.js";

// ============================================================================
// INTERNAL STATE
// ============================================================================

interface SettingsMenuInternalState extends BaseComponentInterfaceInternalState {
  // No additional state needed
}

// ============================================================================
// INTERFACE
// ============================================================================

/**
 * Settings Menu Interface - renders settings controls
 */
export class SettingsMenuInterface extends BaseComponentInterface<
  SettingsMenuComponentConfig,
  SettingsMenuComponentProgress,
  SettingsMenuInternalState
> {
  protected declare componentCore: SettingsMenuCore;

  constructor(core: SettingsMenuCore, timelineContainer: TimelineContainer) {
    super(core, timelineContainer);
  }

  /**
   * Create initial internal state
   */
  protected createInternalState(): SettingsMenuInternalState {
    return {
      rendered: false,
    };
  }

  /**
   * Load component-specific assets (none needed)
   */
  async loadComponentSpecificAssets(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Cleanup method
   */
  destroy(): void {
    // No persistent listeners to clean up
  }

  /**
   * Render the settings menu
   */
  render(): void {
    const area = this.timelineContainer.getComponentArea(
      this.componentCore.config.id
    );

    if (!area) {
      console.error("SettingsMenu: No component area available");
      return;
    }

    // Get current settings values
    const settings = this.componentCore.settingsManager.getSettings();
    
    const fontSize = settings.fontSize[0];
    const highContrast = settings.highContrast[0];
    const reducedMotion = settings.reducedMotion[0];
    const focusIndicatorStyle = settings.focusIndicatorStyle[0];
    const audioEnabled = settings.audioEnabled[0];
    const learningPace = settings.learningPace[0];
    const theme = settings.theme[0];

    area.innerHTML = `
      <div class="${MeraStyles.containers.pageWrapper}">
        <div class="${MeraStyles.containers.contentContainer}">
          <div class="${MeraStyles.containers.card} ${MeraStyles.layout.spaceYLarge}">
            
            <!-- Header -->
            <div class="${MeraStyles.layout.textCenter}">
              <h1 class="${MeraStyles.typography.heading1}">⚙️ Settings</h1>
            </div>

            <!-- Accessibility Section -->
            <div class="${MeraStyles.borders.topSection}">
              <h2 class="${MeraStyles.typography.heading2}">Accessibility</h2>
              
              <div class="${MeraStyles.layout.spaceYMedium}">
                <!-- Font Size -->
                <div class="${MeraStyles.containers.messageBox}">
                  <label class="${MeraStyles.typography.heading4} ${MeraStyles.patterns.marginBottom.medium}">
                    Font Size
                  </label>
                  <select 
                    id="select-font-size"
                    class="w-full px-4 py-2 bg-white dark:bg-gray-800 border ${MeraStyles.borders.default} rounded ${MeraStyles.typography.body}">
                    <option value="small" ${fontSize === "small" ? "selected" : ""}>Small</option>
                    <option value="medium" ${fontSize === "medium" ? "selected" : ""}>Medium</option>
                    <option value="large" ${fontSize === "large" ? "selected" : ""}>Large</option>
                  </select>
                </div>

                <!-- High Contrast -->
                <div class="${MeraStyles.containers.messageBox}">
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      id="check-high-contrast"
                      ${highContrast ? "checked" : ""}
                      class="w-5 h-5">
                    <span class="${MeraStyles.typography.heading4}">High Contrast Mode</span>
                  </label>
                </div>

                <!-- Reduced Motion -->
                <div class="${MeraStyles.containers.messageBox}">
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      id="check-reduced-motion"
                      ${reducedMotion ? "checked" : ""}
                      class="w-5 h-5">
                    <span class="${MeraStyles.typography.heading4}">Reduce Motion</span>
                  </label>
                </div>

                <!-- Focus Indicator -->
                <div class="${MeraStyles.containers.messageBox}">
                  <label class="${MeraStyles.typography.heading4} ${MeraStyles.patterns.marginBottom.medium}">
                    Focus Indicator Style
                  </label>
                  <select 
                    id="select-focus-style"
                    class="w-full px-4 py-2 bg-white dark:bg-gray-800 border ${MeraStyles.borders.default} rounded ${MeraStyles.typography.body}">
                    <option value="default" ${focusIndicatorStyle === "default" ? "selected" : ""}>Default</option>
                    <option value="enhanced" ${focusIndicatorStyle === "enhanced" ? "selected" : ""}>Enhanced</option>
                  </select>
                </div>

                <!-- Audio -->
                <div class="${MeraStyles.containers.messageBox}">
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      id="check-audio-enabled"
                      ${audioEnabled ? "checked" : ""}
                      class="w-5 h-5">
                    <span class="${MeraStyles.typography.heading4}">Enable Audio</span>
                  </label>
                </div>
              </div>
            </div>

            <!-- Appearance Section -->
            <div class="${MeraStyles.borders.topSection}">
              <h2 class="${MeraStyles.typography.heading2}">Appearance</h2>
              
              <div class="${MeraStyles.containers.messageBox}">
                <label class="${MeraStyles.typography.heading4} ${MeraStyles.patterns.marginBottom.medium}">
                  Theme
                </label>
                <select 
                  id="select-theme"
                  class="w-full px-4 py-2 bg-white dark:bg-gray-800 border ${MeraStyles.borders.default} rounded ${MeraStyles.typography.body}">
                  <option value="auto" ${theme === "auto" ? "selected" : ""}>Auto (System)</option>
                  <option value="light" ${theme === "light" ? "selected" : ""}>Light</option>
                  <option value="dark" ${theme === "dark" ? "selected" : ""}>Dark</option>
                </select>
              </div>
            </div>

            <!-- Learning Section -->
            <div class="${MeraStyles.borders.topSection}">
              <h2 class="${MeraStyles.typography.heading2}">Learning Pace</h2>
              
              <div class="${MeraStyles.containers.messageBox}">
                <select 
                  id="select-learning-pace"
                  class="w-full px-4 py-2 bg-white dark:bg-gray-800 border ${MeraStyles.borders.default} rounded ${MeraStyles.typography.body}">
                  <option value="flexible" ${learningPace === "flexible" ? "selected" : ""}>Flexible - Learn at your own pace</option>
                  <option value="standard" ${learningPace === "standard" ? "selected" : ""}>Standard - 3 lessons per week</option>
                  <option value="accelerated" ${learningPace === "accelerated" ? "selected" : ""}>Accelerated - 6 lessons per week</option>
                </select>
              </div>
            </div>

            <!-- Navigation -->
            <div class="${MeraStyles.layout.textCenter}">
              <button 
                id="btn-back-to-menu"
                class="${MeraStyles.interactive.buttonPrimary}">
                ← Back to Main Menu
              </button>
            </div>

          </div>
        </div>
      </div>
    `;

    this.setupEventListeners();
    this.internal.rendered = true;
  }

  /**
   * Setup event listeners for settings controls
   */
  private setupEventListeners(): void {
    // Font size
    const fontSizeSelect = document.getElementById("select-font-size") as HTMLSelectElement;
    fontSizeSelect?.addEventListener("change", () => {
      const size = fontSizeSelect.value as "small" | "medium" | "large";
      this.componentCore.queueSettingsMessage({
        method: "setFontSize",
        args: [size],
      });
    });

    // High contrast
    const highContrastCheck = document.getElementById("check-high-contrast") as HTMLInputElement;
    highContrastCheck?.addEventListener("change", () => {
      this.componentCore.queueSettingsMessage({
        method: "setHighContrast",
        args: [highContrastCheck.checked],
      });
    });

    // Reduced motion
    const reducedMotionCheck = document.getElementById("check-reduced-motion") as HTMLInputElement;
    reducedMotionCheck?.addEventListener("change", () => {
      this.componentCore.queueSettingsMessage({
        method: "setReducedMotion",
        args: [reducedMotionCheck.checked],
      });
    });

    // Focus style
    const focusStyleSelect = document.getElementById("select-focus-style") as HTMLSelectElement;
    focusStyleSelect?.addEventListener("change", () => {
      const style = focusStyleSelect.value as "default" | "enhanced";
      this.componentCore.queueSettingsMessage({
        method: "setFocusIndicatorStyle",
        args: [style],
      });
    });

    // Audio enabled
    const audioEnabledCheck = document.getElementById("check-audio-enabled") as HTMLInputElement;
    audioEnabledCheck?.addEventListener("change", () => {
      this.componentCore.queueSettingsMessage({
        method: "setAudioEnabled",
        args: [audioEnabledCheck.checked],
      });
    });

    // Theme
    const themeSelect = document.getElementById("select-theme") as HTMLSelectElement;
    themeSelect?.addEventListener("change", () => {
      const theme = themeSelect.value as "light" | "dark" | "auto";
      this.componentCore.queueSettingsMessage({
        method: "setTheme",
        args: [theme],
      });
    });

    // Learning pace
    const learningPaceSelect = document.getElementById("select-learning-pace") as HTMLSelectElement;
    learningPaceSelect?.addEventListener("change", () => {
      const pace = learningPaceSelect.value as "accelerated" | "standard" | "flexible";
      this.componentCore.queueSettingsMessage({
        method: "setLearningPace",
        args: [pace],
      });
    });

    // Back to main menu
    const backButton = document.getElementById("btn-back-to-menu");
    backButton?.addEventListener("click", () => {
      this.componentCore.queueNavigationToMainMenu();
    });
  }
}