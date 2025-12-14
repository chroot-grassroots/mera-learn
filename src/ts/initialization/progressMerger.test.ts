// src/ts/initialization/progressMerger.test.ts
import { describe, it, expect } from 'vitest';
import { mergeBundles } from './progressMerger.js';
import type { PodStorageBundle } from '../persistence/podStorageSchema.js';
import type { OverallProgressData, CompletionData } from '../core/overallProgressSchema.js';
import type { SettingsData } from '../core/settingsSchema.js';
import type { NavigationState } from '../core/navigationSchema.js';
import type { CombinedComponentProgress } from '../core/combinedComponentProgressSchema.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create a minimal valid bundle for testing
 */
function createTestBundle(overrides?: Partial<PodStorageBundle>): PodStorageBundle {
  const defaultBundle: PodStorageBundle = {
    metadata: {
      webId: 'https://test.example/profile#me',
    },
    overallProgress: {
      lessonCompletions: {},
      domainCompletions: {},
      totalLessonsCompleted: 0,
      totalDomainsCompleted: 0,
      currentStreak: 0,
      lastStreakCheck: 0,
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
      lastUpdated: 0,
    },
    combinedComponentProgress: {
      components: {},
    },
  };

  return { ...defaultBundle, ...overrides };
}

/**
 * Create CompletionData for testing
 */
function completion(firstCompleted: number | null, lastUpdated: number): CompletionData {
  return { firstCompleted, lastUpdated };
}

// ============================================================================
// OVERALL PROGRESS MERGING TESTS
// ============================================================================

