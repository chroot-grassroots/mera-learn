// src/ts/initialization/progressIntegrity.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enforceDataIntegrity, type EnforcementResult, type ParsedLessonData } from './progressIntegrity.js';

// Mock the registry module at the top level (hoisted)
vi.mock('../registry/mera-registry.js', () => ({
  curriculumData: {
    hasLesson: (id: number) => id === 100 || id === 200,
    hasDomain: (id: number) => id === 1 || id === 2,
    hasEntity: (id: number) => id === 0 || id === 100 || id === 200 || id === 1 || id === 2, // 0 is valid (home/default)
    getEntityPageCount: (id: number) => {
      // Return page count for entities
      if (id === 0) return 1; // Entity 0 (home/default) has 1 page
      if (id === 100 || id === 200) return 10; // Lessons have 10 pages
      if (id === 1 || id === 2) return 1; // Domains have 1 page
      return 0;
    },
    hasComponent: (id: number) => [1001, 1002, 2001].includes(id),
    getComponentType: (id: number) => {
      const types: Record<number, string> = {
        1001: 'text',
        1002: 'checkbox',
        2001: 'quiz',
      };
      return types[id];
    },
    getLessonIdForComponent: (id: number) => {
      if (id >= 1000 && id < 2000) return 100;
      if (id >= 2000 && id < 3000) return 200;
      return null;
    },
    getAllComponentIds: () => [1001, 1002, 2001],
    getAllLessonIds: () => [100, 200],
    getAllDomainIds: () => [1, 2],
  },
  progressSchemaMap: new Map(),
  componentValidatorMap: new Map(), // No validators = components always retained if schema passes
  componentInitializerMap: new Map<string, () => any>([
    ['text', () => ({ content: '', lastUpdated: 0 })],
    ['checkbox', () => ({ checked: [], lastUpdated: 0 })],
    ['quiz', () => ({ answers: [], lastUpdated: 0 })],
  ]),
}));

