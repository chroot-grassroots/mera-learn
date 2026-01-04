import {
  BasicTaskComponentConfig,
  BasicTaskComponentProgressSchema,
  BasicTaskProgressManager,
} from "./cores/basicTaskCore.js";
import type {
  BaseComponentProgressManager,
  BaseComponentProgress,
  BaseComponentConfig,
} from "./cores/baseComponentCore.js";

/**
 * Create the appropriate progress manager for a component type.
 *
 * @param componentType - Type string from componentIdToTypeMap
 * @param progressData - Already-parsed progress data (will be cloned by manager)
 * @returns Typed progress manager instance
 * @throws Error if component type unknown
 */
export function createComponentProgressManager(
  componentType: string,
  config: BaseComponentConfig,  // ADD THIS PARAMETER
  progressData: BaseComponentProgress
): BaseComponentProgressManager<any, any> {
  
  switch (componentType) {
    case 'basic_task': {
      const validated = BasicTaskComponentProgressSchema.parse(progressData);
      return new BasicTaskProgressManager(
        config as BasicTaskComponentConfig,  // Pass config first
        validated
      );
    }


    // Future component types go here

    default:
      throw new Error(`Unknown component type: ${componentType}`);
  }
}
