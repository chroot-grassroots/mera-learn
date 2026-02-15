/**
 * Future module level documentation here.
 *
 */

import { number, z } from "zod";
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
    question: z.string().min(1).max(1000), // question text
    questionImage: z.string().min(1).max(500).optional(), // optional image
    answers: z.array(AnswerSchema).min(1), // array of answer text
    correctAnswers: z.array(z.number().min(1)).min(1), // indices of correct answers
    feedbackCorrect: z.string().min(1).max(1000).optional(),
    feedbackIncorrect: z.string().min(1).max(1000).optional(),
    feedbackCustom: z.array(CustomFeedbackSchema).optional(),
  }).superRefine((data, ctx) => {
    const answerIds = data.answers.map((a) => a.id);
    // Check correct answer(s)
    data.correctAnswers.forEach((answerNumber: number, index: number) => {
      if (!answerIds.includes(answerNumber))
        ctx.addIssue({
          code: "custom",
          message: `Correct answer [${index}] references invalid answer ID: ${answerNumber}`,
          path: ["correctAnswers", index],
        });
    });

    // Check feedbackCustom if it exists
    if (data.feedbackCustom) {
      // Make sure every custom feedback answer corresponds to an actual answer
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
    selectedAnswer: z.array(z.number()).nullable(), // their most recent submission
    hasAnsweredCorrectly: z.boolean(), // have they ever gotten it right
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
 * @param answer - The answer to verify
 * @param config - Component configuration with answer choices
 * @returns true if answer is one of the possible choices
 */
export function isValidAnswer(
  selectedAnswer: number[] | null,
  config: MultipleChoiceQuestionComponentConfig,
): boolean {
  if (selectedAnswer === null) return true; // null signifies no answer yet

  const answerIds = config.answers.map((a) => a.id);
  return selectedAnswer.every((answer) => answerIds.includes(answer));
}


// ============================================================================
// FULL VALIDATORS
// ============================================================================

/**
 * Validation result with cleaned data and defaulting metric.
 *
 * Returns cleaned progress and whether any defaulting occurred.
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
 * Checks if the multiple choice question progress matches current config.
 * If they don't match (e.g., config changed since progress was saved),
 * returns fresh default progress.
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
  config: MultipleChoiceQuestionComponentConfig
): ValidationResult<MultipleChoiceQuestionComponentProgress> {
  // Check if structure matches
  if (!isValidAnswer(progress.selectedAnswer, config)) {
    // Structure mismatch - return fresh default (explicit defaulting)
    return {
      cleaned: {
        selectedAnswer: null,
        hasAnsweredCorrectly: false,
        lastUpdated: 0, // Explicit timestamp 0 = never set
      },
      defaultedRatio: 1.0,
    };
  }

  // Structure is valid
  return {
    cleaned: progress,
    defaultedRatio: 0.0,
  };
}


// ============================================================================
// PROGRESS MANAGER
// ============================================================================
