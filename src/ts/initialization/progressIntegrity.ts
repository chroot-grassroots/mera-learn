/**
 * @fileoverview Progress integrity checking, recovery, and migration
 * @module initialization/progressIntegrity
 * 
 * Transforms potentially corrupted, outdated, or malformed backup data into a valid
 * PodStorageBundle matching current schema version. Handles:
 * 
 * - Corruption detection via monotonic counters
 * - Migration from old curriculum versions to current
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
 * before calling migrateOrRestoreToLatest().
 * 
 * VERSIONING STRATEGY:
 * For breaking schema changes, snapshot this file into migrations/vX.Y.Z/ with its
 * imported schemas. This keeps version-specific recovery logic simple and explicit.
 */

import { z } from 'zod';
import { 
  PodStorageBundle, 
  PodMetadata,
  PodMetadataSchema 
} from '../persistence/podStorageSchema.js';
import {
  OverallProgressData,
  OverallProgressDataSchema
} from '../core/overallProgressSchema.js';
import { reconcileAgainstCurriculum } from '../core/overallProgressSchema.js';
import {
  SettingsData,
  SettingsDataSchema
} from '../core/settingsSchema.js';
import {
  NavigationState,
  NavigationStateSchema
} from '../core/navigationSchema.js';
import { validateNavigationEntity } from '../core/navigationSchema.js';
import {
  CombinedComponentProgress,
  CombinedComponentProgressSchema
} from '../core/combinedComponentProgressSchema.js';
import { 
  CurriculumRegistry, 
  progressSchemaMap,
  componentValidatorMap,
  componentInitializerMap,
  curriculumData 
} from '../registry/mera-registry.js';
import type { Lesson } from '../core/lessonSchemas.js';

/**
 * Parsed lesson data with components for validation
 */
export interface ParsedLessonData {
  metadata: Lesson['metadata'];
  pages: Lesson['pages'];
  components: Array<{
    id: number;
    type: string;
    [key: string]: any;
  }>;
}

/**
 * Result of extracting a section with quality metrics
 */
interface ExtractionResult<T> {
  data: T;
  defaultedRatio: number;  // 0.0 = perfect extraction, 1.0 = fully defaulted
}

/**
 * Specialized result for overallProgress with corruption detection
 */
interface OverallProgressExtractionResult {
  data: OverallProgressData;
  lessonsDefaultedRatio: number;  // 0.0 = all kept, 1.0 = all defaulted
  domainsDefaultedRatio: number;  // 0.0 = all kept, 1.0 = all defaulted
  corruptionDetected: boolean;    // Mismatch between counters and actual data
  lessonsLostToCorruption: number; // Lessons missing due to corruption
  domainsLostToCorruption: number; // Domains missing due to corruption
}

/**
 * Complete recovery result with per-section metrics
 */
