/**
 * @fileoverview Progress recovery and migration from arbitrary JSON to current schema
 * @module initialization/progressRecovery
 * 
 * Core responsibility: Transform potentially corrupted, outdated, or malformed backup data
 * into a valid PodStorageBundle that matches the current schema version.
 * 
 * Design principles:
 * - Never throw - always return valid bundle with metrics
 * - Best-effort extraction - salvage what's recognizable
 * - Honest reporting - defaultedRatio shows how much was lost
 * - Registry as truth - validate against current curriculum
 * 
 * Each section (metadata, overallProgress, settings, etc.) has different recovery
 * strategies based on importance and replaceability of the data.
 * 
 * VERSIONING STRATEGY:
 * When breaking schema changes occur, snapshot this entire file into migrations/vX.Y.Z/
 * along with the schemas it imports. This keeps each version's recovery logic simple
 * and explicit rather than trying to be generic across versions.
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
import {
  SettingsData,
  SettingsDataSchema
} from '../core/settingsSchema.js';
import {
  NavigationState,
  NavigationStateSchema
} from '../core/navigationSchema.js';
import {
  CombinedComponentProgress,
  CombinedComponentProgressSchema
} from '../core/combinedComponentProgressSchema.js';
import { CurriculumRegistry, progressSchemaMap, curriculumData } from '../registry/mera-registry.js';

/**
 * Result of extracting a single section with granular metrics
 */
interface ExtractionResult<T> {
  data: T;
  defaultedRatio: number;  // 0.0 = perfect extraction, 1.0 = fully defaulted
}

/**
 * Specialized result for overallProgress with dual metrics
 */
interface OverallProgressExtractionResult {
  data: OverallProgressData;
  lessonsRetainedRatio: number;  // Kept lessons / lessons in backup
  domainsRetainedRatio: number;  // Kept domains / domains in backup
}

/**
 * Complete recovery result with per-section metrics
 */