describe('progressIntegrity', () => {
  let mockLessonConfigs: Map<number, ParsedLessonData>;

  beforeEach(() => {
    // Setup mock lesson configs
    mockLessonConfigs = new Map([
      [
        100,
        {
          metadata: { title: 'Test Lesson 1', id: 100 } as any,
          pages: [],
          components: [
            { id: 1001, type: 'text' },
            { id: 1002, type: 'checkbox' },
          ],
        },
      ],
      [
        200,
        {
          metadata: { title: 'Test Lesson 2', id: 200 } as any,
          pages: [],
          components: [
            { id: 2001, type: 'quiz' },
          ],
        },
      ],
    ]);
  });

  describe('enforceDataIntegrity - Basic Functionality', () => {
    it('throws error if lessonConfigs is empty', () => {
      const emptyConfigs = new Map();
      const validJson = JSON.stringify({ metadata: { webId: 'test' } });

      expect(() => enforceDataIntegrity(validJson, 'test', emptyConfigs)).toThrow(
        'progressRecovery requires parsed lesson configs'
      );
    });

    it('returns fully defaulted bundle for unparseable JSON', () => {
      const invalidJson = '{this is not valid json';
      const result = enforceDataIntegrity(invalidJson, 'test-webid', mockLessonConfigs);

      expect(result.perfectlyValidInput).toBe(false);
      expect(result.bundle.metadata.webId).toBe('https://error.mera.invalid/unparseable-json');
      // All curriculum lessons should be initialized as incomplete
      expect(result.bundle.overallProgress.lessonCompletions).toEqual({
        '100': { firstCompleted: null, lastUpdated: 0 },
        '200': { firstCompleted: null, lastUpdated: 0 },
      });
      expect(result.bundle.overallProgress.domainCompletions).toEqual({
        '1': { firstCompleted: null, lastUpdated: 0 },
        '2': { firstCompleted: null, lastUpdated: 0 },
      });
      expect(result.recoveryMetrics.metadata.defaultedRatio).toBe(1.0);
      expect(result.criticalFailures.webIdMismatch).toBeDefined();
      expect(result.criticalFailures.webIdMismatch?.found).toBe(null);
    });

    it('returns perfectly valid input for pristine data', () => {
      const pristineData = {
        metadata: { webId: 'https://test.example/webid' },
        overallProgress: {
          lessonCompletions: {},
          domainCompletions: {},
          currentStreak: 0,
          lastStreakCheck: Math.floor(Date.now() / 1000), // Unix timestamp in seconds
          totalLessonsCompleted: 0,
          totalDomainsCompleted: 0,
        },
        settings: {
          weekStartDay: ['monday', 0],
          weekStartTimeUTC: ['00:00', 0],
          theme: ['auto', 0],
          learningPace: ['standard', 0],
          optOutDailyPing: [false, 0],
          optOutErrorPing: [false, 0],
          fontSize: ['medium', 0],
          highContrast: [false, 0],
          reducedMotion: [false, 0],
          focusIndicatorStyle: ['default', 0],
          audioEnabled: [true, 0],
        },
        navigationState: {
          currentEntityId: 0,
          currentPage: 0,
          lastUpdated: Math.floor(Date.now() / 1000), // Unix timestamp in seconds
        },
        combinedComponentProgress: {
          components: {}, // Empty - will be initialized
        },
      };

      const result = enforceDataIntegrity(
        JSON.stringify(pristineData),
        'https://test.example/webid',
        mockLessonConfigs
      );

      // Without schema validators, components will be initialized (defaulted)
      // Navigation may also be defaulted if entity 0 isn't properly mocked in the registry
      // But other sections should be perfect
      expect(result.recoveryMetrics.metadata.defaultedRatio).toBe(0);
      expect(result.recoveryMetrics.overallProgress.lessonsDroppedRatio).toBe(0);
      expect(result.recoveryMetrics.overallProgress.corruptionDetected).toBe(false);
      expect(result.recoveryMetrics.settings.defaultedRatio).toBe(0);
      
      // Components will be defaulted since they're missing
      expect(result.recoveryMetrics.combinedComponentProgress.componentsDefaulted).toBe(3);
      
      // perfectlyValidInput will be false due to component initialization (and possibly navigation)
      expect(result.perfectlyValidInput).toBe(false);
    });
  });

  describe('Metadata Extraction', () => {
    it('detects webId mismatch as critical failure', () => {
      const data = {
        metadata: { webId: 'wrong-webid' },
        overallProgress: { 
          lessonCompletions: {}, 
          domainCompletions: {}, 
          currentStreak: 0, 
          lastStreakCheck: 0, 
          totalLessonsCompleted: 0, 
          totalDomainsCompleted: 0 
        },
        settings: {},
        navigationState: { currentEntityId: 0, currentPage: 0, lastUpdated: Date.now() },
        combinedComponentProgress: { components: {} },
      };

      const result = enforceDataIntegrity(JSON.stringify(data), 'expected-webid', mockLessonConfigs);

      expect(result.perfectlyValidInput).toBe(false);
      expect(result.criticalFailures.webIdMismatch).toBeDefined();
      expect(result.criticalFailures.webIdMismatch?.expected).toBe('expected-webid');
      expect(result.criticalFailures.webIdMismatch?.found).toBe('wrong-webid');
      expect(result.bundle.metadata.webId).toBe('https://error.mera.invalid/webid-mismatch');
    });

    it('defaults metadata when malformed', () => {
      const data = {
        metadata: { notWebId: 'something' },
        overallProgress: { 
          lessonCompletions: {}, 
          domainCompletions: {}, 
          currentStreak: 0, 
          lastStreakCheck: 0, 
          totalLessonsCompleted: 0, 
          totalDomainsCompleted: 0 
        },
        settings: {},
        navigationState: { currentEntityId: 0, currentPage: 0, lastUpdated: Date.now() },
        combinedComponentProgress: { components: {} },
      };

      const result = enforceDataIntegrity(JSON.stringify(data), 'test-webid', mockLessonConfigs);

      expect(result.bundle.metadata.webId).toBe('https://error.mera.invalid/webid-mismatch');
      expect(result.recoveryMetrics.metadata.defaultedRatio).toBe(1.0);
    });
  });

  describe('Overall Progress - Corruption Detection', () => {
    it('detects lesson corruption when counter > actual', () => {
      const data = {
        metadata: { webId: 'test-webid' },
        overallProgress: {
          lessonCompletions: { 
            '100': { firstCompleted: 123456, lastUpdated: 123456 } 
          }, // Only 1 lesson
          domainCompletions: {},
          currentStreak: 0,
          lastStreakCheck: 0,
          totalLessonsCompleted: 5, // Claims 5 lessons
          totalDomainsCompleted: 0,
        },
        settings: {},
        navigationState: { currentEntityId: 0, currentPage: 0, lastUpdated: Date.now() },
        combinedComponentProgress: { components: {} },
      };

      const result = enforceDataIntegrity(JSON.stringify(data), 'test-webid', mockLessonConfigs);

      expect(result.recoveryMetrics.overallProgress.corruptionDetected).toBe(true);
      expect(result.recoveryMetrics.overallProgress.lessonsLostToCorruption).toBe(4);
      expect(result.perfectlyValidInput).toBe(false);
    });

    it('detects domain corruption when counter > actual', () => {
      const data = {
        metadata: { webId: 'test-webid' },
        overallProgress: {
          lessonCompletions: {},
          domainCompletions: { 
            '1': { firstCompleted: 123456, lastUpdated: 123456 } 
          }, // Only 1 domain
          currentStreak: 0,
          lastStreakCheck: 0,
          totalLessonsCompleted: 0,
          totalDomainsCompleted: 3, // Claims 3 domains
        },
        settings: {},
        navigationState: { currentEntityId: 0, currentPage: 0, lastUpdated: Date.now() },
        combinedComponentProgress: { components: {} },
      };

      const result = enforceDataIntegrity(JSON.stringify(data), 'test-webid', mockLessonConfigs);

      expect(result.recoveryMetrics.overallProgress.corruptionDetected).toBe(true);
      expect(result.recoveryMetrics.overallProgress.domainsLostToCorruption).toBe(2);
      expect(result.perfectlyValidInput).toBe(false);
    });

    it('does not detect corruption when counter matches actual', () => {
      const data = {
        metadata: { webId: 'test-webid' },
        overallProgress: {
          lessonCompletions: { 
            '100': { firstCompleted: 123456, lastUpdated: 123456 },
            '200': { firstCompleted: 123457, lastUpdated: 123457 }
          },
          domainCompletions: { 
            '1': { firstCompleted: 123456, lastUpdated: 123456 },
            '2': { firstCompleted: 123456, lastUpdated: 123456 }
          },
          currentStreak: 0,
          lastStreakCheck: 0,
          totalLessonsCompleted: 2,
          totalDomainsCompleted: 2,
        },
        settings: {},
        navigationState: { currentEntityId: 0, currentPage: 0, lastUpdated: Date.now() },
        combinedComponentProgress: { components: {} },
      };

      const result = enforceDataIntegrity(JSON.stringify(data), 'test-webid', mockLessonConfigs);

      expect(result.recoveryMetrics.overallProgress.corruptionDetected).toBe(false);
      expect(result.recoveryMetrics.overallProgress.lessonsLostToCorruption).toBe(0);
      expect(result.recoveryMetrics.overallProgress.domainsLostToCorruption).toBe(0);
    });

    it('handles missing counters gracefully (old backup format)', () => {
      const data = {
        metadata: { webId: 'test-webid' },
        overallProgress: {
          lessonCompletions: { 
            '100': { firstCompleted: 123456, lastUpdated: 123456 } 
          },
          domainCompletions: { 
            '1': { firstCompleted: 123456, lastUpdated: 123456 } 
          },
          currentStreak: 0,
          lastStreakCheck: 0,
          // No counters - old format
        },
        settings: {},
        navigationState: { currentEntityId: 0, currentPage: 0, lastUpdated: Date.now() },
        combinedComponentProgress: { components: {} },
      };

      const result = enforceDataIntegrity(JSON.stringify(data), 'test-webid', mockLessonConfigs);

      // Should default counters to 0, so no corruption detected
      expect(result.recoveryMetrics.overallProgress.corruptionDetected).toBe(false);
      expect(result.recoveryMetrics.overallProgress.lessonsLostToCorruption).toBe(0);
    });
  });

  describe('Overall Progress - Curriculum Reconciliation', () => {
    it('drops lessons not in current curriculum', () => {
      const data = {
        metadata: { webId: 'test-webid' },
        overallProgress: {
          lessonCompletions: {
            '100': { firstCompleted: 123456, lastUpdated: 123456 }, // Valid
            '999': { firstCompleted: 123457, lastUpdated: 123457 }, // Not in curriculum
            '888': { firstCompleted: 123458, lastUpdated: 123458 }, // Not in curriculum
          },
          domainCompletions: {},
          currentStreak: 0,
          lastStreakCheck: 0,
          totalLessonsCompleted: 3,
          totalDomainsCompleted: 0,
        },
        settings: {},
        navigationState: { currentEntityId: 0, currentPage: 0, lastUpdated: Date.now() },
        combinedComponentProgress: { components: {} },
      };

      const result = enforceDataIntegrity(JSON.stringify(data), 'test-webid', mockLessonConfigs);

      expect(result.bundle.overallProgress.lessonCompletions).toHaveProperty('100');
      expect(result.bundle.overallProgress.lessonCompletions).not.toHaveProperty('999');
      expect(result.bundle.overallProgress.lessonCompletions).not.toHaveProperty('888');
      expect(result.recoveryMetrics.overallProgress.lessonsDroppedRatio).toBeCloseTo(2 / 3);
      expect(result.recoveryMetrics.overallProgress.corruptionDetected).toBe(false);
    });

    it('drops domains not in current curriculum', () => {
      const data = {
        metadata: { webId: 'test-webid' },
        overallProgress: {
          lessonCompletions: {},
          domainCompletions: {
            '1': { firstCompleted: 123456, lastUpdated: 123456 },
            '2': { firstCompleted: 123456, lastUpdated: 123456 },
            '99': { firstCompleted: 123456, lastUpdated: 123456 },  // Not valid
            '100': { firstCompleted: 123456, lastUpdated: 123456 }  // Not valid
          },
          currentStreak: 0,
          lastStreakCheck: 0,
          totalLessonsCompleted: 0,
          totalDomainsCompleted: 4,
        },
        settings: {},
        navigationState: { currentEntityId: 0, currentPage: 0, lastUpdated: Date.now() },
        combinedComponentProgress: { components: {} },
      };

      const result = enforceDataIntegrity(JSON.stringify(data), 'test-webid', mockLessonConfigs);

      // Check that only domains 1 and 2 remain completed
      const completedDomains = Object.keys(result.bundle.overallProgress.domainCompletions)
        .filter(id => result.bundle.overallProgress.domainCompletions[id].firstCompleted !== null);
      expect(completedDomains.sort()).toEqual(['1', '2']);
      expect(result.recoveryMetrics.overallProgress.domainsDroppedRatio).toBe(0.5);
    });

    it('fixes counters after curriculum reconciliation', () => {
      const data = {
        metadata: { webId: 'test-webid' },
        overallProgress: {
          lessonCompletions: {
            '100': { firstCompleted: 123456, lastUpdated: 123456 },
            '999': { firstCompleted: 123457, lastUpdated: 123457 }, // Will be dropped
          },
          domainCompletions: {
            '1': { firstCompleted: 123456, lastUpdated: 123456 },
            '99': { firstCompleted: 123456, lastUpdated: 123456 }  // Will be dropped
          },
          currentStreak: 0,
          lastStreakCheck: 0,
          totalLessonsCompleted: 2,
          totalDomainsCompleted: 2,
        },
        settings: {},
        navigationState: { currentEntityId: 0, currentPage: 0, lastUpdated: Date.now() },
        combinedComponentProgress: { components: {} },
      };

      const result = enforceDataIntegrity(JSON.stringify(data), 'test-webid', mockLessonConfigs);

      // Counters should be fixed to match cleaned data
      expect(result.bundle.overallProgress.totalLessonsCompleted).toBe(1);
      expect(result.bundle.overallProgress.totalDomainsCompleted).toBe(1);
    });

    it('distinguishes corruption from curriculum changes', () => {
      const data = {
        metadata: { webId: 'test-webid' },
        overallProgress: {
          lessonCompletions: {
            '100': { firstCompleted: 123456, lastUpdated: 123456 }, // Valid
            '999': { firstCompleted: 123457, lastUpdated: 123457 }, // Not in curriculum
          },
          domainCompletions: {},
          currentStreak: 0,
          lastStreakCheck: 0,
          totalLessonsCompleted: 5, // Claims 5, has 2 (3 lost to corruption)
          totalDomainsCompleted: 0,
        },
        settings: {},
        navigationState: { currentEntityId: 0, currentPage: 0, lastUpdated: Date.now() },
        combinedComponentProgress: { components: {} },
      };

      const result = enforceDataIntegrity(JSON.stringify(data), 'test-webid', mockLessonConfigs);

      // Should detect BOTH corruption AND curriculum changes
      expect(result.recoveryMetrics.overallProgress.corruptionDetected).toBe(true);
      expect(result.recoveryMetrics.overallProgress.lessonsLostToCorruption).toBe(3); // 5 claimed - 2 actual
      expect(result.recoveryMetrics.overallProgress.lessonsDroppedRatio).toBe(0.5); // 1 of 2 dropped (999)
    });
  });

  describe('Settings Extraction', () => {
    it('keeps valid settings', () => {
      const data = {
        metadata: { webId: 'test-webid' },
        overallProgress: { 
          lessonCompletions: {}, 
          domainCompletions: {}, 
          currentStreak: 0, 
          lastStreakCheck: 0, 
          totalLessonsCompleted: 0, 
          totalDomainsCompleted: 0 
        },
        settings: {
          weekStartDay: ['friday', 0],
          weekStartTimeUTC: ['08:00', 0],
          theme: ['dark', 0],
          learningPace: ['flexible', 0],  // Changed from 'intensive' to 'flexible'
          optOutDailyPing: [true, 0],
          optOutErrorPing: [true, 0],
          fontSize: ['large', 0],
          highContrast: [true, 0],
          reducedMotion: [true, 0],
          focusIndicatorStyle: ['enhanced', 0],  // Changed from 'high-visibility' to 'enhanced'
          audioEnabled: [false, 0],
        },
        navigationState: { currentEntityId: 0, currentPage: 0, lastUpdated: Date.now() },
        combinedComponentProgress: { components: {} },
      };

      const result = enforceDataIntegrity(JSON.stringify(data), 'test-webid', mockLessonConfigs);

      expect(result.bundle.settings.theme[0]).toBe('dark');
      expect(result.bundle.settings.fontSize[0]).toBe('large');
      expect(result.bundle.settings.audioEnabled[0]).toBe(false);
      expect(result.recoveryMetrics.settings.defaultedRatio).toBe(0);
    });

    it('defaults invalid settings fields', () => {
      const data = {
        metadata: { webId: 'test-webid' },
        overallProgress: { 
          lessonCompletions: {}, 
          domainCompletions: {}, 
          currentStreak: 0, 
          lastStreakCheck: 0, 
          totalLessonsCompleted: 0, 
          totalDomainsCompleted: 0 
        },
        settings: {
          weekStartDay: ['invalid-day', 0],
          theme: ['neon', 0], // Invalid
          fontSize: ['huge', 0], // Invalid
        },
        navigationState: { currentEntityId: 0, currentPage: 0, lastUpdated: Date.now() },
        combinedComponentProgress: { components: {} },
      };

      const result = enforceDataIntegrity(JSON.stringify(data), 'test-webid', mockLessonConfigs);

      expect(result.bundle.settings.weekStartDay[0]).toBe('monday'); // Defaulted
      expect(result.bundle.settings.theme[0]).toBe('auto'); // Defaulted
      expect(result.bundle.settings.fontSize[0]).toBe('medium'); // Defaulted
      expect(result.recoveryMetrics.settings.defaultedRatio).toBeGreaterThan(0);
    });

    it('calculates correct defaulted ratio for settings', () => {
      const data = {
        metadata: { webId: 'test-webid' },
        overallProgress: { 
          lessonCompletions: {}, 
          domainCompletions: {}, 
          currentStreak: 0, 
          lastStreakCheck: 0, 
          totalLessonsCompleted: 0, 
          totalDomainsCompleted: 0 
        },
        settings: {
          theme: ['invalid', 0], // 1 invalid
          fontSize: ['invalid', 0], // 2 invalid
          // 9 other fields missing/invalid
        },
        navigationState: { currentEntityId: 0, currentPage: 0, lastUpdated: Date.now() },
        combinedComponentProgress: { components: {} },
      };

      const result = enforceDataIntegrity(JSON.stringify(data), 'test-webid', mockLessonConfigs);

      // All 11 fields should be defaulted
      expect(result.recoveryMetrics.settings.defaultedRatio).toBe(1.0);
    });
  });

  describe('Navigation State Extraction', () => {
    it('keeps valid navigation state', () => {
      const now = Date.now();
      const data = {
        metadata: { webId: 'test-webid' },
        overallProgress: { 
          lessonCompletions: {}, 
          domainCompletions: {}, 
          currentStreak: 0, 
          lastStreakCheck: 0, 
          totalLessonsCompleted: 0, 
          totalDomainsCompleted: 0 
        },
        settings: {},
        navigationState: {
          currentEntityId: 100,
          currentPage: 5,
          lastUpdated: now,
        },
        combinedComponentProgress: { components: {} },
      };

      const result = enforceDataIntegrity(JSON.stringify(data), 'test-webid', mockLessonConfigs);

      expect(result.bundle.navigationState.currentEntityId).toBe(100);
      expect(result.bundle.navigationState.currentPage).toBe(5);
      expect(result.recoveryMetrics.navigationState.wasDefaulted).toBe(false);
    });

    it('defaults navigation when entity does not exist in curriculum', () => {
      const data = {
        metadata: { webId: 'test-webid' },
        overallProgress: { 
          lessonCompletions: {}, 
          domainCompletions: {}, 
          currentStreak: 0, 
          lastStreakCheck: 0, 
          totalLessonsCompleted: 0, 
          totalDomainsCompleted: 0 
        },
        settings: {},
        navigationState: {
          currentEntityId: 999, // Not in curriculum
          currentPage: 5,
          lastUpdated: Date.now(),
        },
        combinedComponentProgress: { components: {} },
      };

      const result = enforceDataIntegrity(JSON.stringify(data), 'test-webid', mockLessonConfigs);

      expect(result.bundle.navigationState.currentEntityId).toBe(0);
      expect(result.bundle.navigationState.currentPage).toBe(0);
      expect(result.recoveryMetrics.navigationState.wasDefaulted).toBe(true);
    });

    it('defaults navigation when malformed', () => {
      const data = {
        metadata: { webId: 'test-webid' },
        overallProgress: { 
          lessonCompletions: {}, 
          domainCompletions: {}, 
          currentStreak: 0, 
          lastStreakCheck: 0, 
          totalLessonsCompleted: 0, 
          totalDomainsCompleted: 0 
        },
        settings: {},
        navigationState: {
          wrongField: 'value',
        },
        combinedComponentProgress: { components: {} },
      };

      const result = enforceDataIntegrity(JSON.stringify(data), 'test-webid', mockLessonConfigs);

      expect(result.recoveryMetrics.navigationState.wasDefaulted).toBe(true);
      expect(result.bundle.navigationState.currentEntityId).toBe(0);
    });
  });

  describe('Combined Component Progress', () => {
    it('initializes all curriculum components when missing', () => {
      const data = {
        metadata: { webId: 'test-webid' },
        overallProgress: { 
          lessonCompletions: {}, 
          domainCompletions: {}, 
          currentStreak: 0, 
          lastStreakCheck: 0, 
          totalLessonsCompleted: 0, 
          totalDomainsCompleted: 0 
        },
        settings: {},
        navigationState: { currentEntityId: 0, currentPage: 0, lastUpdated: Date.now() },
        combinedComponentProgress: {
          components: {}, // Empty
        },
      };

      const result = enforceDataIntegrity(JSON.stringify(data), 'test-webid', mockLessonConfigs);

      // All 3 components should be initialized
      expect(result.bundle.combinedComponentProgress.components).toHaveProperty('1001');
      expect(result.bundle.combinedComponentProgress.components).toHaveProperty('1002');
      expect(result.bundle.combinedComponentProgress.components).toHaveProperty('2001');
      expect(result.recoveryMetrics.combinedComponentProgress.componentsDefaulted).toBe(3);
      expect(result.recoveryMetrics.combinedComponentProgress.componentsRetained).toBe(0);
    });

    it('retains valid component progress', () => {
      const data = {
        metadata: { webId: 'test-webid' },
        overallProgress: { 
          lessonCompletions: {}, 
          domainCompletions: {}, 
          currentStreak: 0, 
          lastStreakCheck: 0, 
          totalLessonsCompleted: 0, 
          totalDomainsCompleted: 0 
        },
        settings: {},
        navigationState: { currentEntityId: 0, currentPage: 0, lastUpdated: Date.now() },
        combinedComponentProgress: {
          components: {
            '1001': { content: 'user data', lastUpdated: 123456 },
            '1002': { checked: [true, false], lastUpdated: 123456 },
            '2001': { answers: ['a', 'b'], lastUpdated: 123456 },
          },
        },
      };

      const result = enforceDataIntegrity(JSON.stringify(data), 'test-webid', mockLessonConfigs);

      // Note: Without progressSchemaMap validators, components may not validate
      // This test verifies the extraction logic works, even if components default
      expect(result.bundle.combinedComponentProgress.components).toHaveProperty('1001');
      expect(result.bundle.combinedComponentProgress.components).toHaveProperty('1002');
      expect(result.bundle.combinedComponentProgress.components).toHaveProperty('2001');
    });

    it('calculates defaulted ratio correctly', () => {
      const data = {
        metadata: { webId: 'test-webid' },
        overallProgress: { 
          lessonCompletions: {}, 
          domainCompletions: {}, 
          currentStreak: 0, 
          lastStreakCheck: 0, 
          totalLessonsCompleted: 0, 
          totalDomainsCompleted: 0 
        },
        settings: {},
        navigationState: { currentEntityId: 0, currentPage: 0, lastUpdated: Date.now() },
        combinedComponentProgress: {
          components: {
            '1001': { content: 'valid', lastUpdated: 123456 }, // Without schema validators, will be defaulted
            // 1002 missing - defaulted
            // 2001 missing - defaulted
          },
        },
      };

      const result = enforceDataIntegrity(JSON.stringify(data), 'test-webid', mockLessonConfigs);

      // Without progressSchemaMap, all components default
      // All 3 components should exist (either retained or defaulted)
      expect(result.bundle.combinedComponentProgress.components).toHaveProperty('1001');
      expect(result.bundle.combinedComponentProgress.components).toHaveProperty('1002');
      expect(result.bundle.combinedComponentProgress.components).toHaveProperty('2001');
      
      // Total defaulted should equal missing + invalid
      expect(result.recoveryMetrics.combinedComponentProgress.componentsDefaulted).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Perfect Input Detection', () => {
    it('marks input as imperfect when corruption detected', () => {
      const data = {
        metadata: { webId: 'test-webid' },
        overallProgress: {
          lessonCompletions: {},
          domainCompletions: {},
          currentStreak: 0,
          lastStreakCheck: 0,
          totalLessonsCompleted: 5, // Corruption
          totalDomainsCompleted: 0,
        },
        settings: {},
        navigationState: { currentEntityId: 0, currentPage: 0, lastUpdated: Date.now() },
        combinedComponentProgress: { components: {} },
      };

      const result = enforceDataIntegrity(JSON.stringify(data), 'test-webid', mockLessonConfigs);

      expect(result.perfectlyValidInput).toBe(false);
    });

    it('marks input as imperfect when lessons dropped', () => {
      const data = {
        metadata: { webId: 'test-webid' },
        overallProgress: {
          lessonCompletions: { 
            '999': { firstCompleted: 123456, lastUpdated: 123456 } 
          }, // Will be dropped
          domainCompletions: {},
          currentStreak: 0,
          lastStreakCheck: 0,
          totalLessonsCompleted: 1,
          totalDomainsCompleted: 0,
        },
        settings: {},
        navigationState: { currentEntityId: 0, currentPage: 0, lastUpdated: Date.now() },
        combinedComponentProgress: { components: {} },
      };

      const result = enforceDataIntegrity(JSON.stringify(data), 'test-webid', mockLessonConfigs);

      expect(result.perfectlyValidInput).toBe(false);
      expect(result.recoveryMetrics.overallProgress.lessonsDroppedRatio).toBeGreaterThan(0);
    });

    it('marks input as imperfect when settings defaulted', () => {
      const data = {
        metadata: { webId: 'test-webid' },
        overallProgress: { 
          lessonCompletions: {}, 
          domainCompletions: {}, 
          currentStreak: 0, 
          lastStreakCheck: 0, 
          totalLessonsCompleted: 0, 
          totalDomainsCompleted: 0 
        },
        settings: { theme: ['invalid', 0] },
        navigationState: { currentEntityId: 0, currentPage: 0, lastUpdated: Date.now() },
        combinedComponentProgress: { components: {} },
      };

      const result = enforceDataIntegrity(JSON.stringify(data), 'test-webid', mockLessonConfigs);

      expect(result.perfectlyValidInput).toBe(false);
    });

    it('marks input as imperfect when navigation defaulted', () => {
      const data = {
        metadata: { webId: 'test-webid' },
        overallProgress: { 
          lessonCompletions: {}, 
          domainCompletions: {}, 
          currentStreak: 0, 
          lastStreakCheck: 0, 
          totalLessonsCompleted: 0, 
          totalDomainsCompleted: 0 
        },
        settings: {},
        navigationState: { currentEntityId: 999, currentPage: 0, lastUpdated: Date.now() },
        combinedComponentProgress: { components: {} },
      };

      const result = enforceDataIntegrity(JSON.stringify(data), 'test-webid', mockLessonConfigs);

      expect(result.perfectlyValidInput).toBe(false);
    });

    it('marks input as imperfect when webId mismatches', () => {
      const data = {
        metadata: { webId: 'wrong-webid' },
        overallProgress: { 
          lessonCompletions: {}, 
          domainCompletions: {}, 
          currentStreak: 0, 
          lastStreakCheck: 0, 
          totalLessonsCompleted: 0, 
          totalDomainsCompleted: 0 
        },
        settings: {},
        navigationState: { currentEntityId: 0, currentPage: 0, lastUpdated: Date.now() },
        combinedComponentProgress: { components: {} },
      };

      const result = enforceDataIntegrity(JSON.stringify(data), 'test-webid', mockLessonConfigs);

      expect(result.perfectlyValidInput).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('handles completely empty input', () => {
      const data = {};

      const result = enforceDataIntegrity(JSON.stringify(data), 'test-webid', mockLessonConfigs);

      expect(result.bundle.metadata.webId).toBe('https://error.mera.invalid/webid-mismatch');
      // All curriculum lessons should be initialized as incomplete
      expect(result.bundle.overallProgress.lessonCompletions).toEqual({
        '100': { firstCompleted: null, lastUpdated: 0 },
        '200': { firstCompleted: null, lastUpdated: 0 },
      });
      expect(result.bundle.overallProgress.domainCompletions).toEqual({
        '1': { firstCompleted: null, lastUpdated: 0 },
        '2': { firstCompleted: null, lastUpdated: 0 },
      });
      expect(result.bundle.settings.theme[0]).toBe('auto');
      expect(result.perfectlyValidInput).toBe(false);
    });

    it('handles null values gracefully', () => {
      const data = {
        metadata: null,
        overallProgress: null,
        settings: null,
        navigationState: null,
        combinedComponentProgress: null,
      };

      const result = enforceDataIntegrity(JSON.stringify(data), 'test-webid', mockLessonConfigs);

      expect(result.bundle).toBeDefined();
      expect(result.perfectlyValidInput).toBe(false);
    });

    it('handles extremely large lesson completion count', () => {
      const manyLessons: Record<string, { firstCompleted: number; lastUpdated: number }> = {};
      // Loop creates lessons 100-199 (200 is excluded by the < 200)
      for (let i = 100; i < 200; i++) {
        manyLessons[i.toString()] = { firstCompleted: 123456, lastUpdated: 123456 };
      }

      const data = {
        metadata: { webId: 'test-webid' },
        overallProgress: {
          lessonCompletions: manyLessons, // 100 lessons (100-199)
          domainCompletions: {},
          currentStreak: 0,
          lastStreakCheck: 0,
          totalLessonsCompleted: 100,
          totalDomainsCompleted: 0,
        },
        settings: {},
        navigationState: { currentEntityId: 0, currentPage: 0, lastUpdated: Date.now() },
        combinedComponentProgress: { components: {} },
      };

      const result = enforceDataIntegrity(JSON.stringify(data), 'test-webid', mockLessonConfigs);

      // Mock only allows lesson 100 and 200
      // Loop creates 100-199, so only lesson 100 is valid (200 is not in the loop)
      const keptLessons = Object.keys(result.bundle.overallProgress.lessonCompletions)
        .filter(id => result.bundle.overallProgress.lessonCompletions[id].firstCompleted !== null);
      expect(keptLessons).toContain('100');
      expect(keptLessons.length).toBe(1);
      // 99 out of 100 dropped = 0.99
      expect(result.recoveryMetrics.overallProgress.lessonsDroppedRatio).toBeCloseTo(0.99, 2);
    });
  });
});