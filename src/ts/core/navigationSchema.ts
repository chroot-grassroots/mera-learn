/**
 * @fileoverview Navigation state schemas and management
 * @module core/navigationSchema
 *
 * Tracks current lesson/page position with session-based persistence.
 * Restores user's location within 30 minutes of leaving, enabling smooth
 * UX on page refresh or brief navigation away.
 *
 * VALIDATION ARCHITECTURE:
 * - Shared validation helpers: Atomic checks used by both validators and managers
 * - Full validators: Pure functions that validate entire navigation state
 * - Manager classes: Use helpers for defensive runtime validation
 *
 * CLONING STRATEGY:
 * - Constructor: Clones input data to prevent external mutations
 * - getState(): Returns clone to prevent external access to internal state
 * - All mutations happen only on internal cloned copy
 */

import { z } from "zod";
import { ImmutableId } from "./coreTypes.js";
import { CurriculumRegistry } from "../registry/mera-registry.js";

/**
 * Navigation state schema
 *
 * Stores lesson/menu (entity) immutable ID, current page number,
 * and when it was last updated.
 *
 * NOTE: No .default() on lastUpdated - progressIntegrity.ts handles defaulting
 * explicitly with proper metrics tracking.
 */
export const NavigationStateSchema = z.object({
  currentEntityId: ImmutableId, // 0 = main menu by convention
  currentPage: z.number().min(0),
  lastUpdated: z.number().int().min(0), // Unix timestamp
});

export type NavigationState = z.infer<typeof NavigationStateSchema>;

// ============================================================================
// DEFAULT VALUES
// ============================================================================

/**
 * Get default navigation state (main menu, timestamp 0).
 *
 * Used by:
 * - progressIntegrity.ts for navigation recovery when entity deleted
 * - New user initialization
 * - Stale session reversion (>30 min old)
 *
 * Timestamp 0 semantics:
 * - Indicates "never set by user" or "defaulted on load"
 * - Always loses in merge conflict resolution (any timestamp > 0 wins)
 *
 * @returns Default NavigationState pointing to main menu
 */
export function getDefaultNavigationState(): NavigationState {
  return {
    currentEntityId: 0,
    currentPage: 0,
    lastUpdated: 0,
  };
}

// ============================================================================
// SHARED VALIDATION HELPERS
// ============================================================================

/**
 * Check if an entity ID exists in the curriculum registry.
 *
 * Used by both validateNavigationEntity (recovery) and
 * NavigationStateManager (runtime mutations) to ensure consistency.
 *
 * @param entityId - Entity ID to validate (0 = main menu is always valid)
 * @param curriculum - Curriculum registry to check against
 * @returns true if entity exists in curriculum
 */
export function isValidEntityId(
  entityId: number,
  curriculum: CurriculumRegistry
): boolean {
  return entityId === 0 || curriculum.hasEntity(entityId);
}

/**
 * Check if a page number is valid for a given entity.
 *
 * Used by both validateNavigationEntity (recovery) and
 * NavigationStateManager (runtime mutations) to ensure consistency.
 *
 * @param entityId - Entity ID to check page count for
 * @param page - Page number to validate
 * @param curriculum - Curriculum registry to check against
 * @returns true if page is within entity's page count
 */
export function isValidPageNumber(
  entityId: number,
  page: number,
  curriculum: CurriculumRegistry
): boolean {
  const pageCount = curriculum.getEntityPageCount(entityId);
  return page >= 0 && page < pageCount;
}

// ============================================================================
// FULL VALIDATORS
// ============================================================================

/**
 * Result of validating navigation state against curriculum.
 *
 * Returns cleaned state (defaulted if invalid) and whether defaulting occurred.
 */
export interface NavigationValidationResult {
  cleaned: NavigationState;
  wasDefaulted: boolean;
}

/**
 * Validate navigation state against current curriculum registry.
 *
 * PURE FUNCTION - Never throws, always returns valid data.
 *
 * Checks if the current entity exists and the page number is valid.
 * If either is invalid (e.g., entity was deleted from curriculum),
 * defaults to main menu.
 *
 * Used by:
 * - progressIntegrity: Gracefully handles deleted entities
 * - NavigationStateManager: Defensive check (throws if defaulted)
 *
 * @param data - Navigation state to validate
 * @param curriculum - Current curriculum registry (source of truth)
 * @returns Cleaned state + whether it was defaulted
 */
export function validateNavigationEntity(
  data: NavigationState,
  curriculum: CurriculumRegistry
): NavigationValidationResult {
  const entityId = data.currentEntityId;

  // Check if entity is valid
  if (!isValidEntityId(entityId, curriculum)) {
    // Entity deleted from curriculum - default to main menu
    return {
      cleaned: getDefaultNavigationState(),
      wasDefaulted: true,
    };
  }

  // Entity is valid, check page number
  if (!isValidPageNumber(entityId, data.currentPage, curriculum)) {
    // Page out of bounds - default to main menu
    return {
      cleaned: getDefaultNavigationState(),
      wasDefaulted: true,
    };
  }

  // Navigation state is valid
  return {
    cleaned: data,
    wasDefaulted: false,
  };
}

// ============================================================================
// MANAGER CLASSES
// ============================================================================

