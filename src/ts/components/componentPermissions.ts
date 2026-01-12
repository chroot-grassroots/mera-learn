/**
 * @fileoverview Component Message Type Permissions
 * @module components/componentPermissions
 * 
 * Defines which component types can queue which message types.
 * Hard-coded security boundary - only components with explicit permission
 * can trigger navigation changes, settings updates, or lesson completions.
 * 
 * Update this file when adding new component types to the system.
 */

/**
 * Message type permissions by component type.
 * 
 * Each component type specifies which of the four message queues it can access:
 * - componentProgress: Component's own state updates (checkboxes, quiz answers, etc.)
 * - overallProgress: Cross-lesson achievements (lesson completion, streaks)
 * - navigation: Page/lesson navigation changes
 * - settings: User preference updates (theme, font size, etc.)
 * 
 * Security: Components NOT listed in a polling map will never be polled for
 * that message type, preventing unauthorized state changes.
 */
export const MESSAGE_TYPE_PERMISSIONS: Record<string, {
  componentProgress: boolean;
  overallProgress: boolean;
  navigation: boolean;
  settings: boolean;
}> = {
  'basic_task': {
    componentProgress: true,   // Can update its own state
    overallProgress: false,    // Cannot mark lessons complete
    navigation: false,         // Cannot navigate
    settings: false           // Cannot change settings
  },
    'new_user_welcome': {
    componentProgress: false,   // Doesn't have persistent state
    overallProgress: false,    // Cannot mark lessons complete
    navigation: true,         // Can navigate
    settings: true           // Can change settings
  },
  // Add additional components here

};

/**
 * Validate that a component type has defined permissions.
 * 
 * @param componentType - Type string to check
 * @returns true if permissions defined
 */
export function hasPermissions(componentType: string): boolean {
  return componentType in MESSAGE_TYPE_PERMISSIONS;
}

/**
 * Get permissions for a component type.
 * 
 * @param componentType - Type string to look up
 * @returns Permission object or undefined if type not found
 */
export function getPermissions(componentType: string) {
  return MESSAGE_TYPE_PERMISSIONS[componentType];
}