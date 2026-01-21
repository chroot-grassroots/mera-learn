/**
 * @fileoverview Main Menu Component Interface
 * @module components/interfaces/mainMenuInterface
 * 
 * Renders the main menu with streak tracking display.
 * Calls streak checking logic and displays results.
 */

import { BaseComponentInterface, BaseComponentInterfaceInternalState } from "./baseComponentInterface.js";
import type { MainMenuCore, MainMenuComponentConfig, MainMenuComponentProgress } from "../cores/mainMenuCore.js";
import type { TimelineContainer } from "../../ui/timelineContainer.js";

// ============================================================================
// INTERNAL STATE
// ============================================================================

interface MainMenuInternalState extends BaseComponentInterfaceInternalState {
  // Will expand in later phases (domain expansion state, etc.)
}

// ============================================================================
// INTERFACE
// ============================================================================

/**
 * Main Menu Interface - renders streak tracking and navigation.
 * 
 * Phase 3 implementation: Streak card only
 * Future phases will add:
 * - Domain progress cards (Phase 4)
 * - Lesson lists (Phase 5)
 * - Jump In card (Phase 6)
 * - Lesson reset (Phase 7)
 */
export class MainMenuInterface extends BaseComponentInterface<
  MainMenuComponentConfig,
  MainMenuComponentProgress,
  MainMenuInternalState