describe('progressMerger - Overall Progress', () => {
  describe('Lesson Completions', () => {
    it('merges lessons from both bundles using newest lastUpdated', () => {
      const bundleA = createTestBundle({
        overallProgress: {
          lessonCompletions: {
            '100': completion(1000, 1000),
            '200': completion(2000, 2000),
          },
          domainCompletions: {},
          totalLessonsCompleted: 2,
          totalDomainsCompleted: 0,
          currentStreak: 0,
          lastStreakCheck: 0,
        },
      });

      const bundleB = createTestBundle({
        overallProgress: {
          lessonCompletions: {
            '100': completion(1000, 1500), // Newer lastUpdated
            '200': completion(2000, 1500), // Older lastUpdated
          },
          domainCompletions: {},
          totalLessonsCompleted: 2,
          totalDomainsCompleted: 0,
          currentStreak: 0,
          lastStreakCheck: 0,
        },
      });

      const merged = mergeBundles(bundleA, bundleB);

      // Lesson 100: bundleB wins (1500 > 1000)
      expect(merged.overallProgress.lessonCompletions['100']).toEqual(
        completion(1000, 1500)
      );
      // Lesson 200: bundleA wins (2000 >= 1500)
      expect(merged.overallProgress.lessonCompletions['200']).toEqual(
        completion(2000, 2000)
      );
    });

    it('preserves lesson incompletion with newer timestamp', () => {
      const bundleA = createTestBundle({
        overallProgress: {
          lessonCompletions: {
            '100': completion(1000, 1000), // Completed at 1000
          },
          domainCompletions: {},
          totalLessonsCompleted: 1,
          totalDomainsCompleted: 0,
          currentStreak: 0,
          lastStreakCheck: 0,
        },
      });

      const bundleB = createTestBundle({
        overallProgress: {
          lessonCompletions: {
            '100': completion(null, 2000), // Marked incomplete at 2000
          },
          domainCompletions: {},
          totalLessonsCompleted: 0,
          totalDomainsCompleted: 0,
          currentStreak: 0,
          lastStreakCheck: 0,
        },
      });

      const merged = mergeBundles(bundleA, bundleB);

      // BundleB wins (2000 > 1000), preserving incompletion
      expect(merged.overallProgress.lessonCompletions['100']).toEqual(
        completion(null, 2000)
      );
      // Counter recalculated from merged data
      expect(merged.overallProgress.totalLessonsCompleted).toBe(0);
    });

    it('recalculates totalLessonsCompleted from merged data', () => {
      const bundleA = createTestBundle({
        overallProgress: {
          lessonCompletions: {
            '100': completion(1000, 1000),
            '200': completion(2000, 2000),
            '300': completion(null, 500), // Incomplete
          },
          domainCompletions: {},
          totalLessonsCompleted: 999, // Incorrect counter - should be ignored
          totalDomainsCompleted: 0,
          currentStreak: 0,
          lastStreakCheck: 0,
        },
      });

      const bundleB = createTestBundle({
        overallProgress: {
          lessonCompletions: {
            '100': completion(1000, 1000),
            '200': completion(2000, 2000),
            '300': completion(3000, 3000), // Completed
          },
          domainCompletions: {},
          totalLessonsCompleted: 888, // Also incorrect
          totalDomainsCompleted: 0,
          currentStreak: 0,
          lastStreakCheck: 0,
        },
      });

      const merged = mergeBundles(bundleA, bundleB);

      // 300 from bundleB wins (3000 > 500), so all 3 lessons completed
      expect(merged.overallProgress.totalLessonsCompleted).toBe(3);
    });

    it('handles ties by favoring bundleA', () => {
      const bundleA = createTestBundle({
        overallProgress: {
          lessonCompletions: {
            '100': completion(1000, 5000),
          },
          domainCompletions: {},
          totalLessonsCompleted: 1,
          totalDomainsCompleted: 0,
          currentStreak: 0,
          lastStreakCheck: 0,
        },
      });

      const bundleB = createTestBundle({
        overallProgress: {
          lessonCompletions: {
            '100': completion(2000, 5000), // Same lastUpdated
          },
          domainCompletions: {},
          totalLessonsCompleted: 1,
          totalDomainsCompleted: 0,
          currentStreak: 0,
          lastStreakCheck: 0,
        },
      });

      const merged = mergeBundles(bundleA, bundleB);

      // Tie: bundleA wins (>= comparison)
      expect(merged.overallProgress.lessonCompletions['100']).toEqual(
        completion(1000, 5000)
      );
    });
  });

  describe('Domain Completions', () => {
    it('merges domains using newest lastUpdated', () => {
      const bundleA = createTestBundle({
        overallProgress: {
          lessonCompletions: {},
          domainCompletions: {
            '1': completion(1000, 1000),
            '2': completion(2000, 3000), // Newer
          },
          totalLessonsCompleted: 0,
          totalDomainsCompleted: 2,
          currentStreak: 0,
          lastStreakCheck: 0,
        },
      });

      const bundleB = createTestBundle({
        overallProgress: {
          lessonCompletions: {},
          domainCompletions: {
            '1': completion(1000, 2000), // Newer
            '2': completion(2000, 2000),
          },
          totalLessonsCompleted: 0,
          totalDomainsCompleted: 2,
          currentStreak: 0,
          lastStreakCheck: 0,
        },
      });

      const merged = mergeBundles(bundleA, bundleB);

      expect(merged.overallProgress.domainCompletions['1']).toEqual(
        completion(1000, 2000)
      );
      expect(merged.overallProgress.domainCompletions['2']).toEqual(
        completion(2000, 3000)
      );
    });

    it('recalculates totalDomainsCompleted from merged data', () => {
      const bundleA = createTestBundle({
        overallProgress: {
          lessonCompletions: {},
          domainCompletions: {
            '1': completion(1000, 1000),
            '2': completion(null, 500), // Incomplete
          },
          totalLessonsCompleted: 0,
          totalDomainsCompleted: 999,
          currentStreak: 0,
          lastStreakCheck: 0,
        },
      });

      const bundleB = createTestBundle({
        overallProgress: {
          lessonCompletions: {},
          domainCompletions: {
            '1': completion(1000, 1000),
            '2': completion(2000, 2000), // Completed
          },
          totalLessonsCompleted: 0,
          totalDomainsCompleted: 888,
          currentStreak: 0,
          lastStreakCheck: 0,
        },
      });

      const merged = mergeBundles(bundleA, bundleB);

      // BundleB's domain 2 wins, so both domains completed
      expect(merged.overallProgress.totalDomainsCompleted).toBe(2);
    });
  });

  describe('Streak Data', () => {
    it('uses streak from bundle with newest lastStreakCheck', () => {
      const bundleA = createTestBundle({
        overallProgress: {
          lessonCompletions: {},
          domainCompletions: {},
          totalLessonsCompleted: 0,
          totalDomainsCompleted: 0,
          currentStreak: 10,
          lastStreakCheck: 5000,
        },
      });

      const bundleB = createTestBundle({
        overallProgress: {
          lessonCompletions: {},
          domainCompletions: {},
          totalLessonsCompleted: 0,
          totalDomainsCompleted: 0,
          currentStreak: 5,
          lastStreakCheck: 3000,
        },
      });

      const merged = mergeBundles(bundleA, bundleB);

      // BundleA has newer lastStreakCheck
      expect(merged.overallProgress.currentStreak).toBe(10);
      expect(merged.overallProgress.lastStreakCheck).toBe(5000);
    });

    it('takes MAX of lastStreakCheck timestamps', () => {
      const bundleA = createTestBundle({
        overallProgress: {
          lessonCompletions: {},
          domainCompletions: {},
          totalLessonsCompleted: 0,
          totalDomainsCompleted: 0,
          currentStreak: 10,
          lastStreakCheck: 3000,
        },
      });

      const bundleB = createTestBundle({
        overallProgress: {
          lessonCompletions: {},
          domainCompletions: {},
          totalLessonsCompleted: 0,
          totalDomainsCompleted: 0,
          currentStreak: 5,
          lastStreakCheck: 5000, // Newer
        },
      });

      const merged = mergeBundles(bundleA, bundleB);

      expect(merged.overallProgress.lastStreakCheck).toBe(5000);
    });
  });
});