/**
 * Manages navigation state with validated mutations.
 *
 * All mutations validate against CurriculumRegistry to prevent
 * corruption by ensuring lesson/menu and page exist.
 *
 * CLONING STRATEGY:
 * - Constructor clones input to own internal copy
 * - getState() returns clone to prevent external mutations
 * - Mutations only affect internal copy
 */

/**
 * Readonly interface for components.
 * Components can read navigation state but cannot mutate via this interface.
 */
export interface IReadonlyNavigationManager {
  getState(): Readonly<NavigationState>;
}

export class NavigationStateManager implements IReadonlyNavigationManager {
  private state: NavigationState;

  constructor(
    initialState: NavigationState,
    private curriculumRegistry: CurriculumRegistry
  ) {
    // Clone input data - manager owns its own copy
    this.state = structuredClone(initialState);
  }

  /**
   * Returns cloned state for persistence.
   *
   * Clone ensures external code cannot mutate manager's internal state.
   * Validates before returning using private helper.
   *
   * @returns Cloned navigation state
   * @throws Error if current state is invalid (entity/page doesn't exist)
   */
  getState(): NavigationState {
    this.validateCurrentView();
    // Return clone to prevent external mutations
    return structuredClone(this.state);
  }

  /**
   * Returns current view for startup after page load.
   *
   * Reverts to main menu if timestamp is older than 30 minutes.
   *
   * @returns Entity ID and page number for startup
   */
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

  /**
   * Returns current view while running.
   *
   * Used by core to check if new page needs to be loaded.
   *
   * @returns Entity ID and page number
   */
  getCurrentViewRunning(): { entityId: number; page: number } {
    return {
      entityId: this.state.currentEntityId,
      page: this.state.currentPage,
    };
  }

  /**
   * Set navigation to specific entity and page.
   *
   * The only setter available via messages from components.
   * Completely replaces current state with new timestamp.
   *
   * @param entityId - Entity ID to navigate to
   * @param page - Page number within entity
   */
  setCurrentView(entityId: number, page: number): void {
    this.state.currentEntityId = entityId;
    this.state.currentPage = page;
    this.state.lastUpdated = Math.floor(Date.now() / 1000);
  }

  /**
   * Reset navigation to main menu with current timestamp.
   */
  setDefaults(): void {
    this.state.currentEntityId = 0;
    this.state.currentPage = 0;
    this.state.lastUpdated = Math.floor(Date.now() / 1000);
  }

  /**
   * Validate current navigation state.
   *
   * Uses shared validation helpers to ensure entity and page are valid.
   * Throws if validation fails (defensive runtime check).
   *
   * @throws Error if entity doesn't exist or page is out of bounds
   */
  private validateCurrentView(): void {
    const { currentEntityId, currentPage } = this.state;

    if (!isValidEntityId(currentEntityId, this.curriculumRegistry)) {
      throw new Error(
        `Invalid navigation state: Entity ${currentEntityId} does not exist in registry`
      );
    }

    if (
      !isValidPageNumber(currentEntityId, currentPage, this.curriculumRegistry)
    ) {
      const pageCount =
        this.curriculumRegistry.getEntityPageCount(currentEntityId);
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
export class NavigationMessageHandler {
  constructor(
    private navigationManager: NavigationStateManager,
    private curriculumRegistry: CurriculumRegistry
  ) {}

  /**
   * Validate a navigation message.
   *
   * Uses shared validation helpers to ensure entity and page are valid.
   *
   * @param message - Navigation message to validate
   * @throws Error if entity doesn't exist or page is out of bounds
   */
  validateMessage(message: NavigationMessage): void {
    const [entityId, page] = message.args;

    if (!isValidEntityId(entityId, this.curriculumRegistry)) {
      throw new Error(`Invalid entity ID: ${entityId}`);
    }

    if (!isValidPageNumber(entityId, page, this.curriculumRegistry)) {
      const pageCount = this.curriculumRegistry.getEntityPageCount(entityId);
      throw new Error(
        `Invalid page ${page} for entity ${entityId} (max: ${pageCount - 1})`
      );
    }
  }

  /**
   * Validate and handle a navigation message.
   *
   * Validates message, then forwards to navigation manager if valid.
   *
   * @param message - Navigation message to handle
   * @throws Error if validation fails
   */
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

  /**
   * Queue a navigation message.
   *
   * Validates entity and page using shared helpers before queueing.
   *
   * @param entityId - Entity to navigate to
   * @param page - Page number within entity
   * @throws Error if entity doesn't exist or page is out of bounds
   */
  queueNavigationMessage(entityId: number, page: number): void {
    const message: NavigationMessage = {
      method: "setCurrentView",
      args: [entityId, page],
    };

    // Validate before queuing
    if (!isValidEntityId(entityId, this.curriculumRegistry)) {
      throw new Error(`Invalid entity ID: ${entityId}`);
    }

    if (!isValidPageNumber(entityId, page, this.curriculumRegistry)) {
      throw new Error(`Invalid page ${page} for entity ${entityId}`);
    }

    this.messageQueue.push(message);
  }

  /**
   * Retrieve and clear all queued messages.
   *
   * Core polls this method to get pending navigation updates.
   * Messages are removed from queue after retrieval.
   *
   * @returns Array of queued messages
   */
  getMessages(): NavigationMessage[] {
    const messages = [...this.messageQueue];
    this.messageQueue = [];
    return messages;
  }
}