export interface RecoveryResult {
  bundle: PodStorageBundle;
  recoveryMetrics: {
    metadata: {
      defaultedRatio: number;
    };
    overallProgress: {
      lessonsRetainedRatio: number;
      domainsRetainedRatio: number;
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
 * how much data was salvaged vs defaulted.
 * 
 * @param rawJson - JSON string (potentially corrupted, old version, or malformed)
 * @param expectedWebId - WebId that must match for this backup to be valid
 * @returns Valid bundle + granular recovery metrics + critical failures
 */
export function migrateOrRestoreToLatest(
  rawJson: string,
  expectedWebId: string
): RecoveryResult {
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
  const componentProgressResult = extractCombinedComponentProgress(parsed);

  // Phase 3: Assemble valid bundle
  const bundle: PodStorageBundle = {
    metadata: metadataResult.data,
    overallProgress: overallProgressResult.data,
    settings: settingsResult.data,
    navigationState: navigationResult.data,
    combinedComponentProgress: componentProgressResult.data,
  };

  // Phase 4: Return with granular metrics
  return {
    bundle,
    recoveryMetrics: {
      metadata: {
        defaultedRatio: metadataResult.defaultedRatio,
      },
      overallProgress: {
        lessonsRetainedRatio: overallProgressResult.lessonsRetainedRatio,
        domainsRetainedRatio: overallProgressResult.domainsRetainedRatio,
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
 * CRITICAL: If webId doesn't match expectedWebId, this is a wrong-user backup
 * and should be rejected by orchestration layer.
 * 
 * @param parsed - Raw parsed JSON
 * @param expectedWebId - WebId that must match for valid backup
 * @returns Metadata + ratio of fields defaulted + critical failure flag
 */
function extractMetadata(
  parsed: any,
  expectedWebId: string
): ExtractionResult<PodMetadata> & { 
  webIDMismatch?: { expected: string; found: string | null } 
} {
  // Try Zod parse first (fast path)
  const zodResult = PodMetadataSchema.safeParse(parsed?.metadata);
  if (zodResult.success) {
    // Valid structure - check webId match
    if (zodResult.data.webId !== expectedWebId) {
      return {
        data: zodResult.data,
        defaultedRatio: 1.0, // webId is wrong, so 100% defaulted
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

  // Fast path failed - extract field by field
  const metadata: any = {};
  let totalFields = 1; // Currently only webId, will grow
  let defaultedFields = 0;
  let criticalFailure: { expected: string; found: string | null } | undefined;

  // Field 1: webId (required, must be valid URL and match expected)
  const webId = parsed?.metadata?.webId;
  const foundWebId = typeof webId === 'string' ? webId : null;
  
  if (typeof webId === 'string' && /^https?:\/\/.+/.test(webId)) {
    metadata.webId = webId;
    // Check if it matches expected
    if (webId !== expectedWebId) {
      criticalFailure = { expected: expectedWebId, found: webId };
    }
  } else {
    // Invalid or missing webId - use expected as fallback but mark as defaulted
    metadata.webId = expectedWebId;
    defaultedFields++;
    criticalFailure = { expected: expectedWebId, found: foundWebId };
  }

  // Future fields would be extracted here as schema grows
  // Each field increments totalFields and potentially defaultedFields

  return {
    data: metadata as PodMetadata,
    defaultedRatio: defaultedFields / totalFields,
    webIDMismatch: criticalFailure,
  };
}

/**
 * Extract overall progress with lesson/domain reconciliation.
 * 
 * Strategy: Reconcile completed lessons/domains against current curriculum registry.
 * Only keep completions for entities that still exist. New lessons automatically
 * appear as incomplete (they're just not in the record).
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
    // Still need to reconcile against registry even if structure is valid
    return reconcileOverallProgress(zodResult.data);
  }

  // Parse failed - extract what we can
  const candidate = parsed?.overallProgress || {};
  
  // Start with defaults
  const overallProgress: OverallProgressData = {
    lessonCompletions: {},
    domainsCompleted: [],
    currentStreak: 0,
    lastStreakCheck: 0,
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

  // Reconcile against registry
  return reconcileOverallProgress(overallProgress);
}

/**
 * Reconcile lesson completions and domains against current curriculum.
 * 
 * Filters out deleted lessons/domains, keeping only those that exist in registry.
 * Calculates how much progress was retained vs lost.
 * 
 * TODO: Extract this validation logic into a shared utility (e.g., CurriculumRegistry method)
 * to ensure consistency between recovery-time and mutation-time validation. Currently
 * this logic duplicates the validation in OverallProgressManager.markLessonComplete().
 * Any changes to validation rules must be synchronized between both locations.
 * 
 * @param progress - Progress data to reconcile
 * @returns Reconciled progress + retained ratios
 */
function reconcileOverallProgress(
  progress: OverallProgressData
): OverallProgressExtractionResult {
  // Reconcile lessons
  const originalLessonCount = Object.keys(progress.lessonCompletions).length;
  const reconciledLessons: Record<string, number> = {};
  let keptLessonCount = 0;

  for (const [lessonId, timestamp] of Object.entries(progress.lessonCompletions)) {
    const lessonIdNum = parseInt(lessonId, 10);
    if (!isNaN(lessonIdNum) && curriculumData.hasLesson(lessonIdNum)) {
      reconciledLessons[lessonId] = timestamp;
      keptLessonCount++;
    }
  }

  // Reconcile domains
  const originalDomainCount = progress.domainsCompleted.length;
  const reconciledDomains: number[] = [];
  let keptDomainCount = 0;

  for (const domainId of progress.domainsCompleted) {
    // Note: Would need curriculumData.hasDomain() method - assuming exists or will be added
    // For now, keep all domains (adjust when registry has domain validation)
    reconciledDomains.push(domainId);
    keptDomainCount++;
  }

  return {
    data: {
      lessonCompletions: reconciledLessons,
      domainsCompleted: reconciledDomains,
      currentStreak: progress.currentStreak,
      lastStreakCheck: progress.lastStreakCheck,
    },
    lessonsRetainedRatio: originalLessonCount > 0 ? keptLessonCount / originalLessonCount : 1.0,
    domainsRetainedRatio: originalDomainCount > 0 ? keptDomainCount / originalDomainCount : 1.0,
  };
}

/**
 * Extract settings with field-level defaulting.
 * 
 * Strategy: Settings are user preferences - try to salvage each field independently.
 * If a field is invalid, default it but keep the rest.
 * 
 * @param parsed - Raw parsed JSON
 * @returns Settings + ratio of fields defaulted
 */
function extractSettings(parsed: any): ExtractionResult<SettingsData> {
  // Try Zod parse first
  const zodResult = SettingsDataSchema.safeParse(parsed?.settings);
  if (zodResult.success) {
    return {
      data: zodResult.data,
      defaultedRatio: 0.0,
    };
  }

  // Parse failed - extract field by field with defaults
  const candidate = parsed?.settings || {};
  const settings: any = {};
  let totalFields = 11; // Current number of settings fields
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
  if (['small', 'medium', 'large'].includes(candidate.fontSize)) {
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
 * Extract navigation state with binary default strategy.
 * 
 * Strategy: Navigation is ephemeral (just where user left off). Either use it
 * all or default it all - not worth granular tracking.
 * 
 * @param parsed - Raw parsed JSON
 * @returns Navigation state + whether it was defaulted
 */
function extractNavigationState(
  parsed: any
): ExtractionResult<NavigationState> & { wasDefaulted: boolean } {
  // Try Zod parse
  const zodResult = NavigationStateSchema.safeParse(parsed?.navigationState);
  if (zodResult.success) {
    return {
      data: zodResult.data,
      defaultedRatio: 0.0,
      wasDefaulted: false,
    };
  }

  // Parse failed - return defaults
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
 * Extract combined component progress with binary per-component strategy.
 * 
 * Strategy: For each component in backup, try to validate against current schema
 * for that component type. If validation succeeds, keep it. If it fails, default it.
 * 
 * Component worth 2-3 minutes max - not worth field-level recovery.
 * 
 * @param parsed - Raw parsed JSON
 * @returns Component progress + per-component metrics
 */
function extractCombinedComponentProgress(
  parsed: any
): ExtractionResult<CombinedComponentProgress> & { 
  componentsRetained: number; 
  componentsDefaulted: number;
} {
  const candidate = parsed?.combinedComponentProgress;

  // Extract top-level fields
  const lessonId = typeof candidate?.lessonId === 'string' ? candidate.lessonId : '0';
  const lastUpdated = typeof candidate?.lastUpdated === 'number' ? candidate.lastUpdated : Date.now();

  // Extract overallProgress (nested within combinedComponentProgress)
  let overallProgress: OverallProgressData;
  const overallProgressZod = OverallProgressDataSchema.safeParse(candidate?.overallProgress);
  if (overallProgressZod.success) {
    overallProgress = overallProgressZod.data;
  } else {
    // Default overallProgress
    overallProgress = {
      lessonCompletions: {},
      domainsCompleted: [],
      currentStreak: 0,
      lastStreakCheck: 0,
    };
  }

  // Process components
  const components: Record<string, any> = {};
  let totalComponents = 0;
  let componentsRetained = 0;
  let componentsDefaulted = 0;

  const candidateComponents = candidate?.components;
  if (typeof candidateComponents === 'object' && candidateComponents !== null) {
    for (const [componentIdStr, savedProgress] of Object.entries(candidateComponents)) {
      totalComponents++;
      const componentId = parseInt(componentIdStr, 10);

      // Does component exist in current curriculum?
      if (isNaN(componentId) || !curriculumData.hasComponent(componentId)) {
        componentsDefaulted++;
        continue; // Skip deleted/invalid components
      }

      // Get component type and schema
      const componentType = curriculumData.getComponentType(componentId);
      if (!componentType) {
        componentsDefaulted++;
        continue;
      }

      const progressSchema = progressSchemaMap.get(componentType);
      if (!progressSchema) {
        componentsDefaulted++;
        continue;
      }

      // Try to validate progress against schema
      const progressResult = progressSchema.safeParse(savedProgress);
      if (progressResult.success) {
        // Perfect - keep it
        components[componentIdStr] = progressResult.data;
        componentsRetained++;
      } else {
        // Schema mismatch - default this component
        componentsDefaulted++;
      }
    }
  }

  return {
    data: {
      lessonId,
      lastUpdated,
      components,
      overallProgress,
    },
    defaultedRatio: totalComponents > 0 ? componentsDefaulted / totalComponents : 1.0, // FIXED: No components = fully defaulted
    componentsRetained,
    componentsDefaulted,
  };
}

/**
 * Create fully defaulted result for catastrophic failures (unparseable JSON).
 * 
 * @param expectedWebId - WebId that should be in the backup
 * @param foundWebId - WebId that was found (null if unparseable)
 * @returns Recovery result with all sections defaulted
 */
function createFullyDefaultedResult(
  expectedWebId: string,
  foundWebId: string | null
): RecoveryResult {
  return {
    bundle: {
      metadata: {
        webId: expectedWebId, // Use expected webId as fallback
      },
      overallProgress: {
        lessonCompletions: {},
        domainsCompleted: [],
        currentStreak: 0,
        lastStreakCheck: 0,
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
        lessonId: '0',
        lastUpdated: Date.now(),
        components: {},
        overallProgress: {
          lessonCompletions: {},
          domainsCompleted: [],
          currentStreak: 0,
          lastStreakCheck: 0,
        },
      },
    },
    recoveryMetrics: {
      metadata: { defaultedRatio: 1.0 },
      overallProgress: { lessonsRetainedRatio: 0.0, domainsRetainedRatio: 0.0 },
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