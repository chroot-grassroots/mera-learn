/**
 * @fileoverview Multiple Choice Question Component
 * @module components/cores/multipleChoiceQuestionsCore
 *
 * Interactive assessment component supporting single or multiple correct answers.
 * Tracks user submissions and completion status based on correct answer history.
 */

import { z } from "zod";
import {
  BaseComponentCore,
  BaseComponentConfigSchema,
  BaseComponentProgressSchema,
  BaseComponentProgressManager,
  IComponentProgressMessageHandler,
} from "./baseComponentCore.js";
import { BaseComponentInterface } from "../interfaces/baseComponentInterface.js";
import { TimelineContainer } from "../../ui/timelineContainer.js";
import { ComponentProgressMessage } from "../../core/coreTypes.js";
import { CurriculumRegistry } from "../../registry/mera-registry.js";
import type { IReadonlyOverallProgressManager } from "../../core/overallProgressSchema.js";
import type { IReadonlyNavigationManager } from "../../core/navigationSchema.js";
import type { IReadonlySettingsManager } from "../../core/settingsSchema.js";

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Answer schema
 */
export const AnswerSchema = z.object({
  id: z.number().min(1),
  text: z.string().min(1).max(500),
});
export type Answer = z.infer<typeof AnswerSchema>;

/**
 * Custom feedback schema
 */
export const CustomFeedbackSchema = z.object({
  answers: z.array(z.number()).min(1),
  feedback: z.string().min(1).max(500),
});
export type CustomFeedback = z.infer<typeof CustomFeedbackSchema>;

/**
 * Multiple choice question component configuration schema
 */
export const MultipleChoiceQuestionComponentConfigSchema =
  BaseComponentConfigSchema.extend({
    type: z.literal("multiple_choice_question"),
    question: z.string().min(1).max(1000),
    questionImage: z.string().min(1).max(500).optional(),
    answers: z.array(AnswerSchema).min(1),
    correctAnswers: z.array(z.number().min(1)).min(1),
    feedbackCorrect: z.string().min(1).max(1000).optional(),
    feedbackIncorrect: z.string().min(1).max(1000).optional(),
    feedbackCustom: z.array(CustomFeedbackSchema).optional(),
  }).superRefine((data, ctx) => {
    const answerIds = data.answers.map((a) => a.id);
    
    // Validate correctAnswers reference existing answer IDs
    data.correctAnswers.forEach((answerNumber: number, index: number) => {
      if (!answerIds.includes(answerNumber))
        ctx.addIssue({
          code: "custom",
          message: `Correct answer [${index}] references invalid answer ID: ${answerNumber}`,
          path: ["correctAnswers", index],
        });
    });

    // Validate feedbackCustom references existing answer IDs
    if (data.feedbackCustom) {
      data.feedbackCustom.forEach((feedback: CustomFeedback, index: number) => {
        const invalidIds = feedback.answers.filter(
          (id: number) => !answerIds.includes(id),
        );

        if (invalidIds.length > 0) {
          ctx.addIssue({
            code: "custom",
            message: `feedbackCustom[${index}] references invalid answer IDs: ${invalidIds.join(", ")}`,
            path: ["feedbackCustom", index, "answers"],
          });
        }
      });
    }
  });

export type MultipleChoiceQuestionComponentConfig = z.infer<
  typeof MultipleChoiceQuestionComponentConfigSchema
>;

/**
 * Multiple choice question component progress schema
 */
export const MultipleChoiceQuestionComponentProgressSchema =
  BaseComponentProgressSchema.extend({
    selectedAnswer: z.array(z.number()).nullable(),
    hasAnsweredCorrectly: z.boolean(),
  });

export type MultipleChoiceQuestionComponentProgress = z.infer<
  typeof MultipleChoiceQuestionComponentProgressSchema
>;

// ============================================================================
// SHARED VALIDATION HELPERS
// ============================================================================

