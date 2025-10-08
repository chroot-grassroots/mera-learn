/**
 * @fileoverview Navigation state schemas and management
 * @module core/navigationSchema
 *
 * Tracks current lesson/page position with session-based persistence.
 * Restores user's location within 30 minutes of leaving, enabling smooth
 * UX on page refresh or brief navigation away.
 */

import { z } from "zod";
import { ImmutableId, TrumpStrategy } from "./coreTypes";
import { CurriculumRegistry } from "../registry/mera-registry";

/**
 * Navigation state schema
 *
 * Stores lesson/menu (entity) immutable ID, current page number,
 * and when it was last updated.
 */
export const NavigationStateSchema = z.object({
  currentEntityId: ImmutableId, // 0 = main menu by convention
  currentPage: z.number().min(0),
  lastUpdated: z.number().int().min(0), // Unix timestamp
});

export type NavigationState = z.infer<typeof NavigationStateSchema>;

/**
 * Manages navigation state with validated mutations.
 *
 * All mutations validate against CurriculumRegistry to prevent
 * corruption by ensuring lesson/menu and page exist.
 */
export class NavigationStateManager {
  constructor(
    private state: NavigationState,
    private curriculumRegistry: CurriculumRegistry
  ) {}

  // Returns state for persistence. Validates before returning.
  getState(): NavigationState {
    this.validateCurrentView();
    return this.state;
  }

  // Returns current view for the startup after page load
  getCurrentViewStartup(): { entityId: number; page: number } {
    // Uses Unix time in seconds
    const now = Math.floor(Date.now() / 1000);
    const thirtyMinutesAgo = now - 30 * 60;

    // Reverts to main menu if timestamp is too old
    if (this.state.lastUpdated < thirtyMinutesAgo) {
      return { entityId: 0, page: 0 };
    }

    this.validateCurrentView();
    return {
      entityId: this.state.currentEntityId,
      page: this.state.currentPage,
    };
  }

  // Returns current view once running. Used by core to check if new page needs to be loaded.
  getCurrentViewRunning(): { entityId: number; page: number } {
    return {
      entityId: this.state.currentEntityId,
      page: this.state.currentPage,
    };
  }

  // The only setter available by message from the components. Completely sets new state.
  setCurrentView(entityId: number, page: number): void {
    this.state.currentEntityId = entityId;
    this.state.currentPage = page;
    this.state.lastUpdated = Math.floor(Date.now() / 1000);
  }

  // Defaults to main menu.
  setDefaults(): void {
    this.state.currentEntityId = 0;
    this.state.currentPage = 0;
    this.state.lastUpdated = Math.floor(Date.now() / 1000);
  }

  // Most recent record trumps
  getAllTrumpStrategies(): Record<keyof NavigationState, TrumpStrategy<any>> {
    return {
      currentEntityId: "LATEST_TIMESTAMP",
      currentPage: "LATEST_TIMESTAMP",
      lastUpdated: "LATEST_TIMESTAMP",
    };
  }

  // Makes sure the entity ID exists and page count is possible for entity
  private validateCurrentView(): void {
    const { currentEntityId, currentPage } = this.state;

    if (!this.curriculumRegistry.hasEntity(currentEntityId)) {
      throw new Error(
        `Invalid navigation state: Entity ${currentEntityId} does not exist in registry`
      );
    }

    const pageCount =
      this.curriculumRegistry.getEntityPageCount(currentEntityId);
    if (currentPage >= pageCount) {
      throw new Error(
        `Invalid navigation state: Page ${currentPage} exceeds entity ${currentEntityId} page count (${pageCount})`
      );
    }
  }
}

/**
 * Schema for messages updating navigation state from components to core.
 *
 * Format: single setCurrentView method as first argument followed by menu/lesson
 * immutable ID and page number.
 */

export const NavigationMessageSchema = z.object({
  method: z.literal("setCurrentView"),
  args: z.tuple([ImmutableId, z.number().min(0)]),
});

export type NavigationMessage = z.infer<typeof NavigationMessageSchema>;

/**
 * Processes navigation messages with validation.
 *
 * Validates messages against CurriculumRegistry before forwarding
 * to NavigationStateManager. Used by Main Core to handle queued
 * component navigation requests.
 */

export class NavigationMessageManager {
  constructor(
    private navigationManager: NavigationStateManager,
    private curriculumRegistry: CurriculumRegistry
  ) {}

  // Makes sure the message calls an entity that exists and the page number is possible for entity.
  validateMessage(message: NavigationMessage): void {
    const [entityId, page] = message.args;

    if (!this.curriculumRegistry.hasEntity(entityId)) {
      throw new Error(`Invalid entity ID: ${entityId}`);
    }

    const pageCount = this.curriculumRegistry.getEntityPageCount(entityId);
    if (page >= pageCount) {
      throw new Error(
        `Invalid page ${page} for entity ${entityId} (max: ${pageCount - 1})`
      );
    }
  }

  // Validates the message, and, if valid, calls the method on the navigation manager.
  handleMessage(message: NavigationMessage): void {
    this.validateMessage(message);
    const [entityId, page] = message.args;
    this.navigationManager.setCurrentView(entityId, page);
  }
}

/**
 * Validates and queues navigation messages for Main Core processing.
 *
 * Components use this to queue navigation updates. Main Core polls via
 * getMessages() to apply validated changes to navigation state.
 */

export class NavigationMessageQueueManager {
  private messageQueue: NavigationMessage[] = [];

  constructor(private curriculumRegistry: CurriculumRegistry) {}

  queueNavigationMessage(entityId: number, page: number): void {
    const message: NavigationMessage = {
      method: "setCurrentView",
      args: [entityId, page],
    };

    // Validate before queuing
    if (!this.curriculumRegistry.hasEntity(entityId)) {
      throw new Error(`Invalid entity ID: ${entityId}`);
    }

    const pageCount = this.curriculumRegistry.getEntityPageCount(entityId);
    if (page >= pageCount) {
      throw new Error(`Invalid page ${page} for entity ${entityId}`);
    }

    this.messageQueue.push(message);
  }

  // Core drains queue by copying and clearing
  getMessages(): NavigationMessage[] {
    const messages = [...this.messageQueue];
    this.messageQueue = []; // Clear queue
    return messages;
  }
}