// ============================================================================
// SETTINGS MERGING TESTS
// ============================================================================

describe('progressMerger - Settings', () => {
  it('merges each setting field independently by timestamp', () => {
    const bundleA = createTestBundle({
      settings: {
        weekStartDay: ['monday', 1000],
        weekStartTimeUTC: ['00:00', 3000], // Newer
        theme: ['dark', 2000],
        learningPace: ['standard', 0],
        optOutDailyPing: [false, 0],
        optOutErrorPing: [false, 0],
        fontSize: ['large', 4000], // Newer
        highContrast: [false, 0],
        reducedMotion: [false, 0],
        focusIndicatorStyle: ['default', 0],
        audioEnabled: [true, 0],
      },
    });

    const bundleB = createTestBundle({
      settings: {
        weekStartDay: ['sunday', 2000], // Newer
        weekStartTimeUTC: ['12:00', 1000],
        theme: ['light', 5000], // Newer
        learningPace: ['accelerated', 1000], // Newer
        optOutDailyPing: [true, 0], // Tie
        optOutErrorPing: [true, 1000], // Newer
        fontSize: ['small', 2000],
        highContrast: [true, 1000], // Newer
        reducedMotion: [true, 0], // Tie
        focusIndicatorStyle: ['enhanced', 2000], // Newer
        audioEnabled: [false, 0], // Tie
      },
    });

    const merged = mergeBundles(bundleA, bundleB);

    // BundleB wins: newer timestamp
    expect(merged.settings.weekStartDay).toEqual(['sunday', 2000]);
    expect(merged.settings.theme).toEqual(['light', 5000]);
    expect(merged.settings.learningPace).toEqual(['accelerated', 1000]);
    expect(merged.settings.optOutErrorPing).toEqual([true, 1000]);
    expect(merged.settings.highContrast).toEqual([true, 1000]);
    expect(merged.settings.focusIndicatorStyle).toEqual(['enhanced', 2000]);

    // BundleA wins: newer timestamp
    expect(merged.settings.weekStartTimeUTC).toEqual(['00:00', 3000]);
    expect(merged.settings.fontSize).toEqual(['large', 4000]);

    // Ties: bundleA wins (>= comparison)
    expect(merged.settings.optOutDailyPing).toEqual([false, 0]);
    expect(merged.settings.reducedMotion).toEqual([false, 0]);
    expect(merged.settings.audioEnabled).toEqual([true, 0]);
  });

  it('allows different settings to have different winners', () => {
    const bundleA = createTestBundle({
      settings: {
        weekStartDay: ['monday', 5000],
        weekStartTimeUTC: ['00:00', 1000],
        theme: ['dark', 5000],
        learningPace: ['standard', 1000],
        optOutDailyPing: [false, 5000],
        optOutErrorPing: [false, 1000],
        fontSize: ['medium', 0],
        highContrast: [false, 0],
        reducedMotion: [false, 0],
        focusIndicatorStyle: ['default', 0],
        audioEnabled: [true, 0],
      },
    });

    const bundleB = createTestBundle({
      settings: {
        weekStartDay: ['sunday', 1000],
        weekStartTimeUTC: ['12:00', 5000],
        theme: ['light', 1000],
        learningPace: ['accelerated', 5000],
        optOutDailyPing: [true, 1000],
        optOutErrorPing: [true, 5000],
        fontSize: ['large', 5000],
        highContrast: [true, 5000],
        reducedMotion: [true, 5000],
        focusIndicatorStyle: ['enhanced', 5000],
        audioEnabled: [false, 5000],
      },
    });

    const merged = mergeBundles(bundleA, bundleB);

    // Each field independently resolved
    expect(merged.settings.weekStartDay).toEqual(['monday', 5000]); // A wins
    expect(merged.settings.weekStartTimeUTC).toEqual(['12:00', 5000]); // B wins
    expect(merged.settings.theme).toEqual(['dark', 5000]); // A wins
    expect(merged.settings.learningPace).toEqual(['accelerated', 5000]); // B wins
    expect(merged.settings.fontSize).toEqual(['large', 5000]); // B wins
  });
});