/**
 * Check if a selectedAnswer is valid for the given config.
 *
 * Used by both validateMultipleChoiceQuestionStructure (recovery) and
 * MultipleChoiceQuestionManager (runtime mutations) to ensure consistency.
 *
 * @param selectedAnswer - The answer to verify
 * @param config - Component configuration with answer choices
 * @returns true if answer is one of the possible choices
 */
export function isValidAnswer(
  selectedAnswer: number[] | null,
  config: MultipleChoiceQuestionComponentConfig,
): boolean {
  if (selectedAnswer === null) return true;

  const answerIds = config.answers.map((a) => a.id);
  return selectedAnswer.every((answer) => answerIds.includes(answer));
}

// ============================================================================
// FULL VALIDATORS
// ============================================================================

/**
 * Validation result with cleaned data and defaulting metric.
 */
export interface ValidationResult<T> {
  cleaned: T;
  defaultedRatio: number; // 0.0 = perfect, 1.0 = fully defaulted
}

/**
 * Validate multiple choice question progress against current config.
 *
 * PURE FUNCTION - Never throws, always returns valid data.
 *
 * Used by:
 * - progressIntegrity: Gracefully handles config changes
 * - MultipleChoiceQuestionProgressManager: Defensive check (throws if defaulted)
 *
 * @param progress - Progress data to validate
 * @param config - Current component configuration (source of truth)
 * @returns Cleaned progress + defaultedRatio
 */
export function validateMultipleChoiceQuestionStructure(
  progress: MultipleChoiceQuestionComponentProgress,
  config: MultipleChoiceQuestionComponentConfig,
): ValidationResult<MultipleChoiceQuestionComponentProgress> {
  if (!isValidAnswer(progress.selectedAnswer, config)) {
    return {
      cleaned: {
        selectedAnswer: null,
        hasAnsweredCorrectly: false,
        lastUpdated: 0,
      },
      defaultedRatio: 1.0,
    };
  }

  return {
    cleaned: progress,
    defaultedRatio: 0.0,
  };
}

// ============================================================================
// PROGRESS MANAGER
// ============================================================================

/**
 * Progress manager for multiple choice question component
 */
export class MultipleChoiceQuestionProgressManager extends BaseComponentProgressManager<
  MultipleChoiceQuestionComponentConfig,
  MultipleChoiceQuestionComponentProgress
> {
  /**
   * Set selected answer state with validation
   *
   * @param selectedAnswer - Answer IDs selected by user
   * @throws Error if answer references invalid IDs
   */
  setSelectedAnswer(selectedAnswer: number[] | null): void {
    if (!isValidAnswer(selectedAnswer, this.config)) {
      throw new Error(
        `Selected answer ${selectedAnswer} not consistent with config`,
      );
    }

    this.progress.selectedAnswer = selectedAnswer;

    if (selectedAnswer !== null && this.isCorrect(selectedAnswer)) {
      this.progress.hasAnsweredCorrectly = true;
    }

    this.updateTimestamp();
  }

  /**
   * Check if submitted answer matches correct answers (order-independent)
   */
  private isCorrect(answer: number[]): boolean {
    if (answer.length !== this.config.correctAnswers.length) return false;
    const sortedAnswer = [...answer].sort((a, b) => a - b);
    const sortedCorrect = [...this.config.correctAnswers].sort((a, b) => a - b);
    return sortedAnswer.every((val, i) => val === sortedCorrect[i]);
  }

  /**
   * Create initial progress structure matching config requirements.
   *
   * @param config - Component configuration
   * @returns Fresh progress object with no answer selected
   */
  createInitialProgress(
    config: MultipleChoiceQuestionComponentConfig,
  ): MultipleChoiceQuestionComponentProgress {
    return {
      selectedAnswer: null,
      hasAnsweredCorrectly: false,
      lastUpdated: 0,
    };
  }
}

// ============================================================================
// MESSAGE QUEUE MANAGER
// ============================================================================

/**
 * Message queue manager for multiple choice question component progress
 */
export class MultipleChoiceQuestionMessageQueueManager {
  private messageQueue: ComponentProgressMessage[] = [];

  constructor(private componentId: number) {}

