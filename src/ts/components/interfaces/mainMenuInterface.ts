/**
 * @fileoverview Main Menu Component Interface
 * @module components/interfaces/mainMenuInterface
 * 
 * Renders the main menu with streak tracking display.
 * Calls streak checking logic and displays results.
 */

import { BaseComponentInterface, BaseComponentInterfaceInternalState } from "./baseComponentInterface.js";
import type { 
  MainMenuCore, 
  MainMenuComponentConfig, 
  MainMenuComponentProgress,
  DomainData,
  LessonData,
  LessonStatus
} from "../cores/mainMenuCore.js";
import type { TimelineContainer } from "../../ui/timelineContainer.js";

// ============================================================================
// INTERNAL STATE
// ============================================================================

interface MainMenuInternalState extends BaseComponentInterfaceInternalState {
  /** Currently expanded domain (null = all collapsed) */
  expandedDomainId: number | null;
  
  /** Currently expanded lesson (null = all collapsed) */
  expandedLessonId: number | null;
}

// ============================================================================
// INTERFACE
// ============================================================================

/**
 * Main Menu Interface - renders streak tracking and domain accordions.
 * 
 * Phase 3: Streak card ✓
 * Phase 4: Domain accordions ✓
 * Future phases will add:
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
      expandedDomainId: null,
      expandedLessonId: null,
    };
  }

  protected async loadComponentSpecificAssets(): Promise<void> {
    // No assets to load for Phase 3
    this.setAssetLoadingState('ready');
  }

  /**
   * Render main menu: streak card + domain accordions
   */
  render(): void {
    // Check streak and queue any necessary updates BEFORE rendering
    this.componentCore.checkAndQueueStreakUpdates();

    // Get container from timeline (base class already called addComponentSlot)
    const area = this.timelineContainer.getComponentArea(
      this.componentCore.config.id
    );

    // Render both streak card and domain accordions
    if (area) {
      area.innerHTML = `
        <div class="min-h-screen bg-mera-light dark:bg-mera-dark p-4">
          <div class="max-w-4xl lg:max-w-6xl mx-auto space-y-6">
            ${this.renderStreakCard()}
            ${this.renderDomainAccordions()}
          </div>
        </div>
      `;
      
      this.attachEventListeners();
      this.internal.rendered = true;
    }
  }

  /**
   * Clean up DOM and event listeners.
   */
  destroy(): void {
    // Event listeners automatically removed when innerHTML cleared
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
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
        <!-- Header -->
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-6 text-center">
          Mera
        </h1>

        <!-- Streak Display -->
        <div class="mb-6">
          <h2 class="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Learning Streak
          </h2>
          <div class="text-center mb-4">
            <div class="inline-flex items-baseline">
              <span class="text-5xl font-bold text-green-600 dark:text-green-500">${currentStreak}</span>
              <span class="text-2xl ml-2">🔥</span>
            </div>
            <div class="text-gray-600 dark:text-gray-400 mt-1">
              week${currentStreak === 1 ? '' : 's'} streak
            </div>
          </div>
        </div>

        <!-- Current Week Progress -->
        <div class="border-t border-gray-200 dark:border-gray-700 pt-6">
          <div class="mb-4">
            <div class="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
              <span>This week's progress</span>
              <span class="font-medium">${lessonsThisWeek} / ${weeklyGoal} lessons</span>
            </div>
            <!-- Progress bar -->
            <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
              <div 
                class="bg-green-600 dark:bg-green-500 h-3 rounded-full transition-all duration-300"
                style="width: ${Math.min(100, (lessonsThisWeek / weeklyGoal) * 100)}%"
              ></div>
            </div>
          </div>

          <!-- Status message -->
          ${this.renderWeeklyStatusMessage(goalMet, remaining, daysRemaining)}
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
        <div class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div class="flex items-center">
            <span class="text-2xl mr-3">✅</span>
            <div>
              <p class="font-medium text-green-900 dark:text-green-200">Goal complete!</p>
              <p class="text-sm text-green-700 dark:text-green-300">You've hit your weekly target.</p>
            </div>
          </div>
        </div>
      `;
    }

    const lessonWord = remaining === 1 ? 'lesson' : 'lessons';
    const dayWord = daysRemaining === 1 ? 'day' : 'days';

    return `
      <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div class="flex items-center">
          <span class="text-2xl mr-3">📚</span>
          <div>
            <p class="font-medium text-blue-900 dark:text-blue-200">Keep it up!</p>
            <p class="text-sm text-blue-700 dark:text-blue-300">
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
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
        <!-- Header -->
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-6 text-center">
          Mera
        </h1>

        <!-- Flexible Pace Message -->
        <div class="mb-6 text-center">
          <h2 class="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Learning at Your Own Pace
          </h2>
          <div class="text-gray-600 dark:text-gray-400">
            <p class="mb-2">You've completed <strong class="text-gray-900 dark:text-white">${lessonsThisWeek}</strong> ${lessonsThisWeek === 1 ? 'lesson' : 'lessons'} this week.</p>
            <p class="text-sm">No weekly goals - learn whenever works for you!</p>
          </div>
        </div>
      </div>
    `;
  }

  // ============================================================================
  // DOMAIN ACCORDIONS (Phase 4)
  // ============================================================================

  private renderDomainAccordions(): string {
    const domains = this.componentCore.getAllDomains();

    const domainCards = domains.map(domain => {
      const isExpanded = this.internal.expandedDomainId === domain.id;
      
      return `
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
          ${this.renderDomainHeader(domain, isExpanded)}
          ${isExpanded ? this.renderDomainContent(domain) : ''}
        </div>
      `;
    }).join('');

    return `<div class="space-y-4">${domainCards}</div>`;
  }

  private renderDomainHeader(domain: DomainData, isExpanded: boolean): string {
    return `
      <button
        class="w-full p-6 text-left hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
        data-domain-toggle="${domain.id}"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3 flex-1">
            <span class="text-2xl">${isExpanded ? '▼' : '▶'}</span>
            <span class="text-2xl">${domain.emoji}</span>
            <div class="flex-1">
              <h3 class="text-xl font-bold">${domain.title}</h3>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                ${domain.completed} / ${domain.total} lessons • ${domain.percentage}%
              </p>
            </div>
          </div>
          ${domain.completed === domain.total && domain.total > 0 ? `
            <span class="text-green-600 dark:text-green-500 text-2xl ml-4">✓</span>
          ` : ''}
        </div>
      </button>
    `;
  }

  private renderDomainContent(domain: DomainData): string {
    const lessons = this.componentCore.getLessonsInDomain(domain.id);

    const lessonItems = lessons.map(lesson => {
      const isExpanded = this.internal.expandedLessonId === lesson.id;
      
      return `
        <div class="border-b last:border-b-0 dark:border-gray-700">
          ${this.renderLessonHeader(lesson, isExpanded)}
          ${isExpanded ? this.renderLessonContent(lesson) : ''}
        </div>
      `;
    }).join('');

    return `
      <div class="bg-gray-50 dark:bg-gray-750">
        ${lessonItems}
      </div>
    `;
  }

  private renderLessonHeader(lesson: LessonData, isExpanded: boolean): string {
    const statusIcon = this.getLessonStatusIcon(lesson.status);

    return `
      <div class="flex items-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
        <button
          class="flex-1 p-4 text-left flex items-center gap-3"
          data-lesson-toggle="${lesson.id}"
        >
          <span class="text-lg">${isExpanded ? '▼' : '▶'}</span>
          <span class="text-lg">${statusIcon}</span>
          <div class="flex-1">
            <h4 class="font-medium">${lesson.title}</h4>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              ${lesson.estimatedMinutes} min • ${lesson.difficulty}
            </p>
          </div>
        </button>
      </div>
    `;
  }

  private renderLessonContent(lesson: LessonData): string {
    return `
      <div class="px-4 pb-4 pl-16">
        <p class="text-gray-700 dark:text-gray-300 mb-4">
          ${lesson.description || 'No description available.'}
        </p>
        <button
          class="px-4 py-2 bg-green-600 dark:bg-green-500 text-white 
                 rounded hover:opacity-90 transition-opacity"
          data-lesson-navigate="${lesson.id}"
        >
          ${lesson.status === 'completed' ? 'Review Lesson' : 
            lesson.status === 'started' ? 'Continue Lesson' : 'Start Lesson'} →
        </button>
      </div>
    `;
  }

  private getLessonStatusIcon(status: LessonStatus): string {
    switch (status) {
      case 'completed':
        return '<span class="text-green-600 dark:text-green-500">✓</span>';
      case 'started':
        return '<span class="text-yellow-500">●</span>';
      case 'not-started':
        return '<span class="text-gray-400">○</span>';
    }
  }

  // ============================================================================
  // EVENT HANDLERS (Phase 4)
  // ============================================================================

  private attachEventListeners(): void {
    const area = this.timelineContainer.getComponentArea(
      this.componentCore.config.id
    );

    if (!area) return;

    // Domain expansion toggle
    area.querySelectorAll('[data-domain-toggle]').forEach(button => {
      button.addEventListener('click', (e) => {
        const domainId = parseInt((e.currentTarget as HTMLElement).dataset.domainToggle!);
        this.toggleDomain(domainId);
      });
    });

    // Lesson expansion toggle
    area.querySelectorAll('[data-lesson-toggle]').forEach(button => {
      button.addEventListener('click', (e) => {
        const lessonId = parseInt((e.currentTarget as HTMLElement).dataset.lessonToggle!);
        this.toggleLesson(lessonId);
      });
    });

    // Lesson navigation
    area.querySelectorAll('[data-lesson-navigate]').forEach(button => {
      button.addEventListener('click', (e) => {
        const lessonId = parseInt((e.currentTarget as HTMLElement).dataset.lessonNavigate!);
        this.navigateToLesson(lessonId);
      });
    });
  }

  private toggleDomain(domainId: number): void {
    if (this.internal.expandedDomainId === domainId) {
      // Collapse current domain
      this.internal.expandedDomainId = null;
      this.internal.expandedLessonId = null; // Also collapse any expanded lesson
    } else {
      // Expand new domain
      this.internal.expandedDomainId = domainId;
      this.internal.expandedLessonId = null; // Collapse any lesson from previous domain
    }
    
    this.render(); // Re-render to update UI
  }

  private toggleLesson(lessonId: number): void {
    if (this.internal.expandedLessonId === lessonId) {
      // Collapse current lesson
      this.internal.expandedLessonId = null;
    } else {
      // Expand new lesson
      this.internal.expandedLessonId = lessonId;
    }
    
    this.render(); // Re-render to update UI
  }

  private navigateToLesson(lessonId: number): void {
    this.componentCore.queueNavigation(lessonId, 0);
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