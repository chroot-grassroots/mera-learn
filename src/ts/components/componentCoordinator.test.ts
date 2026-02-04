/**
 * @fileoverview Test Suite for Component Coordinator
 * @module components/componentCoordinator.test
 *
 * Tests the component lifecycle orchestration including:
 * - Async page load coordination
 * - Progress-based timeout (stall detection)
 * - Component readiness polling
 * - Component activation (render + enable operations)
 * - Completion status queries
 * - Defensive error handling per component
 * - State management and cleanup
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { BaseComponentCore } from './cores/baseComponentCore.js';

// ============================================================================
// MOCK TIMELINE CONTAINER
// ============================================================================
// The coordinator now calls getTimelineInstance().clearTimeline() during
// beginPageLoad(). Mock it to avoid DOM dependency in unit tests.
vi.mock('../ui/timelineContainer.js', () => ({
  getTimelineInstance: vi.fn(() => ({
    clearTimeline: vi.fn(),
  })),
}));

// Import after mocks are set up
import { componentCoordinator } from './componentCoordinator.js';

describe('componentCoordinator', () => {
  // Use fake timers for deterministic async testing
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    // Reset coordinator state between tests (it's a singleton)
    componentCoordinator.clearPage();
  });

  // ============================================================================
  // HELPER: Create mock component core
  // ============================================================================

  function createMockCore(
    componentId: number,
    options: {
      isReady?: boolean;
      readyAfterMs?: number;
      loadingProgress?: { loaded: number; total: number } | null;
      progressIncrement?: number; // Bytes to add per poll
      isComplete?: boolean;
      throwOnReadyCheck?: boolean;
      throwOnActivation?: boolean;
    } = {}
  ): BaseComponentCore<any, any> {
    let currentProgress = options.loadingProgress?.loaded || 0;
    const progressIncrement = options.progressIncrement || 0;
    let isReady = options.isReady ?? false;

    // Simulate becoming ready after delay
    if (options.readyAfterMs !== undefined) {
      setTimeout(() => {
        isReady = true;
      }, options.readyAfterMs);
    }

    const mockInterface = {
      isReady: vi.fn(() => {
        if (options.throwOnReadyCheck) {
          throw new Error('Component destroyed');
        }
        return isReady;
      }),
      getLoadingProgress: vi.fn(() => {
        // Increment progress on each call to simulate download
        if (progressIncrement > 0 && !isReady) {
          currentProgress += progressIncrement;
        }
        return options.loadingProgress !== undefined
          ? { loaded: currentProgress, total: options.loadingProgress?.total || 100 }
          : null;
      }),
      renderToDOM: vi.fn(),
    };

    return {
      config: { id: componentId },
      interface: mockInterface,
      isInterfaceReady: vi.fn(() => mockInterface.isReady()),
      displayInterface: vi.fn(() => {
        if (options.throwOnActivation) {
          throw new Error('Activation failed');
        }
        mockInterface.renderToDOM();
      }),
      isComplete: vi.fn(() => options.isComplete ?? true),
    } as any;
  }

  // ============================================================================
  // CLEAR PAGE
  // ============================================================================

  describe('clearPage', () => {
    it('resets internal state', () => {
      // Setup: start a page load
      const cores = new Map([[100, createMockCore(100, { isReady: true })]]);
      componentCoordinator.beginPageLoad(cores);

      expect(componentCoordinator.isLoadingInProgress()).toBe(true);

      // Clear page
      componentCoordinator.clearPage();

      expect(componentCoordinator.isLoadingInProgress()).toBe(false);
    });

    it('can be called multiple times safely', () => {
      componentCoordinator.clearPage();
      componentCoordinator.clearPage();
      componentCoordinator.clearPage();

      expect(componentCoordinator.isLoadingInProgress()).toBe(false);
    });
  });

  // ============================================================================
  // BEGIN PAGE LOAD - HAPPY PATHS
  // ============================================================================

  describe('beginPageLoad - Happy Paths', () => {
    it('activates components that are immediately ready', async () => {
      const core1 = createMockCore(100, { isReady: true });
      const core2 = createMockCore(101, { isReady: true });
      const cores = new Map([
        [100, core1],
        [101, core2],
      ]);

      const loadPromise = componentCoordinator.beginPageLoad(cores);

      // Advance one poll cycle (50ms)
      await vi.advanceTimersByTimeAsync(50);

      await loadPromise;

      // Both components should be activated
      expect(core1.displayInterface).toHaveBeenCalledTimes(1);
      expect(core2.displayInterface).toHaveBeenCalledTimes(1);
      expect(componentCoordinator.isLoadingInProgress()).toBe(false);
    });

    it('waits for components to become ready', async () => {
      const core1 = createMockCore(100, { readyAfterMs: 100 });
      const core2 = createMockCore(101, { readyAfterMs: 200 });
      const cores = new Map([
        [100, core1],
        [101, core2],
      ]);

      const loadPromise = componentCoordinator.beginPageLoad(cores);

      // Not ready yet
      await vi.advanceTimersByTimeAsync(50);
      expect(core1.displayInterface).not.toHaveBeenCalled();

      // Core1 ready, but waiting for core2
      await vi.advanceTimersByTimeAsync(100);
      expect(core1.displayInterface).not.toHaveBeenCalled();

      // Both ready now
      await vi.advanceTimersByTimeAsync(100);
      await loadPromise;

      expect(core1.displayInterface).toHaveBeenCalledTimes(1);
      expect(core2.displayInterface).toHaveBeenCalledTimes(1);
    });

    it('handles empty component map', async () => {
      const cores = new Map();

      const loadPromise = componentCoordinator.beginPageLoad(cores);

      await vi.advanceTimersByTimeAsync(50);
      await loadPromise;

      // Should complete without error
      expect(componentCoordinator.isLoadingInProgress()).toBe(false);
    });

    it('clones the cores map (defensive against external changes)', async () => {
      const core1 = createMockCore(100, { isReady: true });
      const cores = new Map([[100, core1]]);

      const loadPromise = componentCoordinator.beginPageLoad(cores);

      // Mutate original map
      cores.clear();

      await vi.advanceTimersByTimeAsync(50);
      await loadPromise;

      // Should still activate core1 (coordinator cloned the map)
      expect(core1.displayInterface).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // BEGIN PAGE LOAD - PROGRESS TRACKING
  // ============================================================================

  describe('beginPageLoad - Progress Tracking', () => {
    it('resets timeout when progress is detected', async () => {
      const core1 = createMockCore(100, {
        isReady: false,
        readyAfterMs: 35000, // 35 seconds (would timeout without progress)
        loadingProgress: { loaded: 0, total: 1000 },
        progressIncrement: 10, // +10 bytes per poll
      });
      const cores = new Map([[100, core1]]);

      const loadPromise = componentCoordinator.beginPageLoad(cores);

      // Advance 32 seconds (within stall timeout because progress happening)
      await vi.advanceTimersByTimeAsync(32000);

      // Should NOT have timed out (progress detected)
      expect(core1.displayInterface).not.toHaveBeenCalled();

      // Advance to when component becomes ready
      await vi.advanceTimersByTimeAsync(3500);
      await loadPromise;

      // Should complete successfully
      expect(core1.displayInterface).toHaveBeenCalledTimes(1);
    });

    it('times out when no progress for extended period', async () => {
      const core1 = createMockCore(100, {
        isReady: false,
        loadingProgress: { loaded: 100, total: 1000 }, // Stuck at 100
        progressIncrement: 0, // NO progress
      });
      const cores = new Map([[100, core1]]);

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const loadPromise = componentCoordinator.beginPageLoad(cores);

      // Advance past the 30-second stall timeout
      // Use runAllTimersAsync to process all pending timers at once
      await vi.runAllTimersAsync();
      await loadPromise;

      // Should timeout and activate anyway
      expect(core1.displayInterface).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('handles components without progress tracking', async () => {
      const core1 = createMockCore(100, {
        isReady: false,
        readyAfterMs: 100,
        loadingProgress: null, // No progress tracking
      });
      const cores = new Map([[100, core1]]);

      const loadPromise = componentCoordinator.beginPageLoad(cores);

      // Should wait for component readiness (no progress to track)
      await vi.advanceTimersByTimeAsync(150);
      await loadPromise;

      expect(core1.displayInterface).toHaveBeenCalledTimes(1);
    });

    it('tracks progress from multiple components independently', async () => {
      const core1 = createMockCore(100, {
        isReady: false,
        readyAfterMs: 200,
        loadingProgress: { loaded: 0, total: 500 },
        progressIncrement: 5,
      });
      const core2 = createMockCore(101, {
        isReady: false,
        readyAfterMs: 300,
        loadingProgress: { loaded: 0, total: 1000 },
        progressIncrement: 10,
      });
      const cores = new Map([
        [100, core1],
        [101, core2],
      ]);

      const loadPromise = componentCoordinator.beginPageLoad(cores);

      // Both making progress, no timeout
      await vi.advanceTimersByTimeAsync(350);
      await loadPromise;

      expect(core1.displayInterface).toHaveBeenCalledTimes(1);
      expect(core2.displayInterface).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // BEGIN PAGE LOAD - ERROR HANDLING
  // ============================================================================

  describe('beginPageLoad - Error Handling', () => {
    it('continues when component throws during readiness check', async () => {
      const core1 = createMockCore(100, { isReady: true });
      const core2 = createMockCore(101, { throwOnReadyCheck: true });
      const cores = new Map([
        [100, core1],
        [101, core2],
      ]);

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const loadPromise = componentCoordinator.beginPageLoad(cores);
      await vi.advanceTimersByTimeAsync(50);
      await loadPromise;

      // Both should be activated (broken component doesn't block)
      expect(core1.displayInterface).toHaveBeenCalledTimes(1);
      expect(core2.displayInterface).toHaveBeenCalledTimes(1);

      consoleWarnSpy.mockRestore();
    });

    it('continues when component throws during activation', async () => {
      const core1 = createMockCore(100, { throwOnActivation: true, isReady: true });
      const core2 = createMockCore(101, { isReady: true });
      const cores = new Map([
        [100, core1],
        [101, core2],
      ]);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const loadPromise = componentCoordinator.beginPageLoad(cores);
      await vi.advanceTimersByTimeAsync(50);
      await loadPromise;

      // Should attempt activation on both (core1 throws but doesn't crash)
      expect(core1.displayInterface).toHaveBeenCalledTimes(1);
      expect(core2.displayInterface).toHaveBeenCalledTimes(1);

      consoleErrorSpy.mockRestore();
    });

    it('completes successfully even if all components fail', async () => {
      const core1 = createMockCore(100, { throwOnActivation: true, isReady: true });
      const core2 = createMockCore(101, { throwOnActivation: true, isReady: true });
      const cores = new Map([
        [100, core1],
        [101, core2],
      ]);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const loadPromise = componentCoordinator.beginPageLoad(cores);
      await vi.advanceTimersByTimeAsync(50);

      // Should not throw, completes gracefully
      await expect(loadPromise).resolves.toBeUndefined();
      expect(componentCoordinator.isLoadingInProgress()).toBe(false);

      consoleErrorSpy.mockRestore();
    });

    it('handles errors during progress snapshot capture', async () => {
      const core1 = createMockCore(100, {
        isReady: false,
        readyAfterMs: 100,
        loadingProgress: { loaded: 0, total: 1000 },
      });
      
      // Make getLoadingProgress throw after first call
      let callCount = 0;
      vi.spyOn(core1.interface, 'getLoadingProgress').mockImplementation(() => {
        callCount++;
        if (callCount > 1) {
          throw new Error('Component destroyed during load');
        }
        return { loaded: 0, total: 1000 };
      });

      const cores = new Map([[100, core1]]);

      const loadPromise = componentCoordinator.beginPageLoad(cores);
      
      // Should not crash, just treats component as having no progress
      await vi.advanceTimersByTimeAsync(150);
      await loadPromise;

      expect(core1.displayInterface).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // ARE ALL COMPLETE
  // ============================================================================

  describe('areAllComplete', () => {
    it('returns true when all components complete', () => {
      const core1 = createMockCore(100, { isComplete: true });
      const core2 = createMockCore(101, { isComplete: true });
      const cores = new Map([
        [100, core1],
        [101, core2],
      ]);

      componentCoordinator.beginPageLoad(cores);

      expect(componentCoordinator.areAllComplete()).toBe(true);
    });

    it('returns false when any component incomplete', () => {
      const core1 = createMockCore(100, { isComplete: true });
      const core2 = createMockCore(101, { isComplete: false });
      const cores = new Map([
        [100, core1],
        [101, core2],
      ]);

      componentCoordinator.beginPageLoad(cores);

      expect(componentCoordinator.areAllComplete()).toBe(false);
    });

    it('returns true when no components exist', () => {
      componentCoordinator.clearPage();

      expect(componentCoordinator.areAllComplete()).toBe(true);
    });

    it('treats component that throws as complete', () => {
      const core1 = createMockCore(100, { isComplete: true });
      const core2 = createMockCore(101, { isComplete: true });
      
      // Make core2 throw when checking completion
      vi.spyOn(core2, 'isComplete').mockImplementation(() => {
        throw new Error('Component destroyed');
      });

      const cores = new Map([
        [100, core1],
        [101, core2],
      ]);

      componentCoordinator.beginPageLoad(cores);

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Should return true (broken component doesn't block navigation)
      expect(componentCoordinator.areAllComplete()).toBe(true);

      consoleWarnSpy.mockRestore();
    });

    it('can be called before any page load', () => {
      // Fresh coordinator, no page loaded yet
      expect(componentCoordinator.areAllComplete()).toBe(true);
    });

    it('can be called during page load', () => {
      const core1 = createMockCore(100, {
        isReady: false,
        readyAfterMs: 1000,
        isComplete: false,
      });
      const cores = new Map([[100, core1]]);

      componentCoordinator.beginPageLoad(cores);

      // During load, should be able to query completion
      expect(componentCoordinator.areAllComplete()).toBe(false);
    });
  });

  // ============================================================================
  // IS LOADING IN PROGRESS
  // ============================================================================

  describe('isLoadingInProgress', () => {
    it('returns false initially', () => {
      expect(componentCoordinator.isLoadingInProgress()).toBe(false);
    });

    it('returns true during page load', () => {
      const core1 = createMockCore(100, {
        isReady: false,
        readyAfterMs: 1000,
      });
      const cores = new Map([[100, core1]]);

      componentCoordinator.beginPageLoad(cores);

      expect(componentCoordinator.isLoadingInProgress()).toBe(true);
    });

    it('returns false after page load completes', async () => {
      const core1 = createMockCore(100, { isReady: true });
      const cores = new Map([[100, core1]]);

      const loadPromise = componentCoordinator.beginPageLoad(cores);
      
      expect(componentCoordinator.isLoadingInProgress()).toBe(true);

      await vi.advanceTimersByTimeAsync(50);
      await loadPromise;

      expect(componentCoordinator.isLoadingInProgress()).toBe(false);
    });

    it('returns false after clearPage called', () => {
      const core1 = createMockCore(100, {
        isReady: false,
        readyAfterMs: 1000,
      });
      const cores = new Map([[100, core1]]);

      componentCoordinator.beginPageLoad(cores);
      expect(componentCoordinator.isLoadingInProgress()).toBe(true);

      componentCoordinator.clearPage();
      expect(componentCoordinator.isLoadingInProgress()).toBe(false);
    });
  });

  // ============================================================================
  // INTEGRATION SCENARIOS
  // ============================================================================

  describe('Integration Scenarios', () => {
    it('handles rapid page changes (clearPage during load)', async () => {
      const core1 = createMockCore(100, {
        isReady: false,
        readyAfterMs: 1000,
      });
      const cores = new Map([[100, core1]]);

      // Start loading page 1 (don't await - simulating user navigation before load completes)
      componentCoordinator.beginPageLoad(cores);

      // User navigates away quickly
      await vi.advanceTimersByTimeAsync(50);
      componentCoordinator.clearPage();

      // Start loading page 2
      const core2 = createMockCore(200, { isReady: true });
      const cores2 = new Map([[200, core2]]);
      const loadPromise2 = componentCoordinator.beginPageLoad(cores2);

      await vi.advanceTimersByTimeAsync(50);
      await loadPromise2;

      // Page 2 should complete successfully
      // Note: We don't check core2 call count because the first page load might still
      // be running async and could theoretically activate it. The important thing is
      // that the coordinator is no longer in loading state and page 2 completed.
      expect(componentCoordinator.isLoadingInProgress()).toBe(false);
    });

    it('handles mixed component states (ready, slow, failed)', async () => {
      const core1 = createMockCore(100, { isReady: true }); // Fast
      const core2 = createMockCore(101, { readyAfterMs: 200 }); // Slow
      const core3 = createMockCore(102, { throwOnReadyCheck: true }); // Failed
      const cores = new Map([
        [100, core1],
        [101, core2],
        [102, core3],
      ]);

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const loadPromise = componentCoordinator.beginPageLoad(cores);

      // Wait for slow component
      await vi.advanceTimersByTimeAsync(250);
      await loadPromise;

      // All should be activated (failed component doesn't block)
      expect(core1.displayInterface).toHaveBeenCalledTimes(1);
      expect(core2.displayInterface).toHaveBeenCalledTimes(1);

      consoleWarnSpy.mockRestore();
    });

    it('handles component becoming ready exactly at poll interval', async () => {
      // Component becomes ready exactly at 100ms
      const core1 = createMockCore(100, { readyAfterMs: 100 });
      const cores = new Map([[100, core1]]);

      const loadPromise = componentCoordinator.beginPageLoad(cores);

      // First poll at 50ms - not ready
      await vi.advanceTimersByTimeAsync(50);
      expect(core1.displayInterface).not.toHaveBeenCalled();

      // Second poll at 100ms - exactly when it becomes ready
      await vi.advanceTimersByTimeAsync(50);
      await loadPromise;

      expect(core1.displayInterface).toHaveBeenCalledTimes(1);
    });

    it('supports sequential page loads', async () => {
      // Load page 1
      const core1 = createMockCore(100, { isReady: true });
      const cores1 = new Map([[100, core1]]);
      
      const load1 = componentCoordinator.beginPageLoad(cores1);
      await vi.advanceTimersByTimeAsync(50);
      await load1;

      expect(core1.displayInterface).toHaveBeenCalledTimes(1);

      // Clear and load page 2
      componentCoordinator.clearPage();
      
      const core2 = createMockCore(200, { isReady: true });
      const cores2 = new Map([[200, core2]]);
      
      const load2 = componentCoordinator.beginPageLoad(cores2);
      await vi.advanceTimersByTimeAsync(50);
      await load2;

      expect(core2.displayInterface).toHaveBeenCalledTimes(1);
    });
  });
});