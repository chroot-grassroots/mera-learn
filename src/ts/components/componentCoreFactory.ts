/**
 * @fileoverview Component Core Factory
 * @module components/componentCoreFactory
 *
 * Factory for creating component Core instances based on component type string.
 * Maps type strings from registry to actual TypeScript class constructors.
 *
 * Manually maintained - update when adding new component types.
 */

import type {
  BaseComponentCore,
  BaseComponentProgressManager,
} from "./cores/baseComponentCore.js";
import type { CurriculumRegistry } from "../registry/mera-registry.js";
import { BasicTaskCore } from "./cores/basicTaskCore.js";
import type { BasicTaskComponentConfig } from "./cores/basicTaskCore.js";
import type { BasicTaskProgressManager } from "./cores/basicTaskCore.js";
import type { IReadonlyOverallProgressManager } from "../core/overallProgressSchema.js";
import type { IReadonlyNavigationManager } from "../core/navigationSchema.js";
import type { IReadonlySettingsManager } from "../core/settingsSchema.js";
import { getTimelineInstance } from "../ui/timelineContainer.js";
import { NewUserWelcomeCore } from "./cores/newUserWelcomeCore.js";
import type { NewUserWelcomeComponentConfig } from "./cores/newUserWelcomeCore.js";
import type { NewUserWelcomeProgressManager } from "./cores/newUserWelcomeCore.js";

/**
 * Create a component Core instance based on type string.
 *
 * Factory pattern: Runtime string → TypeScript class instantiation.
 * Type-specific constructors handle their own initialization logic.
 *
 * @param componentType - Type string from registry (e.g., "basic_task")
 * @param config - Component configuration from YAML
 * @param progressManager - Progress manager for this component
 * @param curriculumData - Curriculum registry for validation
 * @returns Component Core instance
 * @throws Error if component type unknown
 */
export function createComponentCore(
  componentType: string,
  config: any,
  progressManager: BaseComponentProgressManager<any, any>,
  curriculumData: CurriculumRegistry,
  overallProgressManager: IReadonlyOverallProgressManager,
  navigationManager: IReadonlyNavigationManager,
  settingsManager: IReadonlySettingsManager
): BaseComponentCore<any, any> {

const timeline = getTimelineInstance();

  switch (componentType) {
    case "basic_task":
      return new BasicTaskCore(
        config as BasicTaskComponentConfig,
        progressManager as BasicTaskProgressManager,
        timeline,
        overallProgressManager,
        navigationManager,
        settingsManager,
        curriculumData
      );

    case "new_user_welcome":
      return new NewUserWelcomeCore(
        config as NewUserWelcomeComponentConfig,
        progressManager as NewUserWelcomeProgressManager,
        timeline,
        overallProgressManager,
        navigationManager,
        settingsManager,
        curriculumData
      );

    // TODO: Add other component types as they're implemented
    // case 'quiz':
    //   return new QuizCore(
    //     config as QuizComponentConfig,
    //     progressManager as QuizProgressManager,
    //     curriculumData
    //   );

    default:
      throw new Error(
        `Unknown component type: '${componentType}'. ` +
          `Add to componentCoreFactory.ts when implementing new component types.`
      );
  }
}