> {
  // Add typed reference to core for easier access
  protected componentCore: MainMenuCore;

  constructor(componentCore: MainMenuCore, timelineContainer: TimelineContainer) {
    super(componentCore, timelineContainer);
    this.componentCore = componentCore;
  }

  protected createInternalState(): MainMenuInternalState {
    return {
      rendered: false,
    };
  }

  protected async loadComponentSpecificAssets(): Promise<void> {
    // No assets to load for Phase 3
    this.setAssetLoadingState('ready');
  }

  /**
   * Render main menu to DOM.
   * 
   * Phase 3: Single streak card centered on screen
   */
  render(): void {
    // Check streak and queue any necessary updates BEFORE rendering
    this.componentCore.checkAndQueueStreakUpdates();

    // Get container from timeline (base class already called addComponentSlot)
    const area = this.timelineContainer.getComponentArea(
      this.componentCore.config.id
    );

    // Render streak card
    if (area) {
      area.innerHTML = this.renderStreakCard();
      this.internal.rendered = true;
    }
  }

  /**
   * Clean up DOM and event listeners.
   */
  destroy(): void {
    // No event listeners to clean up in Phase 3
    // Future phases will need to remove click handlers
    this.internal.rendered = false;
  }

  // ============================================================================
  // RENDERING METHODS
  // ============================================================================

  /**
   * Render the streak tracking card.
   * 
   * Displays:
   * - Current streak count (completed weeks)
   * - Current week progress (X/Y lessons this week)
   * - Encouragement message if behind on weekly goal
   */
  private renderStreakCard(): string {
    // Get current streak from overall progress
    const progress = this.componentCore.overallProgressManager.getProgress();
    const currentStreak = progress.currentStreak;

    // Get current week boundaries (cast to access getLastWeekStart)
    const settingsManager = this.componentCore.settingsManager as any;
    const weekStart = settingsManager.getLastWeekStart();
    const now = Math.floor(Date.now() / 1000);
    const weekEnd = weekStart + (7 * 24 * 60 * 60);

    // Calculate current week progress
    const lessonsThisWeek = this.componentCore.countLessonsSince(weekStart);
    const weeklyGoal = this.getWeeklyGoal();
    const settings = this.componentCore.settingsManager.getSettings();
    const pace = settings.learningPace[0];
    
    // For flexible pace, show different messaging
    if (pace === 'flexible') {
      return this.renderFlexibleStreakCard(currentStreak, lessonsThisWeek);
    }

    const remaining = Math.max(0, weeklyGoal - lessonsThisWeek);
    const goalMet = lessonsThisWeek >= weeklyGoal;

    // Format time remaining in week
    const secondsRemaining = weekEnd - now;
    const daysRemaining = Math.ceil(secondsRemaining / (24 * 60 * 60));

    return `
      <div class="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <!-- Header -->
          <h1 class="text-3xl font-bold text-gray-900 mb-6 text-center">
            Mera
          </h1>

          <!-- Streak Display -->
          <div class="mb-6">
            <h2 class="text-xl font-semibold text-gray-700 mb-3">
              Learning Streak
            </h2>
            <div class="text-center mb-4">
              <div class="inline-flex items-baseline">
                <span class="text-5xl font-bold text-blue-600">${currentStreak}</span>
                <span class="text-2xl text-gray-600 ml-2">🔥</span>
              </div>
              <div class="text-gray-600 mt-1">
                week${currentStreak === 1 ? '' : 's'} streak
              </div>
            </div>
          </div>

          <!-- Current Week Progress -->
          <div class="border-t border-gray-200 pt-6">
            <div class="mb-4">
              <div class="flex justify-between text-sm text-gray-600 mb-2">
                <span>This week's progress</span>
                <span class="font-medium">${lessonsThisWeek} / ${weeklyGoal} lessons</span>
              </div>
              <!-- Progress bar -->
              <div class="w-full bg-gray-200 rounded-full h-3">
                <div 
                  class="bg-blue-600 h-3 rounded-full transition-all duration-300"
                  style="width: ${Math.min(100, (lessonsThisWeek / weeklyGoal) * 100)}%"
                ></div>
              </div>
            </div>

            <!-- Status message -->
            ${this.renderWeeklyStatusMessage(goalMet, remaining, daysRemaining)}
          </div>

          <!-- Coming Soon Notice -->
          <div class="mt-6 text-center text-sm text-gray-500 border-t border-gray-200 pt-4">
            <p>Domain cards, lesson navigation, and more coming soon!</p>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render status message based on weekly progress.
   */
  private renderWeeklyStatusMessage(
    goalMet: boolean,
    remaining: number,
    daysRemaining: number
  ): string {
    if (goalMet) {
      return `
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
          <div class="flex items-center">
            <span class="text-2xl mr-3">✅</span>
            <div>
              <p class="font-medium text-green-900">Goal complete!</p>
              <p class="text-sm text-green-700">You've hit your weekly target.</p>
            </div>
          </div>
        </div>
      `;
    }

    const lessonWord = remaining === 1 ? 'lesson' : 'lessons';
    const dayWord = daysRemaining === 1 ? 'day' : 'days';

    return `
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div class="flex items-center">
          <span class="text-2xl mr-3">📚</span>
          <div>
            <p class="font-medium text-blue-900">Keep it up!</p>
            <p class="text-sm text-blue-700">
              Complete <strong>${remaining}</strong> more ${lessonWord} 
              in the next ${daysRemaining} ${dayWord} to maintain your streak.
            </p>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render streak card for flexible pace (no weekly goals).
   */
  private renderFlexibleStreakCard(currentStreak: number, lessonsThisWeek: number): string {
    return `
      <div class="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <!-- Header -->
          <h1 class="text-3xl font-bold text-gray-900 mb-6 text-center">
            Mera
          </h1>

          <!-- Flexible Pace Message -->
          <div class="mb-6 text-center">
            <h2 class="text-xl font-semibold text-gray-700 mb-3">
              Learning at Your Own Pace
            </h2>
            <div class="text-gray-600">
              <p class="mb-2">You've completed <strong>${lessonsThisWeek}</strong> ${lessonsThisWeek === 1 ? 'lesson' : 'lessons'} this week.</p>
              <p class="text-sm">No weekly goals - learn whenever works for you!</p>
            </div>
          </div>

          <!-- Coming Soon Notice -->
          <div class="mt-6 text-center text-sm text-gray-500 border-t border-gray-200 pt-4">
            <p>Domain cards, lesson navigation, and more coming soon!</p>
          </div>
        </div>
      </div>
    `;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Get weekly goal based on current learning pace setting.
   */
  private getWeeklyGoal(): number {
    const settings = this.componentCore.settingsManager.getSettings();
    const pace = settings.learningPace[0];

    const goalMap: Record<typeof pace, number> = {
      accelerated: 6,  // 6 lessons/week
      standard: 3,     // 3 lessons/week (recommended)
      flexible: 0,     // No weekly goal
    };

    return goalMap[pace];
  }
}