// ============================================================================
// NAVIGATION STATE MERGING TESTS
// ============================================================================

describe('progressMerger - Navigation State', () => {
  it('uses navigation state with newest lastUpdated', () => {
    const bundleA = createTestBundle({
      navigationState: {
        currentEntityId: 100,
        currentPage: 5,
        lastUpdated: 5000,
      },
    });

    const bundleB = createTestBundle({
      navigationState: {
        currentEntityId: 200,
        currentPage: 3,
        lastUpdated: 3000,
      },
    });

    const merged = mergeBundles(bundleA, bundleB);

    // BundleA wins (5000 > 3000)
    expect(merged.navigationState).toEqual({
      currentEntityId: 100,
      currentPage: 5,
      lastUpdated: 5000,
    });
  });

  it('favors bundleA on timestamp tie', () => {
    const bundleA = createTestBundle({
      navigationState: {
        currentEntityId: 100,
        currentPage: 5,
        lastUpdated: 5000,
      },
    });

    const bundleB = createTestBundle({
      navigationState: {
        currentEntityId: 200,
        currentPage: 3,
        lastUpdated: 5000, // Same timestamp
      },
    });

    const merged = mergeBundles(bundleA, bundleB);

    // BundleA wins on tie (>= comparison)
    expect(merged.navigationState.currentEntityId).toBe(100);
  });
});

// ============================================================================
// COMPONENT PROGRESS MERGING TESTS
// ============================================================================

describe('progressMerger - Component Progress', () => {
  it('merges components using newest lastUpdated per component', () => {
    const bundleA = createTestBundle({
      combinedComponentProgress: {
        components: {
          '1001': { checked: [true, false], lastUpdated: 5000 }, // Newer
          '1002': { content: 'old', lastUpdated: 1000 },
          '1003': { score: 50, lastUpdated: 3000 },
        },
      },
    });

    const bundleB = createTestBundle({
      combinedComponentProgress: {
        components: {
          '1001': { checked: [false, true], lastUpdated: 3000 },
          '1002': { content: 'new', lastUpdated: 5000 }, // Newer
          '1003': { score: 75, lastUpdated: 5000 }, // Newer
        },
      },
    });

    const merged = mergeBundles(bundleA, bundleB);

    // Component 1001: bundleA wins
    expect(merged.combinedComponentProgress.components['1001']).toEqual({
      checked: [true, false],
      lastUpdated: 5000,
    });

    // Component 1002: bundleB wins
    expect(merged.combinedComponentProgress.components['1002']).toEqual({
      content: 'new',
      lastUpdated: 5000,
    });

    // Component 1003: bundleB wins
    expect(merged.combinedComponentProgress.components['1003']).toEqual({
      score: 75,
      lastUpdated: 5000,
    });
  });

  it('takes entire component atomically (no field-level merging)', () => {
    const bundleA = createTestBundle({
      combinedComponentProgress: {
        components: {
          '1001': {
            checked: [true, true, true],
            attempts: 10,
            score: 95,
            lastUpdated: 5000, // Newer
          },
        },
      },
    });

    const bundleB = createTestBundle({
      combinedComponentProgress: {
        components: {
          '1001': {
            checked: [false, false, false],
            attempts: 1,
            score: 10,
            lastUpdated: 3000,
          },
        },
      },
    });

    const merged = mergeBundles(bundleA, bundleB);

    // BundleA wins entirely - no mixing of fields
    expect(merged.combinedComponentProgress.components['1001']).toEqual({
      checked: [true, true, true],
      attempts: 10,
      score: 95,
      lastUpdated: 5000,
    });
  });

  it('handles defaulted components correctly (lastUpdated: 0)', () => {
    const bundleA = createTestBundle({
      combinedComponentProgress: {
        components: {
          '1001': { checked: [], lastUpdated: 0 }, // Defaulted
        },
      },
    });

    const bundleB = createTestBundle({
      combinedComponentProgress: {
        components: {
          '1001': { checked: [true, false], lastUpdated: 5000 }, // Real progress
        },
      },
    });

    const merged = mergeBundles(bundleA, bundleB);

    // BundleB wins (5000 > 0) - preserves user progress over default
    expect(merged.combinedComponentProgress.components['1001']).toEqual({
      checked: [true, false],
      lastUpdated: 5000,
    });
  });

  it('favors bundleA on timestamp tie', () => {
    const bundleA = createTestBundle({
      combinedComponentProgress: {
        components: {
          '1001': { value: 'A', lastUpdated: 5000 },
        },
      },
    });

    const bundleB = createTestBundle({
      combinedComponentProgress: {
        components: {
          '1001': { value: 'B', lastUpdated: 5000 }, // Same timestamp
        },
      },
    });

    const merged = mergeBundles(bundleA, bundleB);

    expect(merged.combinedComponentProgress.components['1001'].value).toBe('A');
  });
});

