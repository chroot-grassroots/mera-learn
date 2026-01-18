/**
 * @fileoverview Main Menu Component Interface
 * @module components/interfaces/mainMenuInterface
 * 
 * Renders the main menu UI:
 * - 2x2 grid layout (Jump In, Streak, Domain Progress, Tree of Knowledge)
 * - Expandable domain accordions with lesson lists
 * - Navigation to lessons
 * - Lesson reset functionality (Phase 7)
 */

import type { MainMenuCore, MainMenuComponentConfig, MainMenuComponentProgress } from "../cores/mainMenuCore.js";
import { BaseComponentInterface, BaseComponentInterfaceInternalState } from "./baseComponentInterface.js";
import type { TimelineContainer } from "../../ui/timelineContainer.js";

/**
 * Internal state for main menu interface.
 */
interface MainMenuInterfaceInternalState extends BaseComponentInterfaceInternalState {
  expandedDomain: number | null;
}

/**
 * Main menu component interface.
 * 
 * Responsibilities:
 * - Render 2x2 grid with progress cards
 * - Handle domain expansion/collapse
 * - Queue navigation messages when lessons clicked
 * - Queue reset messages when reset buttons clicked (Phase 7)
 */
export class MainMenuInterface extends BaseComponentInterface<
  MainMenuComponentConfig,
  MainMenuComponentProgress,
  MainMenuInterfaceInternalState
> {
  // Type-safe reference to the specific core instance (following NewUserWelcomeInterface pattern)
  protected declare componentCore: MainMenuCore;

  constructor(
    core: MainMenuCore,
    timeline: TimelineContainer
  ) {
    super(core, timeline);
  }

  /**
   * Create initial internal state.
   */
  protected createInternalState(): MainMenuInterfaceInternalState {
    return {
      rendered: false,
      expandedDomain: null,
    };
  }

  /**
   * Load component-specific assets.
   * Main menu has no assets to load.
   */
  protected async loadComponentSpecificAssets(): Promise<void> {
    // No assets needed - main menu uses only text/progress data
    // Mark as ready immediately
    this.setAssetLoadingState('ready');
  }

  /**
   * Render the main menu.
   * 
   * Phase 2: Just a placeholder
   * Phase 3-7: Full implementation with cards, accordions, etc.
   */
  render(): void {
    // Get container from timeline (following NewUserWelcomeInterface pattern)
    const slot = this.timelineContainer.getComponentArea(this.componentCore.config.id);
    
    if (!slot) {
      console.error(`Main menu: No render area found for component ${this.componentCore.config.id}`);
      return;
    }

    // Clear container
    slot.innerHTML = "";

    // Phase 2 placeholder - just show a title
    const placeholder = document.createElement("div");
    placeholder.className = "p-8 text-center";
    placeholder.innerHTML = `
      <h1 class="text-3xl font-bold text-gray-800 mb-4">
        Main Menu
      </h1>
      <p class="text-gray-600">
        Component successfully loaded! UI implementation coming in Phase 3+
      </p>
    `;

    slot.appendChild(placeholder);

    // Mark as rendered
    this.internal.rendered = true;

    // TODO Phase 3+: Implement full UI
    // - Jump In card
    // - Learning Streak card  
    // - Domain Progress card with accordion
    // - Tree of Knowledge card
    // TODO Phase 3+: Attach event listeners for interaction
  }

  /**
   * Handle domain card click - expand/collapse lesson list.
   */
  private handleDomainClick(domainId: number): void {
    // TODO Phase 4: Implement accordion expansion
    if (this.internal.expandedDomain === domainId) {
      this.internal.expandedDomain = null;
    } else {
      this.internal.expandedDomain = domainId;
    }
    this.render();
  }

  /**
   * Handle lesson click - queue navigation message.
   */
  private handleLessonClick(lessonId: number): void {
    // TODO Phase 4: Implement navigation
    // Call method on core to queue navigation
    console.log(`Navigate to lesson ${lessonId} - not yet implemented`);
  }

  /**
   * Handle reset button click - queue reset messages.
   */
  private handleResetClick(lessonId: number): void {
    // TODO Phase 7: Implement lesson reset
    // Show confirmation dialog
    // Queue reset messages via core
    this.componentCore.queueResetLesson(lessonId);
  }

  /**
   * Cleanup event listeners on destroy.
   */
  destroy(): void {
    // Clear any event listeners when component is destroyed
    // (None yet in Phase 2)
  }
}