export interface EnforcementResult {
  perfectlyValidInput: boolean;  // Top-level flag: true if input needed no fixes/defaults
  bundle: PodStorageBundle;
  recoveryMetrics: {
    metadata: {
      defaultedRatio: number;
    };
    overallProgress: {
      lessonsDefaultedRatio: number;
      domainsDefaultedRatio: number;
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

/**
 * Main entry point: Migrate/restore arbitrary JSON to current schema version.
 * 
 * NEVER THROWS - always returns valid bundle with honest metrics about
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
      'progressRecovery requires parsed lesson configs. ' +
      'Ensure YAML parsing phase completes before recovery phase.'
    );
  }

  // Phase 1: Parse JSON string
  let parsed: any;
  try {
    parsed = JSON.parse(rawJson);
  } catch (e) {
    // Unparseable JSON - return fully defaulted bundle
    console.warn('⚠️ JSON parse failed, returning fully defaulted bundle');
    return createFullyDefaultedResult(expectedWebId, null);
  }

  // Phase 2: Extract each section independently using current schemas
  const metadataResult = extractMetadata(parsed, expectedWebId);
  const overallProgressResult = extractOverallProgress(parsed);
  const settingsResult = extractSettings(parsed);
  const navigationResult = extractNavigationState(parsed);
  const componentProgressResult = extractCombinedComponentProgress(parsed, lessonConfigs);

  // Phase 3: Assemble valid bundle
  const bundle: PodStorageBundle = {
    metadata: metadataResult.data,
    overallProgress: overallProgressResult.data,
    settings: settingsResult.data,
    navigationState: navigationResult.data,
    combinedComponentProgress: componentProgressResult.data,
  };

  // Phase 4: Calculate if input was perfectly valid (needed no fixes)
  const hasCriticalFailures = metadataResult.webIDMismatch !== undefined;
  const perfectlyValidInput = 
    !hasCriticalFailures &&
    !overallProgressResult.corruptionDetected &&
    metadataResult.defaultedRatio === 0 &&
    overallProgressResult.lessonsDefaultedRatio === 0 &&
    overallProgressResult.domainsDefaultedRatio === 0 &&
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
        lessonsDefaultedRatio: overallProgressResult.lessonsDefaultedRatio,
        domainsDefaultedRatio: overallProgressResult.domainsDefaultedRatio,
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
    criticalFailures: metadataResult.webIDMismatch ? {
      webIdMismatch: metadataResult.webIDMismatch,
    } : {},
  };
}

/**
 * Extract metadata with field-level defaulting.
 * 
 * Strategy: Metadata is critical (webId must match or reject backup).
 * Try each field independently with validation.
 * 
 * CRITICAL: If webId doesn't match expectedWebId, orchestration layer
 * should reject this backup and try next one.
 * 
 * @param parsed - Raw parsed JSON
 * @param expectedWebId - WebId that must match
 * @returns Metadata + defaultedRatio + potential webID mismatch
 */
function extractMetadata(
  parsed: any,
  expectedWebId: string
): ExtractionResult<PodMetadata> & {
  webIDMismatch?: { expected: string; found: string | null };
} {
  // Try Zod parse first
  const zodResult = PodMetadataSchema.safeParse(parsed?.metadata);
  if (zodResult.success) {
    // Check webId match
    if (zodResult.data.webId !== expectedWebId) {
      return {
        data: { webId: expectedWebId },
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

  // Zod failed - try manual extraction
  const candidate = parsed?.metadata || {};
  const webId = typeof candidate.webId === 'string' ? candidate.webId : null;

  if (webId !== expectedWebId) {
    return {
      data: { webId: expectedWebId },
      defaultedRatio: 1.0,
      webIDMismatch: {
        expected: expectedWebId,
        found: webId,
      },
    };
  }

  return {
    data: { webId },
    defaultedRatio: 0.0,
  };
}

/**
 * Extract overall progress with registry reconciliation.
 * 
 * Strategy: Reconcile completed lessons/domains against current curriculum.
 * Only keep completions for entities that exist in registry. New lessons
 * appear as incomplete (not in record).
 * 
 * Uses shared validator from overallProgressSchema for consistency.
 * 
 * @param parsed - Raw parsed JSON
 * @returns OverallProgress + retained ratios
 */
function extractOverallProgress(
  parsed: any
): OverallProgressExtractionResult {
  // Try Zod parse first
  const zodResult = OverallProgressDataSchema.safeParse(parsed?.overallProgress);
  if (zodResult.success) {
    // Valid structure - still need registry reconciliation
    return reconcileOverallProgress(zodResult.data);
  }

  // Zod failed - extract what we can, then reconcile
  const candidate = parsed?.overallProgress || {};
  
  const overallProgress: OverallProgressData = {
    lessonCompletions: {},
    domainsCompleted: [],
    currentStreak: 0,
    lastStreakCheck: 0,
    totalLessonsEverCompleted: 0,
    totalDomainsEverCompleted: 0,
  };

  // Extract lessonCompletions
  if (typeof candidate.lessonCompletions === 'object' && candidate.lessonCompletions !== null) {
    overallProgress.lessonCompletions = candidate.lessonCompletions;
  }

  // Extract domainsCompleted
  if (Array.isArray(candidate.domainsCompleted)) {
    overallProgress.domainsCompleted = candidate.domainsCompleted;
  }

  // Extract currentStreak
  if (typeof candidate.currentStreak === 'number' && candidate.currentStreak >= 0) {
    overallProgress.currentStreak = candidate.currentStreak;
  }

  // Extract lastStreakCheck
  if (typeof candidate.lastStreakCheck === 'number' && candidate.lastStreakCheck >= 0) {
    overallProgress.lastStreakCheck = candidate.lastStreakCheck;
  }

  // Extract monotonic counters (for corruption detection)
  if (typeof candidate.totalLessonsEverCompleted === 'number' && candidate.totalLessonsEverCompleted >= 0) {
    overallProgress.totalLessonsEverCompleted = candidate.totalLessonsEverCompleted;
  }

  if (typeof candidate.totalDomainsEverCompleted === 'number' && candidate.totalDomainsEverCompleted >= 0) {
    overallProgress.totalDomainsEverCompleted = candidate.totalDomainsEverCompleted;
  }

  return reconcileOverallProgress(overallProgress);
}

/**
 * Reconcile lesson completions and domains against current curriculum.
 * 
 * First detects corruption by comparing monotonic counters to actual data.
 * Then filters out deleted lessons/domains using shared validator from schema module.
 * Finally calculates defaulted ratios (0.0 = all kept, 1.0 = all defaulted).
 * 
 * @param progress - Progress data to reconcile
 * @returns Reconciled progress + corruption detection + defaulted ratios
 */
function reconcileOverallProgress(
  progress: OverallProgressData
): OverallProgressExtractionResult {
  // STEP 1: Detect corruption BEFORE curriculum reconciliation
  // Monotonic counters should always match actual data count
  const claimedLessons = progress.totalLessonsEverCompleted ?? 0;
  const claimedDomains = progress.totalDomainsEverCompleted ?? 0;
  const actualLessons = Object.keys(progress.lessonCompletions).length;
  const actualDomains = progress.domainsCompleted.length;
  
  const lessonsLostToCorruption = Math.max(0, claimedLessons - actualLessons);
  const domainsLostToCorruption = Math.max(0, claimedDomains - actualDomains);
  const corruptionDetected = lessonsLostToCorruption > 0 || domainsLostToCorruption > 0;

  // STEP 2: Reconcile against curriculum (filters out deleted content)
  const reconciled = reconcileAgainstCurriculum(progress, curriculumData);
  
  // STEP 3: Calculate defaulted ratios from curriculum reconciliation
  // Note: This is SEPARATE from corruption detection
  // Corruption = data loss from backup corruption
  // Defaulting = valid data for deleted curriculum content
  const originalLessonCount = actualLessons;  // Use actual, not claimed
  const originalDomainCount = actualDomains;
  
  return {
    data: reconciled.cleaned,
    lessonsDefaultedRatio: originalLessonCount > 0 
      ? reconciled.lessonsDropped / originalLessonCount 
      : 0.0,  // No lessons = nothing to default
    domainsDefaultedRatio: originalDomainCount > 0 
      ? reconciled.domainsDropped / originalDomainCount 
      : 0.0,  // No domains = nothing to default
    corruptionDetected,
    lessonsLostToCorruption,
    domainsLostToCorruption,
  };
}

/**
 * Extract settings with field-level defaulting.
 * 
 * Strategy: Settings are user preferences - salvage each field independently.
 * If field invalid, default it but keep rest.
 * 
 * @param parsed - Raw parsed JSON
 * @returns Settings + defaultedRatio
 */
function extractSettings(
  parsed: any
): ExtractionResult<SettingsData> {
  // Try Zod parse first
  const zodResult = SettingsDataSchema.safeParse(parsed?.settings);
  if (zodResult.success) {
    return {
      data: zodResult.data,
      defaultedRatio: 0.0,
    };
  }

  // Zod failed - field-level extraction
  const candidate = parsed?.settings || {};
  const settings: Partial<SettingsData> = {};
  const totalFields = 11;
  let defaultedFields = 0;

  // Field 1: weekStartDay
  if (['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].includes(candidate.weekStartDay)) {
    settings.weekStartDay = candidate.weekStartDay;
  } else {
    settings.weekStartDay = 'monday';
    defaultedFields++;
  }

  // Field 2: weekStartTimeUTC
  if (typeof candidate.weekStartTimeUTC === 'string' && /^\d{2}:\d{2}$/.test(candidate.weekStartTimeUTC)) {
    settings.weekStartTimeUTC = candidate.weekStartTimeUTC;
  } else {
    settings.weekStartTimeUTC = '00:00';
    defaultedFields++;
  }

  // Field 3: theme
  if (['light', 'dark', 'auto'].includes(candidate.theme)) {
    settings.theme = candidate.theme;
  } else {
    settings.theme = 'auto';
    defaultedFields++;
  }

  // Field 4: learningPace
  if (['relaxed', 'standard', 'intensive'].includes(candidate.learningPace)) {
    settings.learningPace = candidate.learningPace;
  } else {
    settings.learningPace = 'standard';
    defaultedFields++;
  }

  // Field 5: optOutDailyPing
  if (typeof candidate.optOutDailyPing === 'boolean') {
    settings.optOutDailyPing = candidate.optOutDailyPing;
  } else {
    settings.optOutDailyPing = false;
    defaultedFields++;
  }

  // Field 6: optOutErrorPing
  if (typeof candidate.optOutErrorPing === 'boolean') {
    settings.optOutErrorPing = candidate.optOutErrorPing;
  } else {
    settings.optOutErrorPing = false;
    defaultedFields++;
  }

  // Field 7: fontSize
  if (['small', 'medium', 'large', 'x-large'].includes(candidate.fontSize)) {
    settings.fontSize = candidate.fontSize;
  } else {
    settings.fontSize = 'medium';
    defaultedFields++;
  }

  // Field 8: highContrast
  if (typeof candidate.highContrast === 'boolean') {
    settings.highContrast = candidate.highContrast;
  } else {
    settings.highContrast = false;
    defaultedFields++;
  }

  // Field 9: reducedMotion
  if (typeof candidate.reducedMotion === 'boolean') {
    settings.reducedMotion = candidate.reducedMotion;
  } else {
    settings.reducedMotion = false;
    defaultedFields++;
  }

  // Field 10: focusIndicatorStyle
  if (['default', 'high-visibility', 'outline'].includes(candidate.focusIndicatorStyle)) {
    settings.focusIndicatorStyle = candidate.focusIndicatorStyle;
  } else {
    settings.focusIndicatorStyle = 'default';
    defaultedFields++;
  }

  // Field 11: audioEnabled
  if (typeof candidate.audioEnabled === 'boolean') {
    settings.audioEnabled = candidate.audioEnabled;
  } else {
    settings.audioEnabled = true;
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
    data: {
      currentEntityId: 0,
      currentPage: 0,
      lastUpdated: Date.now(),
    },
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
  const savedComponents = typeof candidateComponents === 'object' && candidateComponents !== null
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
        if (initializer) {
          components[componentIdStr] = initializer();
        } else {
          // No initializer registered - use empty object
          components[componentIdStr] = {};
        }
      }
      componentsDefaulted++;
      continue;
    }

    // Component exists in backup - validate it
    const componentType = curriculumData.getComponentType(componentId);
    if (!componentType) {
      // Component type unknown - initialize with default
      componentsDefaulted++;
      const initializer = componentInitializerMap.get('unknown');
      components[componentIdStr] = initializer ? initializer() : {};
      continue;
    }

    // Phase 1: Zod schema validation
    const progressSchema = progressSchemaMap.get(componentType);
    if (!progressSchema) {
      componentsDefaulted++;
      const initializer = componentInitializerMap.get(componentType);
      components[componentIdStr] = initializer ? initializer() : {};
      continue;
    }

    const progressResult = progressSchema.safeParse(savedProgress);
    if (!progressResult.success) {
      componentsDefaulted++;
      const initializer = componentInitializerMap.get(componentType);
      components[componentIdStr] = initializer ? initializer() : {};
      continue;
    }

    // Phase 2: Config structure validation (if component has validator)
    const validator = componentValidatorMap.get(componentType);
    if (!validator) {
      // No validator registered - keep if schema passed
      components[componentIdStr] = progressResult.data;
      componentsRetained++;
      continue;
    }

    // Find component config in lesson data
    const lessonId = curriculumData.getLessonIdForComponent(componentId);
    if (!lessonId) {
      componentsDefaulted++;
      const initializer = componentInitializerMap.get(componentType);
      components[componentIdStr] = initializer ? initializer() : {};
      continue;
    }

    const lessonData = lessonConfigs.get(lessonId);
    if (!lessonData) {
      componentsDefaulted++;
      const initializer = componentInitializerMap.get(componentType);
      components[componentIdStr] = initializer ? initializer() : {};
      continue;
    }

    const componentConfig = lessonData.components.find(c => c.id === componentId);
    if (!componentConfig) {
      componentsDefaulted++;
      const initializer = componentInitializerMap.get(componentType);
      components[componentIdStr] = initializer ? initializer() : {};
      continue;
    }

    // Validate progress structure matches config
    const validationResult = validator(progressResult.data, componentConfig);
    
    if (validationResult.defaultedRatio === 0) {
      // Structure valid - keep it
      components[componentIdStr] = validationResult.cleaned;
      componentsRetained++;
    } else {
      // Structure mismatch (e.g., array length changed) - use default
      componentsDefaulted++;
      const initializer = componentInitializerMap.get(componentType);
      components[componentIdStr] = initializer ? initializer() : {};
    }
  }

  const totalComponents = allComponentIds.length;

  return {
    data: {
      components,
    },
    defaultedRatio: totalComponents > 0 ? componentsDefaulted / totalComponents : 0.0,
    componentsRetained,
    componentsDefaulted,
  };
}

/**
 * Initialize all components in curriculum with default progress.
 * 
 * Helper for creating fully defaulted bundles. Iterates through
 * entire curriculum and creates default progress for each component.
 * 
 * @returns Complete component mapping with all defaults
 */
function initializeAllComponentsWithDefaults(): Record<string, any> {
  const components: Record<string, any> = {};
  const allComponentIds = curriculumData.getAllComponentIds();
  
  for (const componentId of allComponentIds) {
    const componentIdStr = componentId.toString();
    const componentType = curriculumData.getComponentType(componentId);
    
    if (componentType) {
      const initializer = componentInitializerMap.get(componentType);
      components[componentIdStr] = initializer ? initializer() : {};
    } else {
      components[componentIdStr] = {};
    }
  }
  
  return components;
}

/**
 * Create fully defaulted result for catastrophic failures (unparseable JSON).
 * 
 * @param expectedWebId - WebId that should be in backup
 * @param foundWebId - WebId found (null if unparseable)
 * @returns Recovery result with all sections defaulted
 */
function createFullyDefaultedResult(
  expectedWebId: string,
  foundWebId: string | null
): EnforcementResult {
  return {
    perfectlyValidInput: false,  // Fully defaulted = not valid input
    bundle: {
      metadata: {
        webId: expectedWebId,
      },
      overallProgress: {
        lessonCompletions: {},
        domainsCompleted: [],
        currentStreak: 0,
        lastStreakCheck: 0,
        totalLessonsEverCompleted: 0,
        totalDomainsEverCompleted: 0,
      },
      settings: {
        weekStartDay: 'monday',
        weekStartTimeUTC: '00:00',
        theme: 'auto',
        learningPace: 'standard',
        optOutDailyPing: false,
        optOutErrorPing: false,
        fontSize: 'medium',
        highContrast: false,
        reducedMotion: false,
        focusIndicatorStyle: 'default',
        audioEnabled: true,
      },
      navigationState: {
        currentEntityId: 0,
        currentPage: 0,
        lastUpdated: Date.now(),
      },
      combinedComponentProgress: {
        components: initializeAllComponentsWithDefaults(),
      },
    },
    recoveryMetrics: {
      metadata: { defaultedRatio: 1.0 },
      overallProgress: { 
        lessonsDefaultedRatio: 1.0, 
        domainsDefaultedRatio: 1.0,
        corruptionDetected: false,  // Fully defaulted = no corruption, just empty
        lessonsLostToCorruption: 0,
        domainsLostToCorruption: 0,
      },
      settings: { defaultedRatio: 1.0 },
      navigationState: { wasDefaulted: true },
      combinedComponentProgress: { 
        defaultedRatio: 1.0, 
        componentsRetained: 0, 
        componentsDefaulted: 0 
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