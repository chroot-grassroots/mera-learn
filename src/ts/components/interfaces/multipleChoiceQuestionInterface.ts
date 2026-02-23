/**
 * @fileoverview Multiple Choice Question Component Interface
 * @module components/interfaces/multipleChoiceQuestionInterface
 *
 *
 */

import {
  BaseComponentInterface,
  BaseComponentInterfaceInternalState,
} from "./baseComponentInterface.js";
import type {
  MultipleChoiceQuestionComponentConfig,
  MultipleChoiceQuestionComponentProgress,
} from "../cores/multipleChoiceQuestionsCore.js";
import { MeraStyles } from "../../ui/meraStyles.js";
import { MultipleChoiceQuestionCore } from "../cores/multipleChoiceQuestionsCore";

// ============================================================================
// INTERNAL STATE
// ============================================================================

interface MultipleChoiceQuestionInternalState extends BaseComponentInterfaceInternalState {
  tentativeAnswer: number[] | null;
  allowSubmit: boolean;
  displayFeedback: boolean;
}

// ============================================================================
// INTERFACE
// ============================================================================

/**
 * Multiple Choice Question Interface
 *
 */
export class MultipleChoiceQuestionInterface extends BaseComponentInterface<
  MultipleChoiceQuestionComponentConfig,
  MultipleChoiceQuestionComponentProgress,
  MultipleChoiceQuestionInternalState
> {
  // Add typed reference to core for easier access
  declare protected componentCore: MultipleChoiceQuestionCore;

  protected createInternalState(): MultipleChoiceQuestionInternalState {
    let progress = this.componentCore.progress;
    return {
      tentativeAnswer: progress.selectedAnswer,
      allowSubmit: false,
      displayFeedback: progress.selectedAnswer !== null,
      rendered: false,
    };
  }

  protected async loadComponentSpecificAssets(): Promise<void> {
    // No assets to load
    this.setAssetLoadingState("ready");
  }

  render(): void {
    const slot = this.timelineContainer.getComponentArea(
      this.componentCore.config.id,
    );
    if (!slot) {
      console.error(
        `Slot not found for component ${this.componentCore.config.id}`,
      );
      return;
    }

    // Trusted structural scaffold — no user content here
    slot.innerHTML = `
    <div class="${MeraStyles.containers.card}">
      <div id="question-text-${this.componentCore.config.id}" 
           class="${MeraStyles.typography.heading3} ${MeraStyles.patterns.marginBottom.large}">
      </div>
      <div id="answers-${this.componentCore.config.id}" 
           class="${MeraStyles.layout.spaceYMedium}">
      </div>
      <div id="submit-${this.componentCore.config.id}" 
           class="${MeraStyles.patterns.marginBottom.medium}">
      </div>
      <div id="feedback-${this.componentCore.config.id}" class="hidden">
      </div>
    </div>
  `;

    // Safe injection of question text
    const questionElement = slot.querySelector(
      `#question-text-${this.componentCore.config.id}`,
    );
    if (questionElement) {
      questionElement.textContent = this.componentCore.config.question;
    }

    this.renderAnswers(slot);
    this.renderSubmitButton(slot);
    this.attachEventListeners();
    this.internal.rendered = true;
  }

  private renderAnswers(slot: HTMLElement): void {
    const answersContainer = slot.querySelector(
      `#answers-${this.componentCore.config.id}`,
    );
    let labelType: string;

    if (this.componentCore.config.singleAnswer) {
      labelType = "radio";
    } else {
      labelType = "checkbox";
    }

    this.componentCore.config.answers.forEach((answer) => {
      // Create the container for the single answer
      const singleAnswerContainer = document.createElement("div");

      // Create input safely
      const input = document.createElement("input");
      input.type = labelType;
      input.id = `answer-${this.componentCore.config.id}-${answer.id}`;
      input.value = String(answer.id);

      // Create label safely with textContent
      const label = document.createElement("label");
      label.htmlFor = `answer-${this.componentCore.config.id}-${answer.id}`;
      label.textContent = answer.text;

      // Build the wrapper with just structural classes — no user content
      singleAnswerContainer.className = "flex items-center gap-3";
      singleAnswerContainer.appendChild(input);
      singleAnswerContainer.appendChild(label);

      // Append to the answers container
      answersContainer?.appendChild(singleAnswerContainer);
    });
  }

  private renderSubmitButton(slot: HTMLElement): void {
    const submitContainer = slot.querySelector(
      `#submit-${this.componentCore.config.id}`,
    );

    // Set inner HTLM for the button
    if (submitContainer) {
      submitContainer.innerHTML = `
    <button 
      id="submit-btn-${this.componentCore.config.id}" 
      class="${MeraStyles.interactive.buttonSubmitDimmed}">
      Submit
    </button>`;
    }
  }

  updateUI(): void {
    const slot = this.timelineContainer.getComponentArea(
      this.componentCore.config.id,
    );

    if (!slot) {
      // Add error logic
      return;
    }

    const submitButton = slot.querySelector(
      `#submit-btn-${this.componentCore.config.id}`,
    );

    if (!submitButton) {
      // Add error logic
      return;
    }

    // Brighten submit button if there is a tenative answer that is not the submitted answer
    if (
      !(
        this.internal.tentativeAnswer === null ||
        this.answersMatch(
          this.internal.tentativeAnswer,
          this.componentCore.progress.selectedAnswer,
        )
      )
    ) {
      submitButton.classList.remove(MeraStyles.interactive.buttonSubmitDimmed);
      submitButton.classList.add(MeraStyles.interactive.buttonSubmitActive);
    } else {
      submitButton.classList.remove(MeraStyles.interactive.buttonSubmitActive);
      submitButton.classList.add(MeraStyles.interactive.buttonSubmitDimmed);
    }
  }

  private answersMatch(t: number[] | null, s: number[] | null): boolean {
    // If both are null, then answers match
    if (t === null && s === null) return true;

    // If both aren't null, then if either is null they don't match.
    if (t === null || s === null) return false;

    // If they are different lengths they don't match
    if (t.length != s.length) return false;

    // Sort both
    const sortedT = [...t].sort((a, b) => a - b);
    const sortedS = [...s].sort((a, b) => a - b);

    // They match iff every element matches in sorted array
    return sortedT.every((val, i) => val === sortedS[i]);
  }

  destroy(): void {
    // To Do: Add content to this method
  }
}
