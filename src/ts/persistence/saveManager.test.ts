/**
 * @fileoverview Comprehensive tests for SaveManager
 * @module persistence/saveManager.test
 * 
 * Tests cover:
 * - State machine logic (saveInProgress, saveHasChanged, lastSaveResult)
 * - Polling cycle behavior at 50ms intervals
 * - Retry logic for failed Pod saves
 * - Concurrent save prevention
 * - Fire-and-forget async coordination
 * - Error handling and critical error display
 * - Online/offline status tracking
 * - Edge cases with timing and rapid queueSave calls
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SaveManager, SaveResult } from './saveManager';
import { PodStorageBundle } from './podStorageSchema';
import * as saveOrchestrator from './saveOrchestrator';
import * as errorDisplay from '../ui/errorDisplay';

// Mock dependencies
vi.mock('./saveOrchestrator');
vi.mock('../ui/errorDisplay');

describe('SaveManager', () => {
  let manager: SaveManager;
  let orchestrateSaveMock: ReturnType<typeof vi.fn>;
  let showCriticalErrorMock: ReturnType<typeof vi.fn>;
  
  const testBundle: PodStorageBundle = {
    metadata: {
      webId: 'https://test.pod/profile/card#me'
    },
    overallProgress: {
      lessonCompletions: { '100': 1234567890, '101': 1234567900 },
      domainsCompleted: [1, 2],
      currentStreak: 5,
      lastStreakCheck: 1234567890
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
      audioEnabled: true
    },
    navigationState: {
      currentEntityId: 1,
      currentPage: 0,
      lastUpdated: 1234567890
    },
    combinedComponentProgress: {
      lessonId: '100',
      lastUpdated: 1234567890,
      components: {
        '1': { checkbox_checked: [true, false, true] },
        '2': { checkbox_checked: [false, false] }
      },
      overallProgress: {
        lessonCompletions: { '100': 1234567890 },
        domainsCompleted: [1],
        currentStreak: 5,
        lastStreakCheck: 1234567890
      }
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    
    // Reset singleton between tests
    (SaveManager as any).instance = undefined;
    
    // Setup mocks
    orchestrateSaveMock = vi.mocked(saveOrchestrator.orchestrateSave);
    orchestrateSaveMock.mockResolvedValue(SaveResult.BothSucceeded);
    
    showCriticalErrorMock = vi.mocked(errorDisplay.showCriticalError);
    showCriticalErrorMock.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('returns same instance on multiple getInstance calls', () => {
      const instance1 = SaveManager.getInstance();
      const instance2 = SaveManager.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('starts polling automatically on first getInstance', () => {
      SaveManager.getInstance();
      
      // Polling should be active - verify by checking save doesn't trigger without queued data
      vi.advanceTimersByTime(50);
      expect(orchestrateSaveMock).not.toHaveBeenCalled();
    });
  });

  describe('Polling Cycle - No Save Conditions', () => {
    beforeEach(() => {
      manager = SaveManager.getInstance();
    });

    it('does not trigger save when nothing queued', () => {
      vi.advanceTimersByTime(50);
      
      expect(orchestrateSaveMock).not.toHaveBeenCalled();
    });

    it('does not trigger save when hasChanged is false and last save succeeded', () => {
      manager.queueSave(testBundle, false);
      
      vi.advanceTimersByTime(50);
      
      expect(orchestrateSaveMock).not.toHaveBeenCalled();
    });

    it('does not trigger concurrent saves', async () => {
      // Setup slow save operation
      orchestrateSaveMock.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(SaveResult.BothSucceeded), 200))
      );
      
      manager.queueSave(testBundle, true);
      
      // First poll cycle triggers save
      vi.advanceTimersByTime(50);
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(1);
      
      // Second poll cycle - save still in progress
      vi.advanceTimersByTime(50);
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(1); // No new save
      
      // Third poll cycle - still in progress
      vi.advanceTimersByTime(50);
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Polling Cycle - Save Triggers', () => {
    beforeEach(() => {
      manager = SaveManager.getInstance();
    });

    it('triggers save when hasChanged is true', () => {
      manager.queueSave(testBundle, true);
      
      vi.advanceTimersByTime(50);
      
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(1);
      expect(orchestrateSaveMock).toHaveBeenCalledWith(
        expect.objectContaining(testBundle),
        expect.any(Number)
      );
    });

    it('passes timestamp to orchestrator', () => {
      const startTime = Date.now();
      manager.queueSave(testBundle, true);
      
      vi.advanceTimersByTime(50);
      
      const callTimestamp = orchestrateSaveMock.mock.calls[0][1];
      expect(callTimestamp).toBeGreaterThanOrEqual(startTime);
      expect(callTimestamp).toBeLessThanOrEqual(Date.now());
    });

    it('clones bundle to prevent mutation during async save', async () => {
      const mutableBundle = { ...testBundle };
      manager.queueSave(mutableBundle, true);
      
      vi.advanceTimersByTime(50);
      
      // Mutate original after save started
      mutableBundle.overallProgress.currentStreak = 999;
      
      // Verify orchestrator received original values
      const savedBundle = orchestrateSaveMock.mock.calls[0][0];
      expect(savedBundle.overallProgress.currentStreak).toBe(5);
    });

    it('clears hasChanged flag to prevent repeated saves', async () => {
      manager.queueSave(testBundle, true);
      
      // First poll triggers save
      vi.advanceTimersByTime(50);
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(1);
      
      // Complete the async save
      await vi.runOnlyPendingTimersAsync();
      
      // Second poll should not trigger another save
      vi.advanceTimersByTime(50);
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Retry Logic - Failed Pod Saves', () => {
    beforeEach(() => {
      manager = SaveManager.getInstance();
      // Clear call history but keep the mock implementation
      orchestrateSaveMock.mockClear();
    });

    it('retries when last save was OnlyLocalSucceeded', async () => {
      orchestrateSaveMock.mockResolvedValueOnce(SaveResult.OnlyLocalSucceeded);
      
      // First attempt - Pod fails
      manager.queueSave(testBundle, true);
      vi.advanceTimersByTime(50);
      
      // Wait for the promise to resolve (no timer advancement)
      await Promise.resolve();
      await Promise.resolve();
      
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(1);
      
      // Setup next attempt to succeed
      orchestrateSaveMock.mockResolvedValueOnce(SaveResult.BothSucceeded);
      
      // Queue same bundle with hasChanged=false
      manager.queueSave(testBundle, false);
      
      // Should trigger retry despite hasChanged=false
      vi.advanceTimersByTime(50);
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(2);
    });

    it('retries when last save was BothFailed', async () => {
      orchestrateSaveMock.mockResolvedValueOnce(SaveResult.BothFailed);
      
      manager.queueSave(testBundle, true);
      vi.advanceTimersByTime(50);
      await vi.runOnlyPendingTimersAsync();
      
      orchestrateSaveMock.mockResolvedValueOnce(SaveResult.BothSucceeded);
      manager.queueSave(testBundle, false);
      
      vi.advanceTimersByTime(50);
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(2);
    });

    it('does not retry when last save was BothSucceeded', async () => {
      orchestrateSaveMock.mockResolvedValueOnce(SaveResult.BothSucceeded);
      
      manager.queueSave(testBundle, true);
      vi.advanceTimersByTime(50);
      await vi.runOnlyPendingTimersAsync();
      
      // Queue with hasChanged=false
      manager.queueSave(testBundle, false);
      vi.advanceTimersByTime(50);
      
      // Should not trigger save
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('State Machine - Multiple Queued Saves', () => {
    beforeEach(() => {
      manager = SaveManager.getInstance();
    });

    it('handles rapid queueSave calls during active save', async () => {
      let resolveFirstSave!: (result: SaveResult) => void;
      const firstSavePromise = new Promise<SaveResult>(resolve => {
        resolveFirstSave = resolve;
      });
      orchestrateSaveMock.mockReturnValueOnce(firstSavePromise);
      
      // Queue first save
      manager.queueSave(testBundle, true);
      vi.advanceTimersByTime(50);
      
      // Save is now in progress - queue another with changes
      const updatedBundle = { ...testBundle, overallProgress: { ...testBundle.overallProgress, currentStreak: 6 } };
      manager.queueSave(updatedBundle, true);
      
      // Should not trigger concurrent save
      vi.advanceTimersByTime(50);
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(1);
      
      // Setup second save mock
      orchestrateSaveMock.mockResolvedValueOnce(SaveResult.BothSucceeded);
      
      // Complete first save
      resolveFirstSave(SaveResult.OnlyLocalSucceeded);
      await Promise.resolve();
      await Promise.resolve();
      
      // Now second save can proceed (triggered by retry logic)
      vi.advanceTimersByTime(50);
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(2);
      
      // Verify second save got updated bundle
      const secondCallBundle = orchestrateSaveMock.mock.calls[1][0];
      expect(secondCallBundle.overallProgress.currentStreak).toBe(6);
    });

    it('overwrites queued bundle on subsequent queueSave calls', () => {
      const bundle1 = { ...testBundle, overallProgress: { ...testBundle.overallProgress, currentStreak: 5 } };
      const bundle2 = { ...testBundle, overallProgress: { ...testBundle.overallProgress, currentStreak: 6 } };
      const bundle3 = { ...testBundle, overallProgress: { ...testBundle.overallProgress, currentStreak: 7 } };
      
      manager.queueSave(bundle1, true);
      manager.queueSave(bundle2, true);
      manager.queueSave(bundle3, true);
      
      vi.advanceTimersByTime(50);
      
      // Only latest bundle should be saved
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(1);
      const savedBundle = orchestrateSaveMock.mock.calls[0][0];
      expect(savedBundle.overallProgress.currentStreak).toBe(7);
    });
  });

  describe('Online Status Tracking', () => {
    beforeEach(() => {
      manager = SaveManager.getInstance();
    });

    it('returns true when BothSucceeded', async () => {
      orchestrateSaveMock.mockResolvedValue(SaveResult.BothSucceeded);
      
      manager.queueSave(testBundle, true);
      vi.advanceTimersByTime(50);
      await vi.runOnlyPendingTimersAsync();
      
      expect(manager.getOnlineStatus()).toBe(true);
    });

    it('returns true when OnlySolidSucceeded', async () => {
      orchestrateSaveMock.mockResolvedValue(SaveResult.OnlySolidSucceeded);
      
      manager.queueSave(testBundle, true);
      vi.advanceTimersByTime(50);
      await vi.runOnlyPendingTimersAsync();
      
      expect(manager.getOnlineStatus()).toBe(true);
    });

    it('returns false when OnlyLocalSucceeded', async () => {
      orchestrateSaveMock.mockResolvedValue(SaveResult.OnlyLocalSucceeded);
      
      manager.queueSave(testBundle, true);
      vi.advanceTimersByTime(50);
      await vi.runOnlyPendingTimersAsync();
      
      expect(manager.getOnlineStatus()).toBe(false);
    });

    it('returns false when BothFailed', async () => {
      orchestrateSaveMock.mockResolvedValue(SaveResult.BothFailed);
      
      manager.queueSave(testBundle, true);
      vi.advanceTimersByTime(50);
      await vi.runOnlyPendingTimersAsync();
      
      expect(manager.getOnlineStatus()).toBe(false);
    });

    it('starts true by default (optimistic)', () => {
      expect(manager.getOnlineStatus()).toBe(true);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      manager = SaveManager.getInstance();
    });

    it('logs warning when OnlySolidSucceeded (localStorage failure)', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      orchestrateSaveMock.mockResolvedValue(SaveResult.OnlySolidSucceeded);
      
      manager.queueSave(testBundle, true);
      vi.advanceTimersByTime(50);
      await vi.runOnlyPendingTimersAsync();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '⚠️ localStorage save failed - offline mode unavailable'
      );
      
      consoleErrorSpy.mockRestore();
    });

    it('shows critical error when orchestrator throws', async () => {
      orchestrateSaveMock.mockRejectedValue(new Error('Orchestrator bug'));
      
      manager.queueSave(testBundle, true);
      vi.advanceTimersByTime(50);
      await vi.runOnlyPendingTimersAsync();
      
      expect(showCriticalErrorMock).toHaveBeenCalledWith({
        title: 'Save System Failure',
        message: 'Progress is not being saved.',
        technicalDetails: expect.stringContaining('Orchestrator bug'),
        errorCode: 'save-system-failure'
      });
    });

    it('sets lastSaveResult to BothFailed when orchestrator throws', async () => {
      orchestrateSaveMock.mockRejectedValue(new Error('Orchestrator bug'));
      
      manager.queueSave(testBundle, true);
      vi.advanceTimersByTime(50);
      await vi.runOnlyPendingTimersAsync();
      
      expect(manager.getOnlineStatus()).toBe(false);
    });

    it('releases saveInProgress lock when orchestrator throws', async () => {
      orchestrateSaveMock
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValueOnce(SaveResult.BothSucceeded);
      
      // First save throws
      manager.queueSave(testBundle, true);
      vi.advanceTimersByTime(50);
      await Promise.resolve();
      await Promise.resolve();
      
      // Second save should be able to proceed (lock released)
      manager.queueSave(testBundle, true);
      vi.advanceTimersByTime(50);
      
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(2);
    });

    it('continues polling after orchestrator error', async () => {
      orchestrateSaveMock
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce(SaveResult.BothSucceeded);
      
      // First save fails
      manager.queueSave(testBundle, true);
      vi.advanceTimersByTime(50);
      await Promise.resolve();
      await Promise.resolve();
      
      // Polling continues
      vi.advanceTimersByTime(50);
      vi.advanceTimersByTime(50);
      
      // Second save succeeds
      manager.queueSave(testBundle, true);
      vi.advanceTimersByTime(50);
      
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('Fire-and-Forget Architecture', () => {
    beforeEach(() => {
      manager = SaveManager.getInstance();
    });

    it('queueSave returns immediately without blocking', () => {
      orchestrateSaveMock.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve(SaveResult.BothSucceeded), 1000))
      );
      
      const startTime = Date.now();
      manager.queueSave(testBundle, true);
      const endTime = Date.now();
      
      // Should return instantly
      expect(endTime - startTime).toBeLessThan(10);
    });

    it('polling cycle does not block on async save', async () => {
      orchestrateSaveMock.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve(SaveResult.BothSucceeded), 1000))
      );
      
      manager.queueSave(testBundle, true);
      
      // Trigger save
      vi.advanceTimersByTime(50);
      
      // Advance time - polling continues
      vi.advanceTimersByTime(50);
      vi.advanceTimersByTime(50);
      vi.advanceTimersByTime(50);
      
      // Save hasn't completed yet, but polling continues
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(1);
      
      // Complete the save
      await vi.runOnlyPendingTimersAsync();
      
      // Verify save eventually completed
      expect(manager.getOnlineStatus()).toBe(true);
    });
  });

  describe('Edge Cases and Timing', () => {
    beforeEach(() => {
      manager = SaveManager.getInstance();
    });

    it('handles queueSave called exactly when poll cycle runs', () => {
      let pollExecuted = false;
      
      orchestrateSaveMock.mockImplementation(() => {
        pollExecuted = true;
        return Promise.resolve(SaveResult.BothSucceeded);
      });
      
      // Queue just before poll
      manager.queueSave(testBundle, true);
      
      // Poll cycle runs
      vi.advanceTimersByTime(50);
      
      expect(pollExecuted).toBe(true);
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(1);
    });

    it('handles very rapid sequential queueSave calls', () => {
      for (let i = 0; i < 100; i++) {
        const bundle = { ...testBundle, overallProgress: { ...testBundle.overallProgress, currentStreak: i } };
        manager.queueSave(bundle, true);
      }
      
      vi.advanceTimersByTime(50);
      
      // Only latest bundle saved
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(1);
      const savedBundle = orchestrateSaveMock.mock.calls[0][0];
      expect(savedBundle.overallProgress.currentStreak).toBe(99);
    });

    it('maintains correct state through multiple save cycles', async () => {
      // Cycle 1: Success
      orchestrateSaveMock.mockResolvedValueOnce(SaveResult.BothSucceeded);
      manager.queueSave(testBundle, true);
      vi.advanceTimersByTime(50);
      await Promise.resolve();
      await Promise.resolve();
      expect(manager.getOnlineStatus()).toBe(true);
      
      // Cycle 2: Offline (this will trigger retry on next queue)
      orchestrateSaveMock.mockResolvedValueOnce(SaveResult.OnlyLocalSucceeded);
      manager.queueSave(testBundle, true);
      vi.advanceTimersByTime(50);
      await Promise.resolve();
      await Promise.resolve();
      expect(manager.getOnlineStatus()).toBe(false);
      
      // Cycle 3: Recovery (retry triggered even with hasChanged=false)
      orchestrateSaveMock.mockResolvedValueOnce(SaveResult.BothSucceeded);
      manager.queueSave(testBundle, false); // hasChanged=false but should retry
      vi.advanceTimersByTime(50);
      await Promise.resolve();
      await Promise.resolve();
      expect(manager.getOnlineStatus()).toBe(true);
      
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(3);
    });

    it('handles save completion exactly at next poll cycle boundary', async () => {
      let saveCompleted = false;
      
      orchestrateSaveMock.mockImplementation(() =>
        new Promise(resolve => {
          setTimeout(() => {
            saveCompleted = true;
            resolve(SaveResult.BothSucceeded);
          }, 50);
        })
      );
      
      manager.queueSave(testBundle, true);
      vi.advanceTimersByTime(50); // Trigger save
      
      expect(saveCompleted).toBe(false);
      
      await vi.advanceTimersByTimeAsync(50); // Save completes
      
      expect(saveCompleted).toBe(true);
      expect(manager.getOnlineStatus()).toBe(true);
    });
  });

  describe('Architectural Contracts', () => {
    beforeEach(() => {
      manager = SaveManager.getInstance();
    });

    it('preserves 50ms polling interval', () => {
      manager.queueSave(testBundle, true);
      
      vi.advanceTimersByTime(49);
      expect(orchestrateSaveMock).not.toHaveBeenCalled();
      
      vi.advanceTimersByTime(1);
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(1);
    });

    it('maintains singleton pattern across test lifecycle', () => {
      const instance1 = SaveManager.getInstance();
      vi.advanceTimersByTime(50);
      
      const instance2 = SaveManager.getInstance();
      vi.advanceTimersByTime(50);
      
      expect(instance1).toBe(instance2);
    });
  });
});