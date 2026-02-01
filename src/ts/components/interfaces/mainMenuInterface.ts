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
import { MeraStyles } from "../../ui/meraStyles.js";

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
        <div class="${MeraStyles.containers.pageWrapper}">
          <div class="${MeraStyles.containers.contentContainer}">
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
      <div class="${MeraStyles.containers.card}">
        <!-- Header -->
        <h1 class="${MeraStyles.typography.heading1}">
          Mera
        </h1>

        <!-- Streak Display -->
        <div class="${MeraStyles.patterns.marginBottom.xlarge}">
          <h2 class="${MeraStyles.typography.heading2}">
            Learning Streak
          </h2>
          <div class="${MeraStyles.layout.textCenter} ${MeraStyles.patterns.marginBottom.large}">
            <div class="${MeraStyles.layout.inlineFlexBaseline}">
              <span class="${MeraStyles.typography.displayLarge}">${currentStreak}</span>
              <span class="${MeraStyles.typography.displayMedium} ml-2">🔥</span>
            </div>
            <div class="${MeraStyles.typography.body} ${MeraStyles.patterns.marginTop.small}">
              week${currentStreak === 1 ? '' : 's'} streak
            </div>
          </div>
        </div>

        <!-- Current Week Progress -->
        <div class="${MeraStyles.borders.topSection}">
          <div class="${MeraStyles.patterns.marginBottom.large}">
            <div class="${MeraStyles.layout.flexBetween} ${MeraStyles.typography.bodySmall} ${MeraStyles.patterns.marginBottom.small}">
              <span>This week's progress</span>
              <span class="font-medium">${lessonsThisWeek} / ${weeklyGoal} lessons</span>
            </div>
            <!-- Progress bar -->
            <div class="${MeraStyles.progress.barContainer}">
              <div 
                class="${MeraStyles.progress.barFill}"
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
        <div class="${MeraStyles.status.successBox}">
          <div class="${MeraStyles.patterns.messageLayout}">
            <span class="${MeraStyles.typography.displayMedium} ${MeraStyles.patterns.iconMarginRight}">✅</span>
            <div>
              <p class="${MeraStyles.status.successText}">Goal complete!</p>
              <p class="${MeraStyles.status.successTextSecondary}">You've hit your weekly target.</p>
            </div>
          </div>
        </div>
      `;
    }

    const lessonWord = remaining === 1 ? 'lesson' : 'lessons';
    const dayWord = daysRemaining === 1 ? 'day' : 'days';

    return `
      <div class="${MeraStyles.status.infoBox}">
        <div class="${MeraStyles.patterns.messageLayout}">
          <span class="${MeraStyles.typography.displayMedium} ${MeraStyles.patterns.iconMarginRight}">📚</span>
          <div>
            <p class="${MeraStyles.status.successText} ${MeraStyles.typography.textPrimary}">Keep it up!</p>
            <p class="${MeraStyles.typography.bodySmall}">
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
      <div class="${MeraStyles.containers.card}">
        <!-- Header -->
        <h1 class="${MeraStyles.typography.heading1}">
          Mera
        </h1>

        <!-- Flexible Pace Message -->
        <div class="${MeraStyles.patterns.marginBottom.xlarge} ${MeraStyles.layout.textCenter}">
          <h2 class="${MeraStyles.typography.heading2}">
            Learning at Your Own Pace
          </h2>
          <div class="${MeraStyles.typography.body}">
            <p class="${MeraStyles.patterns.marginBottom.small}">
              You've completed <strong class="${MeraStyles.typography.textPrimary}">${lessonsThisWeek}</strong> 
              ${lessonsThisWeek === 1 ? 'lesson' : 'lessons'} this week.
            </p>
            <p class="${MeraStyles.typography.bodySmall}">No weekly goals - learn whenever works for you!</p>
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
        <div class="${MeraStyles.containers.cardCompact}">
          ${this.renderDomainHeader(domain, isExpanded)}
          ${isExpanded ? this.renderDomainContent(domain) : ''}
        </div>
      `;
    }).join('');

    return `<div class="${MeraStyles.layout.spaceYMedium}">${domainCards}</div>`;
  }

  private renderDomainHeader(domain: DomainData, isExpanded: boolean): string {
    return `
      <button
        class="${MeraStyles.interactive.buttonLarge}"
        data-domain-toggle="${domain.id}"
      >
        <div class="${MeraStyles.layout.flexCenterBetween}">
          <div class="${MeraStyles.layout.flexCenter} ${MeraStyles.layout.gapSmall} flex-1">
            <span class="${MeraStyles.patterns.expandArrow}">${isExpanded ? '▼' : '▶'}</span>
            <span class="${MeraStyles.patterns.sectionEmoji}">${domain.emoji}</span>
            <div class="flex-1">
              <h3 class="${MeraStyles.typography.heading3}">${domain.title}</h3>
              <p class="${MeraStyles.typography.bodySmall}">
                ${domain.completed} / ${domain.total} lessons • ${domain.percentage}%
              </p>
            </div>
          </div>
          ${domain.completed === domain.total && domain.total > 0 ? `
            <span class="${MeraStyles.status.successAccent} ${MeraStyles.typography.displayMedium} ${MeraStyles.patterns.marginLeftMedium}">✓</span>
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
        <div class="${MeraStyles.borders.bottomExceptLast}">
          ${this.renderLessonHeader(lesson, isExpanded)}
          ${isExpanded ? this.renderLessonContent(lesson) : ''}
        </div>
      `;
    }).join('');

    return `
      <div>
        ${lessonItems}
      </div>
    `;
  }

  private renderLessonHeader(lesson: LessonData, isExpanded: boolean): string {
    const statusIcon = this.getLessonStatusIcon(lesson.status);

    return `
      <div class="${MeraStyles.layout.flexCenter} ${MeraStyles.interactive.hoverWrapper}">
        <button
          class="${MeraStyles.interactive.buttonMedium}"
          data-lesson-toggle="${lesson.id}"
        >
          <span class="${MeraStyles.patterns.statusIcon}">${isExpanded ? '▼' : '▶'}</span>
          <span class="${MeraStyles.patterns.statusIcon}">${statusIcon}</span>
          <div class="flex-1">
            <h4 class="${MeraStyles.typography.heading4}">${lesson.title}</h4>
            <p class="${MeraStyles.typography.bodySmall}">
              ${lesson.estimatedMinutes} min • ${lesson.difficulty}
            </p>
          </div>
        </button>
      </div>
    `;
  }

  private renderLessonContent(lesson: LessonData): string {
    return `
      <div class="${MeraStyles.patterns.padding.medium} ${MeraStyles.patterns.padding.leftLarge}">
        <p class="${MeraStyles.typography.body} ${MeraStyles.patterns.marginBottom.large}">
          ${lesson.description || 'No description available.'}
        </p>
        <button
          class="${MeraStyles.interactive.buttonPrimary}"
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
        return `<span class="${MeraStyles.status.successAccent}">✓</span>`;
      case 'started':
        return '<span class="text-amber-600 dark:text-amber-500">●</span>';
      case 'not-started':
        return '<span class="text-gray-400 dark:text-amber-200">○</span>';
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