  /**
   * Queue selected answer change message
   *
   * @param selectedAnswer - New selected answer
   */
  queueSelectedAnswer (selectedAnswer: number[] | null): void {
    this.messageQueue.push({
      type: "component_progress",
      componentId: this.componentId,
      method: "setSelectedAnswer",
      args: [selectedAnswer],
    });
  }

  /**
   * Retrieve and clear all queued messages.
   *
   * @returns Array of queued messages
   */
  getMessages(): ComponentProgressMessage[] {
    const messages = [...this.messageQueue];
    this.messageQueue = [];
    return messages;
  }
}

// ============================================================================
// COMPONENT CORE
// ============================================================================

/**
 * Multiple choice question core - data processing and state management
 */
export class MultipleChoiceQuestionCore extends BaseComponentCore<
  MultipleChoiceQuestionComponentConfig,
  MultipleChoiceQuestionComponentProgress
> {
  private _componentProgressQueueManager: MultipleChoiceQuestionMessageQueueManager;

  constructor(
    config: MultipleChoiceQuestionComponentConfig,
    progressManager: MultipleChoiceQuestionProgressManager,
    timeline: TimelineContainer,
    overallProgressManager: IReadonlyOverallProgressManager,
    navigationManager: IReadonlyNavigationManager,
    settingsManager: IReadonlySettingsManager,
    curriculumRegistry: CurriculumRegistry
  ) {
    super(
      config,
      progressManager,
      timeline,
      overallProgressManager,
      navigationManager,
      settingsManager,
      curriculumRegistry
    );

    this._componentProgressQueueManager = new MultipleChoiceQuestionMessageQueueManager(
      config.id
    );
  }

  /**
   * Create the interface for this core
   */
  protected createInterface(
    timeline: TimelineContainer
  ): BaseComponentInterface<
    MultipleChoiceQuestionComponentConfig,
    MultipleChoiceQuestionComponentProgress,
    any
  > {
    throw new Error("MultipleChoiceQuestionInterface not yet implemented");
  }

  /**
   * Set selected answer and queue message to main core
   */
  setSelectedAnswer(selectedAnswer: number[] | null): void {
    (this._progressManager as MultipleChoiceQuestionProgressManager).setSelectedAnswer(
      selectedAnswer
    );

    this._componentProgressQueueManager.queueSelectedAnswer(selectedAnswer);
  }

  /**
   * Check if component is complete based on whether question was ever answered correctly
   */
  isComplete(): boolean {
    const progress = this._progressManager.getProgress();
    return progress.hasAnsweredCorrectly;
  }

  /**
   * Get component progress messages for core polling
   */
  protected getComponentProgressMessagesInternal(): ComponentProgressMessage[] {
    return this._componentProgressQueueManager.getMessages();
  }
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

/**
 * Validates and executes multiple choice question messages in Main Core.
 *
 * Routes validated messages to appropriate MultipleChoiceQuestionProgressManager methods.
 */
export class MultipleChoiceQuestionProgressMessageHandler
  implements IComponentProgressMessageHandler
{
  constructor(
    private componentManagers: Map<
      number,
      BaseComponentProgressManager<any, any>
    >
  ) {}

  getComponentType(): string {
    return "multiple_choice_question";
  }

  handleMessage(message: ComponentProgressMessage): void {
    const manager = this.componentManagers.get(
      message.componentId
    ) as MultipleChoiceQuestionProgressManager;

    if (!manager) {
      throw new Error(`No manager found for component ${message.componentId}`);
    }

    switch (message.method) {
      case "setSelectedAnswer":
        manager.setSelectedAnswer(
          message.args[0] as number[] | null,
        );
        break;

      default:
        throw new Error(
          `MultipleChoiceQuestion components only support: setSelectedAnswer. Got: ${message.method}`
        );
    }
  }
}
 
/**
 * Create initial progress for new users (registry builder requirement)
 */
export function createInitialProgress(
  config: MultipleChoiceQuestionComponentConfig
): MultipleChoiceQuestionComponentProgress {
  return {
    lastUpdated: 0,
    selectedAnswer: null,
    hasAnsweredCorrectly: false,
  };
}