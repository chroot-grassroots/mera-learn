/**
 * @fileoverview Progress integrity checking, recovery, and validation
 * @module initialization/progressIntegrity
 *
 * TIMESTAMP ARCHITECTURE:
 * - lessonCompletions use CompletionData format {timeCompleted, lastUpdated}
 * - domainCompletions use CompletionData format {timeCompleted, lastUpdated}
 * - Settings use tuple format [value, timestamp]
 * - Component progress includes lastUpdated timestamp
 * - Counters calculated from CompletionData.timeCompleted !== null
 *
 * Transforms potentially corrupted or malformed backup data into a valid
 * PodStorageBundle matching current schema version. Handles:
 *
 * - Corruption detection via current-count trackers
 * - Curriculum reconciliation (drops deleted content)
 * - Recovery from partial data loss
 * - Initialization of missing components with sensible defaults
 *
 * Design principles:
 * - Never throw - always return valid bundle with metrics
 * - Best-effort extraction - salvage recognizable data
 * - Honest reporting - metrics show recovery quality
 * - Registry as truth - validate against current curriculum
 * - Full structure initialization - all components always present
 *
 * Recovery strategies vary by section based on data importance and replaceability.
 *
 * INITIALIZATION DEPENDENCY:
 * This module requires parsed lesson configs (from YAML parsing phase) to validate
 * component progress structures. Orchestration must ensure YAML parsing completes
 * before calling enforceDataIntegrity().
 */

import {
  PodStorageBundle,
  PodStorageBundleSchema,
  PodMetadata,
  PodMetadataSchema,
} from "../persistence/podStorageSchema.js";
import {
  OverallProgressData,
  OverallProgressDataSchema,
  CompletionData,
  CompletionDataSchema,
  getDefaultOverallProgress,
} from "../core/overallProgressSchema.js";
import {
  SettingsData,
  SettingsDataSchema,
  getDefaultSettings,
} from "../core/settingsSchema.js";
import {
  NavigationState,
  NavigationStateSchema,
  validateNavigationEntity,
  getDefaultNavigationState,
} from "../core/navigationSchema.js";
import {
  CombinedComponentProgress,
  CombinedComponentProgressSchema,
} from "../core/combinedComponentProgressSchema.js";
import {
  CurriculumRegistry,
  progressSchemaMap,
  componentValidatorMap,
  componentInitializerMap,
  curriculumData,
} from "../registry/mera-registry.js";

import type { ParsedLessonData } from "../core/parsedLessonData.js";

// Re-export for consumers who use enforceDataIntegrity
export type { ParsedLessonData };

/**
 * Result of extracting a section with quality metrics
 */
interface ExtractionResult<T> {
  data: T;
  defaultedRatio: number; // 0.0 = perfect extraction, 1.0 = fully defaulted
}

/**
 * Specialized result for overallProgress with corruption detection
 */
interface OverallProgressExtractionResult {
  data: OverallProgressData;
  lessonsDroppedRatio: number; // 0.0 = none dropped, 1.0 = all dropped
  domainsDroppedRatio: number; // 0.0 = none dropped, 1.0 = all dropped
  lessonsDroppedCount: number; // Absolute count of lessons dropped
  domainsDroppedCount: number; // Absolute count of domains dropped
  corruptionDetected: boolean; // Mismatch between counters and actual data
  lessonsLostToCorruption: number; // Lessons missing due to corruption
  domainsLostToCorruption: number; // Domains missing due to corruption
}

/**
 * Metadata extraction result with webId mismatch tracking
 */
interface MetadataExtractionResult extends ExtractionResult<PodMetadata> {
  webIDMismatch?: {
    expected: string;
    found: string;
  };
}

/**
 * Complete recovery result with per-section metrics
 */