// ============================================================================
// METADATA TESTS
// ============================================================================

describe('progressMerger - Metadata', () => {
  it('preserves metadata from bundleA', () => {
    const bundleA = createTestBundle({
      metadata: {
        webId: 'https://alice.example/profile#me',
      },
    });

    const bundleB = createTestBundle({
      metadata: {
        webId: 'https://bob.example/profile#me', // Different (shouldn't happen)
      },
    });

    const merged = mergeBundles(bundleA, bundleB);

    // Always uses bundleA's metadata
    expect(merged.metadata.webId).toBe('https://alice.example/profile#me');
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('progressMerger - Integration Scenarios', () => {
  it('merges offline work with online state correctly', () => {
    // Scenario: User worked offline, then comes back online
    // Online backup is older, offline backup has new progress

    const onlineBundle = createTestBundle({
      overallProgress: {
        lessonCompletions: {
          '100': completion(1000, 1000),
          '200': completion(null, 0), // Never touched
        },
        domainCompletions: {},
        totalLessonsCompleted: 1,
        totalDomainsCompleted: 0,
        currentStreak: 5,
        lastStreakCheck: 1000,
      },
      settings: {
        weekStartDay: ['monday', 1000],
        weekStartTimeUTC: ['00:00', 0],
        theme: ['dark', 1000],
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
        currentEntityId: 100,
        currentPage: 0,
        lastUpdated: 1000,
      },
      combinedComponentProgress: {
        components: {
          '1001': { checked: [true], lastUpdated: 1000 },
        },
      },
    });

    const offlineBundle = createTestBundle({
      overallProgress: {
        lessonCompletions: {
          '100': completion(1000, 1000), // Same
          '200': completion(3000, 3000), // Completed offline!
        },
        domainCompletions: {},
        totalLessonsCompleted: 2,
        totalDomainsCompleted: 0,
        currentStreak: 7, // Updated offline
        lastStreakCheck: 3000,
      },
      settings: {
        weekStartDay: ['monday', 1000],
        weekStartTimeUTC: ['00:00', 0],
        theme: ['light', 3000], // Changed offline
        learningPace: ['standard', 0],
        optOutDailyPing: [false, 0],
        optOutErrorPing: [false, 0],
        fontSize: ['large', 3000], // Changed offline
        highContrast: [false, 0],
        reducedMotion: [false, 0],
        focusIndicatorStyle: ['default', 0],
        audioEnabled: [true, 0],
      },
      navigationState: {
        currentEntityId: 200,
        currentPage: 5,
        lastUpdated: 3000, // Moved offline
      },
      combinedComponentProgress: {
        components: {
          '1001': { checked: [true, true], lastUpdated: 3000 }, // Progress offline
        },
      },
    });

    const merged = mergeBundles(onlineBundle, offlineBundle);

    // Offline lesson completion preserved
    expect(merged.overallProgress.lessonCompletions['200']).toEqual(
      completion(3000, 3000)
    );
    expect(merged.overallProgress.totalLessonsCompleted).toBe(2);

    // Offline settings preserved
    expect(merged.settings.theme).toEqual(['light', 3000]);
    expect(merged.settings.fontSize).toEqual(['large', 3000]);

    // Offline navigation preserved
    expect(merged.navigationState.currentEntityId).toBe(200);

    // Offline component progress preserved
    expect(merged.combinedComponentProgress.components['1001']).toEqual({
      checked: [true, true],
      lastUpdated: 3000,
    });

    // Offline streak preserved
    expect(merged.overallProgress.currentStreak).toBe(7);
  });

  it('handles multi-device scenario with mixed timestamps', () => {
    // Scenario: User uses laptop and phone, different actions on each
    
    const laptopBundle = createTestBundle({
      overallProgress: {
        lessonCompletions: {
          '100': completion(1000, 1000), // Completed on laptop
          '200': completion(null, 0),
        },
        domainCompletions: {},
        totalLessonsCompleted: 1,
        totalDomainsCompleted: 0,
        currentStreak: 0,
        lastStreakCheck: 0,
      },
      settings: {
        weekStartDay: ['monday', 0],
        weekStartTimeUTC: ['00:00', 0],
        theme: ['dark', 2000], // Changed on laptop
        learningPace: ['standard', 0],
        optOutDailyPing: [false, 0],
        optOutErrorPing: [false, 0],
        fontSize: ['large', 2000], // Changed on laptop
        highContrast: [false, 0],
        reducedMotion: [false, 0],
        focusIndicatorStyle: ['default', 0],
        audioEnabled: [true, 0],
      },
      navigationState: {
        currentEntityId: 100,
        currentPage: 5,
        lastUpdated: 2000,
      },
      combinedComponentProgress: {
        components: {
          '1001': { value: 'laptop', lastUpdated: 2000 },
        },
      },
    });

    const phoneBundle = createTestBundle({
      overallProgress: {
        lessonCompletions: {
          '100': completion(null, 0),
          '200': completion(3000, 3000), // Completed on phone
        },
        domainCompletions: {},
        totalLessonsCompleted: 1,
        totalDomainsCompleted: 0,
        currentStreak: 0,
        lastStreakCheck: 0,
      },
      settings: {
        weekStartDay: ['sunday', 3000], // Changed on phone
        weekStartTimeUTC: ['12:00', 3000], // Changed on phone
        theme: ['auto', 0],
        learningPace: ['standard', 0],
        optOutDailyPing: [false, 0],
        optOutErrorPing: [false, 0],
        fontSize: ['medium', 0],
        highContrast: [true, 3000], // Changed on phone
        reducedMotion: [false, 0],
        focusIndicatorStyle: ['default', 0],
        audioEnabled: [true, 0],
      },
      navigationState: {
        currentEntityId: 200,
        currentPage: 0,
        lastUpdated: 3000,
      },
      combinedComponentProgress: {
        components: {
          '1001': { value: 'phone', lastUpdated: 3000 },
        },
      },
    });

    const merged = mergeBundles(laptopBundle, phoneBundle);

    // Laptop's lesson 100 preserved, phone's lesson 200 preserved
    expect(merged.overallProgress.lessonCompletions['100']).toEqual(
      completion(1000, 1000)
    );
    expect(merged.overallProgress.lessonCompletions['200']).toEqual(
      completion(3000, 3000)
    );
    expect(merged.overallProgress.totalLessonsCompleted).toBe(2);

    // Mixed settings: newest wins per field
    expect(merged.settings.theme).toEqual(['dark', 2000]); // Laptop
    expect(merged.settings.fontSize).toEqual(['large', 2000]); // Laptop
    expect(merged.settings.weekStartDay).toEqual(['sunday', 3000]); // Phone
    expect(merged.settings.weekStartTimeUTC).toEqual(['12:00', 3000]); // Phone
    expect(merged.settings.highContrast).toEqual([true, 3000]); // Phone

    // Phone's navigation is newer
    expect(merged.navigationState.currentEntityId).toBe(200);

    // Phone's component progress is newer
    expect(merged.combinedComponentProgress.components['1001'].value).toBe('phone');
  });
});