export interface EnforcementResult {
  perfectlyValidInput: boolean; // Top-level flag: true if input needed no fixes/defaults
  bundle: PodStorageBundle;
  recoveryMetrics: {
    metadata: {
      defaultedRatio: number;
    };
    overallProgress: {
      lessonsDroppedRatio: number;
      domainsDroppedRatio: number;
      lessonsDroppedCount: number;
      domainsDroppedCount: number;
      corruptionDetected: boolean;
      lessonsLostToCorruption: number;
      domainsLostToCorruption: number;
    };
    settings: {
      defaultedRatio: number;
    };
    navigationState: {
      wasDefaulted: boolean;
    };
    combinedComponentProgress: {
      defaultedRatio: number;
      componentsRetained: number;
      componentsDefaulted: number;
    };
  };
  criticalFailures: {
    webIdMismatch?: {
      expected: string;
      found: string | null;
    };
  };
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Main entry point: Migrate/restore arbitrary JSON to current schema version.
 *
 * NEVER THROWS - always returns valid bundle with metrics about
 * data salvage quality.
 *
 * @param rawJson - JSON string (potentially corrupted, old version, or malformed)
 * @param expectedWebId - WebId that must match for backup validity
 * @param lessonConfigs - Parsed lesson data for component validation
 * @returns Valid bundle + granular recovery metrics + critical failures
 * @throws Error if lessonConfigs is empty (initialization order violation)
 */
export function enforceDataIntegrity(
  rawJson: string,
  expectedWebId: string,
  lessonConfigs: Map<number, ParsedLessonData>
): EnforcementResult {
  // Defensive check: Ensure initialization order is correct
  if (!lessonConfigs || lessonConfigs.size === 0) {
    throw new Error(
      "progressRecovery requires parsed lesson configs. " +
        "Ensure YAML parsing phase completes before recovery phase."
    );
  }

  // Phase 1: Parse JSON string
  let parsed: any;
  try {
    parsed = JSON.parse(rawJson);
  } catch (e) {
    // Unparseable JSON - return fully defaulted bundle
    console.warn("⚠️ JSON parse failed, returning fully defaulted bundle");
    return createFullyDefaultedResult(expectedWebId, null);
  }

  // Phase 2: Extract each section independently using current schemas
  const metadataResult = extractMetadata(parsed, expectedWebId);
  const overallProgressResult = extractOverallProgress(parsed);
  const settingsResult = extractSettings(parsed);
  const navigationResult = extractNavigationState(parsed);
  const componentProgressResult = extractCombinedComponentProgress(
    parsed,
    lessonConfigs
  );

  // Phase 3: Assemble valid bundle
  let bundle: PodStorageBundle = {
    metadata: metadataResult.data,
    overallProgress: overallProgressResult.data,
    settings: settingsResult.data,
    navigationState: navigationResult.data,
    combinedComponentProgress: componentProgressResult.data,
  };

  // Phase 3.5: Final validation - ensure assembled bundle conforms to schema
  // This catches any inconsistencies from manual construction
  // Should never fail if extraction functions are correct, but provides safety net
  try {
    bundle = PodStorageBundleSchema.parse(bundle);
  } catch (validationError) {
    // This should never happen - indicates bug in extraction logic
    console.error(
      "CRITICAL: Assembled bundle failed schema validation:",
      validationError
    );
    // Re-throw because this means our extraction logic has a bug
    throw new Error(
      "Bundle validation failed - this is a bug in progressIntegrity.ts"
    );
  }

  // Phase 4: Calculate if input was perfectly valid (needed no fixes)
  const hasCriticalFailures = metadataResult.webIDMismatch !== undefined;
  const perfectlyValidInput =
    !hasCriticalFailures &&
    !overallProgressResult.corruptionDetected &&
    metadataResult.defaultedRatio === 0 &&
    overallProgressResult.lessonsDroppedRatio === 0 &&
    overallProgressResult.domainsDroppedRatio === 0 &&
    settingsResult.defaultedRatio === 0 &&
    !navigationResult.wasDefaulted &&
    componentProgressResult.defaultedRatio === 0;

  // Phase 5: Return with granular metrics
  return {
    perfectlyValidInput,
    bundle,
    recoveryMetrics: {
      metadata: {
        defaultedRatio: metadataResult.defaultedRatio,
      },
      overallProgress: {
        lessonsDroppedRatio: overallProgressResult.lessonsDroppedRatio,
        domainsDroppedRatio: overallProgressResult.domainsDroppedRatio,
        lessonsDroppedCount: overallProgressResult.lessonsDroppedCount,
        domainsDroppedCount: overallProgressResult.domainsDroppedCount,
        corruptionDetected: overallProgressResult.corruptionDetected,
        lessonsLostToCorruption: overallProgressResult.lessonsLostToCorruption,
        domainsLostToCorruption: overallProgressResult.domainsLostToCorruption,
      },
      settings: {
        defaultedRatio: settingsResult.defaultedRatio,
      },
      navigationState: {
        wasDefaulted: navigationResult.wasDefaulted,
      },
      combinedComponentProgress: {
        defaultedRatio: componentProgressResult.defaultedRatio,
        componentsRetained: componentProgressResult.componentsRetained,
        componentsDefaulted: componentProgressResult.componentsDefaulted,
      },
    },
    criticalFailures: metadataResult.webIDMismatch
      ? {
          webIdMismatch: metadataResult.webIDMismatch,
        }
      : {},
  };
}

// ============================================================================
// EXTRACTION FUNCTIONS
// ============================================================================

/**
 * Extract metadata with field-level defaulting.
 *
 * Strategy: Metadata is critical (webId must match or reject backup).
 * Try each field independently with validation.
 *
 * SECURITY: If webId doesn't match expectedWebId, returns invalid placeholder URL
 * "https://error.mera.invalid/webid-mismatch" to prevent accidentally loading
 * another user's data. The initialization orchestrator must check for this and
 * handle it as a critical failure.
 *
 * @param parsed - Raw parsed JSON
 * @param expectedWebId - WebId that should be in backup
 * @returns Metadata + defaultedRatio + webId mismatch info
 */
function extractMetadata(
  parsed: any,
  expectedWebId: string
): MetadataExtractionResult {
  // Try Zod parse first
  const zodResult = PodMetadataSchema.safeParse(parsed?.metadata);

  if (zodResult.success) {
    // Check webId match
    if (zodResult.data.webId !== expectedWebId) {
      return {
        data: { webId: "https://error.mera.invalid/webid-mismatch" }, // Security: Never use mismatched webId
        defaultedRatio: 1.0,
        webIDMismatch: {
          expected: expectedWebId,
          found: zodResult.data.webId,
        },
      };
    }

    return {
      data: zodResult.data,
      defaultedRatio: 0.0,
    };
  }

  // Zod failed - extract webId or default
  const candidate = parsed?.metadata || {};
  const webId =
    typeof candidate.webId === "string" ? candidate.webId : expectedWebId;

  const webIDMismatch =
    webId !== expectedWebId
      ? {
          expected: expectedWebId,
          found: webId,
        }
      : undefined;

  return {
    data: { webId: "https://error.mera.invalid/webid-mismatch" }, // Security: Never use mismatched webId
    defaultedRatio: 1.0,
    webIDMismatch,
  };
}

/**
 * Extract overall progress with curriculum reconciliation.
 *
 * Strategy: Salvage lessonCompletions/domainCompletions where possible,
 * default counters and streak info.
 *
 * Always calls reconcileOverallProgress to validate against current curriculum.
 *
 * @param parsed - Raw parsed JSON
 * @returns Progress data + curriculum reconciliation metrics
 */
function extractOverallProgress(parsed: any): OverallProgressExtractionResult {
  // Try Zod parse first
  const zodResult = OverallProgressDataSchema.safeParse(
    parsed?.overallProgress
  );
  if (zodResult.success) {
    // Valid structure - still need registry reconciliation
    return reconcileOverallProgress(zodResult.data);
  }

  // Zod failed - extract what we can with defaults
  const candidate = parsed?.overallProgress || {};

  const overallProgress: OverallProgressData = getDefaultOverallProgress();

  // Extract lessonCompletions (should be CompletionData format)
  if (
    typeof candidate.lessonCompletions === "object" &&
    candidate.lessonCompletions !== null
  ) {
    overallProgress.lessonCompletions = candidate.lessonCompletions;
  }

  // Extract domainCompletions (should be CompletionData format)
  if (
    typeof candidate.domainCompletions === "object" &&
    candidate.domainCompletions !== null
  ) {
    overallProgress.domainCompletions = candidate.domainCompletions;
  }

  // Extract currentStreak
  if (
    typeof candidate.currentStreak === "number" &&
    candidate.currentStreak >= 0
  ) {
    overallProgress.currentStreak = candidate.currentStreak;
  }

  // Extract lastStreakCheck
  if (
    typeof candidate.lastStreakCheck === "number" &&
    candidate.lastStreakCheck >= 0
  ) {
    overallProgress.lastStreakCheck = candidate.lastStreakCheck;
  }

  // Extract current-count trackers (for corruption detection)
  if (
    typeof candidate.totalLessonsCompleted === "number" &&
    candidate.totalLessonsCompleted >= 0
  ) {
    overallProgress.totalLessonsCompleted = candidate.totalLessonsCompleted;
  }

  if (
    typeof candidate.totalDomainsCompleted === "number" &&
    candidate.totalDomainsCompleted >= 0
  ) {
    overallProgress.totalDomainsCompleted = candidate.totalDomainsCompleted;
  }

  return reconcileOverallProgress(overallProgress);
}

/**
 * Reconcile lesson/domain completions against current curriculum.
 *
 * Starts with valid schema defaults, then selectively copies validated fields.
 * This ensures the result always conforms to OverallProgressDataSchema.
 *
 * Uses shared validation helpers (isValidLessonId, isValidDomainId) from
 * overallProgressSchema to maintain single source of truth for validation logic.
 *
 * Process:
 * 1. Detect corruption by comparing counters to actual completion data
 * 2. Drop lessons/domains not in current curriculum (clean old data)
 * 3. Initialize missing curriculum entities as incomplete
 * 4. Recalculate counters from actual data (self-healing)
 *
 * Counters work as corruption detectors:
 * - totalLessonsCompleted tracks count of non-null timeCompleted
 * - If counter != actual → data was corrupted, report lost lessons/domains
 * - After reconciliation: counter always matches actual (self-healing)
 *
 * @param progress - Progress data to reconcile (potentially corrupted)
 * @returns Reconciled progress + curriculum drop metrics + corruption detection
 */
function reconcileOverallProgress(
  progress: OverallProgressData
): OverallProgressExtractionResult {
  // Initialize result with empty completions
  const result: OverallProgressData = {
    lessonCompletions: {},
    domainCompletions: {},
    currentStreak: progress.currentStreak,
    lastStreakCheck: progress.lastStreakCheck,
    totalLessonsCompleted: 0,
    totalDomainsCompleted: 0,
  };

  // Track what was claimed vs what we actually have
  const claimedLessons = progress.totalLessonsCompleted ?? 0;
  const claimedDomains = progress.totalDomainsCompleted ?? 0;

  let actualCompletedLessons = 0;
  let actualCompletedDomains = 0;
  let lessonsDropped = 0;
  let domainsDropped = 0;

  // Phase 1: Process lessons - validate and count
  for (const [lessonIdStr, completion] of Object.entries(
    progress.lessonCompletions
  )) {
    const lessonId = parseInt(lessonIdStr, 10);

    // Validate lesson exists in curriculum
    if (!curriculumData.hasLesson(lessonId)) {
      // Lesson no longer in curriculum - drop it
      lessonsDropped++;
      continue;
    }

    // Validate completion data structure
    const zodResult = CompletionDataSchema.safeParse(completion);
    if (!zodResult.success) {
      // Invalid completion data - skip this lesson
      lessonsDropped++;
      continue;
    }

    // Valid lesson - copy to result
    result.lessonCompletions[lessonIdStr] = zodResult.data;

    // Count if completed
    if (zodResult.data.timeCompleted !== null) {
      actualCompletedLessons++;
    }
  }

  // Phase 2: Process domains - validate and count
  for (const [domainIdStr, completion] of Object.entries(
    progress.domainCompletions
  )) {
    const domainId = parseInt(domainIdStr, 10);

    // Validate domain exists in curriculum
    if (!curriculumData.hasDomain(domainId)) {
      // Domain no longer in curriculum - drop it
      domainsDropped++;
      continue;
    }

    // Validate completion data structure
    const zodResult = CompletionDataSchema.safeParse(completion);
    if (!zodResult.success) {
      // Invalid completion data - skip this domain
      domainsDropped++;
      continue;
    }

    // Valid domain - copy to result
    result.domainCompletions[domainIdStr] = zodResult.data;

    // Count if completed
    if (zodResult.data.timeCompleted !== null) {
      actualCompletedDomains++;
    }
  }

  // Phase 3: Initialize missing curriculum entities
  const allLessonIds = curriculumData.getAllLessonIds();
  for (const lessonId of allLessonIds) {
    const key = lessonId.toString();
    if (!result.lessonCompletions[key]) {
      result.lessonCompletions[key] = {
        timeCompleted: null,
        lastUpdated: 0,
      };
    }
  }

  const allDomainIds = curriculumData.getAllDomainIds();
  for (const domainId of allDomainIds) {
    const key = domainId.toString();
    if (!result.domainCompletions[key]) {
      result.domainCompletions[key] = {
        timeCompleted: null,
        lastUpdated: 0,
      };
    }
  }

  // Phase 4: Detect corruption and set corrected counters
  const corruptionDetected =
    claimedLessons !== actualCompletedLessons ||
    claimedDomains !== actualCompletedDomains;

  const lessonsLostToCorruption = Math.max(
    0,
    claimedLessons - actualCompletedLessons
  );
  const domainsLostToCorruption = Math.max(
    0,
    claimedDomains - actualCompletedDomains
  );

  // Set corrected counters (self-healing)
  result.totalLessonsCompleted = actualCompletedLessons;
  result.totalDomainsCompleted = actualCompletedDomains;

  // Calculate drop ratios
  const originalLessonCount = Object.keys(progress.lessonCompletions).length;
  const originalDomainCount = Object.keys(progress.domainCompletions).length;

  return {
    data: result,
    lessonsDroppedRatio:
      originalLessonCount > 0 ? lessonsDropped / originalLessonCount : 0.0,
    domainsDroppedRatio:
      originalDomainCount > 0 ? domainsDropped / originalDomainCount : 0.0,
    lessonsDroppedCount: lessonsDropped,
    domainsDroppedCount: domainsDropped,
    corruptionDetected,
    lessonsLostToCorruption,
    domainsLostToCorruption,
  };
}

/**
 * Extract settings with field-level defaulting.
 *
 * Settings use [value, timestamp] tuple format.
 *
 * Strategy: Settings are user preferences - salvage each field independently.
 * If field invalid, default it but keep rest.
 *
 * Uses getDefaultSettings() from settingsSchema as single source of truth
 * for default values.
 *
 * @param parsed - Raw parsed JSON
 * @returns Settings + defaultedRatio
 */
function extractSettings(parsed: any): ExtractionResult<SettingsData> {
  // Get defaults from schema module (single source of truth)
  const defaults = getDefaultSettings();

  // Extract field-by-field with defaults
  const candidate = parsed?.settings || {};
  const settings: Partial<SettingsData> = {};
  const totalFields = 11;
  let defaultedFields = 0;

  // Field 1: weekStartDay
  if (
    Array.isArray(candidate.weekStartDay) &&
    [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ].includes(candidate.weekStartDay[0])
  ) {
    settings.weekStartDay = [
      candidate.weekStartDay[0],
      candidate.weekStartDay[1] ?? 0,
    ];
  } else {
    settings.weekStartDay = defaults.weekStartDay;
    defaultedFields++;
  }

  // Field 2: weekStartTimeUTC
  if (
    Array.isArray(candidate.weekStartTimeUTC) &&
    typeof candidate.weekStartTimeUTC[0] === "string" &&
    /^\d{2}:\d{2}$/.test(candidate.weekStartTimeUTC[0])
  ) {
    settings.weekStartTimeUTC = [
      candidate.weekStartTimeUTC[0],
      candidate.weekStartTimeUTC[1] ?? 0,
    ];
  } else {
    settings.weekStartTimeUTC = defaults.weekStartTimeUTC;
    defaultedFields++;
  }

  // Field 3: theme
  if (
    Array.isArray(candidate.theme) &&
    ["light", "dark", "auto"].includes(candidate.theme[0])
  ) {
    settings.theme = [candidate.theme[0], candidate.theme[1] ?? 0];
  } else {
    settings.theme = defaults.theme;
    defaultedFields++;
  }

  // Field 4: learningPace
  if (
    Array.isArray(candidate.learningPace) &&
    ["accelerated", "standard", "flexible"].includes(candidate.learningPace[0])
  ) {
    settings.learningPace = [
      candidate.learningPace[0],
      candidate.learningPace[1] ?? 0,
    ];
  } else {
    settings.learningPace = defaults.learningPace;
    defaultedFields++;
  }

  // Field 5: optOutDailyPing
  if (
    Array.isArray(candidate.optOutDailyPing) &&
    typeof candidate.optOutDailyPing[0] === "boolean"
  ) {
    settings.optOutDailyPing = [
      candidate.optOutDailyPing[0],
      candidate.optOutDailyPing[1] ?? 0,
    ];
  } else {
    settings.optOutDailyPing = defaults.optOutDailyPing;
    defaultedFields++;
  }

  // Field 6: optOutErrorPing
  if (
    Array.isArray(candidate.optOutErrorPing) &&
    typeof candidate.optOutErrorPing[0] === "boolean"
  ) {
    settings.optOutErrorPing = [
      candidate.optOutErrorPing[0],
      candidate.optOutErrorPing[1] ?? 0,
    ];
  } else {
    settings.optOutErrorPing = defaults.optOutErrorPing;
    defaultedFields++;
  }

  // Field 7: fontSize
  if (
    Array.isArray(candidate.fontSize) &&
    ["small", "medium", "large"].includes(candidate.fontSize[0])
  ) {
    settings.fontSize = [candidate.fontSize[0], candidate.fontSize[1] ?? 0];
  } else {
    settings.fontSize = defaults.fontSize;
    defaultedFields++;
  }

  // Field 8: highContrast
  if (
    Array.isArray(candidate.highContrast) &&
    typeof candidate.highContrast[0] === "boolean"
  ) {
    settings.highContrast = [
      candidate.highContrast[0],
      candidate.highContrast[1] ?? 0,
    ];
  } else {
    settings.highContrast = defaults.highContrast;
    defaultedFields++;
  }

  // Field 9: reducedMotion
  if (
    Array.isArray(candidate.reducedMotion) &&
    typeof candidate.reducedMotion[0] === "boolean"
  ) {
    settings.reducedMotion = [
      candidate.reducedMotion[0],
      candidate.reducedMotion[1] ?? 0,
    ];
  } else {
    settings.reducedMotion = defaults.reducedMotion;
    defaultedFields++;
  }

  // Field 10: focusIndicatorStyle
  if (
    Array.isArray(candidate.focusIndicatorStyle) &&
    ["default", "enhanced"].includes(candidate.focusIndicatorStyle[0])
  ) {
    settings.focusIndicatorStyle = [
      candidate.focusIndicatorStyle[0],
      candidate.focusIndicatorStyle[1] ?? 0,
    ];
  } else {
    settings.focusIndicatorStyle = defaults.focusIndicatorStyle;
    defaultedFields++;
  }

  // Field 11: audioEnabled
  if (
    Array.isArray(candidate.audioEnabled) &&
    typeof candidate.audioEnabled[0] === "boolean"
  ) {
    settings.audioEnabled = [
      candidate.audioEnabled[0],
      candidate.audioEnabled[1] ?? 0,
    ];
  } else {
    settings.audioEnabled = defaults.audioEnabled;
    defaultedFields++;
  }

  return {
    data: settings as SettingsData,
    defaultedRatio: defaultedFields / totalFields,
  };
}

/**
 * Extract navigation state with registry validation.
 *
 * Strategy: Navigation is ephemeral (where user left off). Binary strategy:
 * use all or default all.
 *
 * Uses shared validator from navigationSchema for entity validation.
 *
 * @param parsed - Raw parsed JSON
 * @returns Navigation state + whether defaulted
 */
function extractNavigationState(
  parsed: any
): ExtractionResult<NavigationState> & { wasDefaulted: boolean } {
  // Try Zod parse first
  const zodResult = NavigationStateSchema.safeParse(parsed?.navigationState);

  if (zodResult.success) {
    // Valid structure - check entity exists in curriculum
    const validationResult = validateNavigationEntity(
      zodResult.data,
      curriculumData
    );

    return {
      data: validationResult.cleaned,
      defaultedRatio: validationResult.wasDefaulted ? 1.0 : 0.0,
      wasDefaulted: validationResult.wasDefaulted,
    };
  }
  // Zod validation failed - return defaults
  return {
    data: getDefaultNavigationState(), // <-- Use centralized default function
    defaultedRatio: 1.0,
    wasDefaulted: true,
  };
}

/**
 * Extract combined component progress with full initialization.
 *
 * Strategy: Create complete mapping of ALL components in current curriculum.
 * For each component:
 * 1. If exists in backup and valid → keep it
 * 2. If missing or invalid → initialize with createInitialProgress()
 *
 * This ensures the returned structure always contains every component
 * in the curriculum, either with real progress or sensible defaults.
 *
 * Validation per component:
 * - Zod schema validation (structural correctness)
 * - Component config validation (progress structure matches current YAML)
 * - Verify lastUpdated field exists
 *
 * Component worth 2-3 minutes max - not worth complex field-level recovery.
 *
 * @param parsed - Raw parsed JSON
 * @param lessonConfigs - Parsed lesson data for component validation
 * @returns Component progress + per-component metrics
 */
function extractCombinedComponentProgress(
  parsed: any,
  lessonConfigs: Map<number, ParsedLessonData>
): ExtractionResult<CombinedComponentProgress> & {
  componentsRetained: number;
  componentsDefaulted: number;
} {
  const candidateComponents = parsed?.combinedComponentProgress?.components;
  const savedComponents =
    typeof candidateComponents === "object" && candidateComponents !== null
      ? candidateComponents
      : {};

  const components: Record<string, any> = {};
  let componentsRetained = 0;
  let componentsDefaulted = 0;

  // Iterate through ALL components in current curriculum
  const allComponentIds = curriculumData.getAllComponentIds();

  for (const componentId of allComponentIds) {
    const componentIdStr = componentId.toString();
    const savedProgress = savedComponents[componentIdStr];

    // If component not in backup, initialize with default
    if (savedProgress === undefined) {
      const componentType = curriculumData.getComponentType(componentId);
      if (componentType) {
        const initializer = componentInitializerMap.get(componentType);
        components[componentIdStr] = initializer
          ? initializer()
          : { lastUpdated: 0 }; // Ultimate fallback only
      } else {
        // No component type - use bare fallback
        components[componentIdStr] = { lastUpdated: 0 };
      }
      componentsDefaulted++;
      continue;
    }

    // Component exists in backup - validate and migrate
    const componentType = curriculumData.getComponentType(componentId);
    if (!componentType) {
      // Component type unknown - initialize with default
      componentsDefaulted++;
      const initializer = componentInitializerMap.get("unknown");
      components[componentIdStr] = initializer
        ? initializer()
        : { lastUpdated: 0 };
      continue;
    }

    // Phase 1: Zod schema validation
    const progressSchema = progressSchemaMap.get(componentType);
    if (!progressSchema) {
      componentsDefaulted++;
      const initializer = componentInitializerMap.get(componentType);
      components[componentIdStr] = initializer
        ? initializer()
        : { lastUpdated: 0 };
      continue;
    }

    const zodResult = progressSchema.safeParse(savedProgress);
    if (!zodResult.success) {
      // Schema validation failed - re-initialize
      componentsDefaulted++;
      const initializer = componentInitializerMap.get(componentType);
      components[componentIdStr] = initializer
        ? initializer()
        : { lastUpdated: 0 };
      continue;
    }

    // Phase 2: Component-specific validation (if available)
    const validator = componentValidatorMap.get(componentType);
    if (validator) {
      // Get component config for validation
      const lessonId = curriculumData.getLessonIdForComponent(componentId);
      const lessonConfig = lessonId ? lessonConfigs.get(lessonId) : null;
      const componentConfig = lessonConfig?.components.find(
        (c) => c.id === componentId
      );

      if (componentConfig) {
        const validationResult = validator(zodResult.data, componentConfig);
        if (validationResult.defaultedRatio > 0) {
          // Some fields were defaulted
          componentsDefaulted++;
          components[componentIdStr] = validationResult.cleaned;
          continue;
        }
      }
    }

    // All validations passed
    components[componentIdStr] = zodResult.data;
    componentsRetained++;
  }

  const totalComponents = allComponentIds.length;
  const defaultedRatio =
    totalComponents > 0 ? componentsDefaulted / totalComponents : 0;

  return {
    data: { components },
    defaultedRatio,
    componentsRetained,
    componentsDefaulted,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Initialize all lessons and domains in curriculum with default incomplete values.
 *
 * Creates a complete structure with all curriculum entities initialized to their
 * default incomplete state. Used when creating fully defaulted result for
 * unparseable JSON or catastrophic recovery scenarios.
 *
 * @returns Object with lessonCompletions and domainCompletions fully initialized
 */
function initializeAllLessonsAndDomainsWithDefaults(): {
  lessonCompletions: Record<string, CompletionData>;
  domainCompletions: Record<string, CompletionData>;
} {
  const lessonCompletions: Record<string, CompletionData> = {};
  const domainCompletions: Record<string, CompletionData> = {};

  // Initialize all curriculum lessons as incomplete
  const allLessonIds = curriculumData.getAllLessonIds();
  for (const lessonId of allLessonIds) {
    lessonCompletions[lessonId.toString()] = {
      timeCompleted: null,
      lastUpdated: 0,
    };
  }

  // Initialize all curriculum domains as incomplete
  const allDomainIds = curriculumData.getAllDomainIds();
  for (const domainId of allDomainIds) {
    domainCompletions[domainId.toString()] = {
      timeCompleted: null,
      lastUpdated: 0,
    };
  }

  return { lessonCompletions, domainCompletions };
}

/**
 * Initialize all components in curriculum with default values.
 *
 * Used when creating fully defaulted result for unparseable JSON.
 *
 * @returns Record with default progress for every component
 */
function initializeAllComponentsWithDefaults(): Record<string, any> {
  const components: Record<string, any> = {};
  const allComponentIds = curriculumData.getAllComponentIds();

  for (const componentId of allComponentIds) {
    const componentIdStr = componentId.toString();
    const componentType = curriculumData.getComponentType(componentId);

    if (componentType) {
      const initializer = componentInitializerMap.get(componentType);
      components[componentIdStr] = initializer
        ? initializer()
        : { lastUpdated: 0 }; // Ultimate fallback only
    } else {
      // No component type - use bare fallback
      components[componentIdStr] = { lastUpdated: 0 };
    }
  }

  return components;
}

/**
 * Create fully defaulted result for catastrophic failures (unparseable JSON).
 *
 * Uses getDefaultSettings() and getDefaultOverallProgress() as single source
 * of truth for default values.
 *
 * @param expectedWebId - WebId that should be in backup
 * @param foundWebId - WebId found (null if unparseable)
 * @returns Recovery result with all sections defaulted
 */
function createFullyDefaultedResult(
  expectedWebId: string,
  foundWebId: string | null
): EnforcementResult {
  const allComponentIds = curriculumData.getAllComponentIds();
  const { lessonCompletions, domainCompletions } =
    initializeAllLessonsAndDomainsWithDefaults();

  // Get defaults from schema modules (single source of truth)
  const defaultSettings = getDefaultSettings();
  const defaultProgress = getDefaultOverallProgress();

  let bundle: PodStorageBundle = {
    metadata: {
      webId: "https://error.mera.invalid/unparseable-json", // Security: Unparseable = treat as mismatch
    },
    overallProgress: {
      ...defaultProgress,
      lessonCompletions,
      domainCompletions,
    },
    settings: defaultSettings,
    navigationState: {
      currentEntityId: 1, // Welcome screen for new users
      currentPage: 0,
      lastUpdated: 0,
    },
    combinedComponentProgress: {
      components: initializeAllComponentsWithDefaults(),
    },
  };

  // Validate the fully defaulted bundle
  try {
    bundle = PodStorageBundleSchema.parse(bundle);
  } catch (validationError) {
    // This should never happen - our defaults should always be valid
    console.error(
      "CRITICAL: Default bundle failed schema validation:",
      validationError
    );
    throw new Error(
      "Default bundle validation failed - this is a bug in progressIntegrity.ts"
    );
  }

  return {
    perfectlyValidInput: false, // Fully defaulted = not valid input
    bundle,
    recoveryMetrics: {
      metadata: { defaultedRatio: 1.0 },
      overallProgress: {
        lessonsDroppedRatio: 1.0,
        domainsDroppedRatio: 1.0,
        lessonsDroppedCount: 0, // Nothing to drop - fully defaulted
        domainsDroppedCount: 0, // Nothing to drop - fully defaulted
        corruptionDetected: false, // Fully defaulted = no corruption, just empty
        lessonsLostToCorruption: 0,
        domainsLostToCorruption: 0,
      },
      settings: { defaultedRatio: 1.0 },
      navigationState: { wasDefaulted: true },
      combinedComponentProgress: {
        defaultedRatio: 1.0,
        componentsRetained: 0,
        componentsDefaulted: allComponentIds.length,
      },
    },
    criticalFailures: {
      webIdMismatch: {
        expected: expectedWebId,
        found: foundWebId,
      },
    },
  };
}
