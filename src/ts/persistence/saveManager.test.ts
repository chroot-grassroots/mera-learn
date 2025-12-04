/**
 * @fileoverview Comprehensive tests for SaveManager
 * @module persistence/saveManager.test
 * 
 * Tests cover:
 * - State machine logic (saveInProgress, saveHasChanged, lastSaveResult)
 * - Polling cycle behavior at 50ms intervals
 * - Retry logic for failed Pod saves
 * - Concurrent save prevention
 * - Sequential polling coordination
 * - Error handling and critical error display
 * - Online/offline status tracking
 * - Edge cases with timing and rapid queueSave calls
 * - Concurrent session detection (tamper-detection tripwire)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PodStorageBundle } from './podStorageSchema';
import * as saveOrchestrator from './saveOrchestrator';
import * as errorDisplay from '../ui/errorDisplay';

// Mock dependencies BEFORE importing SaveManager
vi.mock('./saveOrchestrator');
vi.mock('../ui/errorDisplay');
vi.mock('../solid/meraBridge', () => {
  return {
    MeraBridge: {
      getInstance: vi.fn()
    }
  };
});

// Import SaveManager AFTER mocks are set up
import { SaveManager, SaveResult } from './saveManager';
import { MeraBridge } from '../solid/meraBridge';

describe('SaveManager', () => {
  let manager: SaveManager;
  let orchestrateSaveMock: ReturnType<typeof vi.fn>;
  let showCriticalErrorMock: ReturnType<typeof vi.fn>;
  let mockBridge: any;
  
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

  // Pre-stringify the test bundle for use in tests
  const testBundleJSON = JSON.stringify(testBundle);

  // Session ID that will be returned by mocked session file
  const mockSessionId = 'a'.repeat(32); // 128-bit hex string

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    
    // Reset singleton between tests
    (SaveManager as any).instance = undefined;
    
    // Setup MeraBridge mock
    mockBridge = {
      solidSave: vi.fn(),
      solidLoad: vi.fn(),
      solidDelete: vi.fn(),
    };
    vi.mocked(MeraBridge.getInstance).mockReturnValue(mockBridge);

    // Capture the actual session ID written by SaveManager
    let capturedSessionData: string | null = null;
    
    // Setup default mock for session file operations
    mockBridge.solidSave.mockImplementation(async (filename: string, data: string) => {
      // Capture session file data when written
      if (filename === 'mera_concurrent_session_protection.json') {
        capturedSessionData = data;
      }
      return { success: true };
    });

    mockBridge.solidLoad.mockImplementation(async (filename: string) => {
      if (filename === 'mera_concurrent_session_protection.json') {
        // Return the captured session data (what was actually written)
        if (capturedSessionData) {
          return { 
            success: true, 
            data: capturedSessionData
          };
        }
        // Fallback if nothing captured yet
        return { 
          success: true, 
          data: JSON.stringify({ sessionId: mockSessionId })
        };
      }
      return { success: true, data: '{}' };
    });
    
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
      manager.queueSave(testBundleJSON, false);
      
      vi.advanceTimersByTime(50);
      
      expect(orchestrateSaveMock).not.toHaveBeenCalled();
    });

    it('does not trigger concurrent saves', async () => {
      // Setup slow save operation
      orchestrateSaveMock.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(SaveResult.BothSucceeded), 200))
      );
      
      manager.queueSave(testBundleJSON, true);
      
      // First poll cycle triggers save
      await vi.advanceTimersByTimeAsync(100);
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

    it('triggers save when hasChanged is true', async () => {
      manager.queueSave(testBundleJSON, true);
      
      await vi.advanceTimersByTimeAsync(100);
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(1);
      expect(orchestrateSaveMock).toHaveBeenCalledWith(
        testBundleJSON,
        expect.any(Number),
        true  // allowSolidSaves should be true when session check passes
      );
    });

    it('passes timestamp to orchestrator', async () => {
      const startTime = Date.now();
      manager.queueSave(testBundleJSON, true);
      
      await vi.advanceTimersByTimeAsync(100);
      const callTimestamp = orchestrateSaveMock.mock.calls[0][1];
      expect(callTimestamp).toBeGreaterThanOrEqual(startTime);
      expect(callTimestamp).toBeLessThanOrEqual(Date.now());
    });

    it('passes string reference without cloning (strings are immutable)', async () => {
      manager.queueSave(testBundleJSON, true);
      
      await vi.advanceTimersByTimeAsync(100);
      // Verify orchestrator received the same string reference
      const savedString = orchestrateSaveMock.mock.calls[0][0];
      expect(savedString).toBe(testBundleJSON);
    });

    it('clears hasChanged flag to prevent repeated saves', async () => {
      manager.queueSave(testBundleJSON, true);
      
      // First poll triggers save
      await vi.advanceTimersByTimeAsync(100);
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(1);
      
      // Complete the async save
      await vi.advanceTimersByTimeAsync(100);
      
      // Second poll should not trigger another save
      vi.advanceTimersByTime(50);
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Retry Logic - Failed Pod Saves', () => {
    beforeEach(() => {
      manager = SaveManager.getInstance();
    });

    it('retries when last save was OnlyLocalSucceeded', async () => {
      // First save fails Pod
      orchestrateSaveMock.mockResolvedValueOnce(SaveResult.OnlyLocalSucceeded);
      
      manager.queueSave(testBundleJSON, true);
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(1);
      
      // Setup next attempt to succeed
      orchestrateSaveMock.mockResolvedValueOnce(SaveResult.BothSucceeded);
      
      // Don't queue new data, but retry should still trigger
      await vi.advanceTimersByTimeAsync(100);
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(2);
    });

    it('retries when last save was BothFailed', async () => {
      // First attempt fails completely
      orchestrateSaveMock.mockResolvedValueOnce(SaveResult.BothFailed);
      
      manager.queueSave(testBundleJSON, true);
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      
      // Setup second attempt
      orchestrateSaveMock.mockResolvedValueOnce(SaveResult.BothSucceeded);
      
      // Retry should trigger automatically
      await vi.advanceTimersByTimeAsync(100);
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(2);
    });

    it('does not retry when last save was BothSucceeded', async () => {
      orchestrateSaveMock.mockResolvedValueOnce(SaveResult.BothSucceeded);
      
      manager.queueSave(testBundleJSON, true);
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      
      // Queue new data but with hasChanged=false
      manager.queueSave(testBundleJSON, false);
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
      
      // Create different bundle JSONs
      const bundle1JSON = JSON.stringify({ ...testBundle, overallProgress: { ...testBundle.overallProgress, currentStreak: 5 } });
      const bundle2JSON = JSON.stringify({ ...testBundle, overallProgress: { ...testBundle.overallProgress, currentStreak: 6 } });
      
      // Queue first save
      manager.queueSave(bundle1JSON, true);
      await vi.advanceTimersByTimeAsync(100);
      // Save is now in progress - queue another with changes
      manager.queueSave(bundle2JSON, true);
      
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
      await vi.advanceTimersByTimeAsync(100);
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(2);
      
      // Verify second save got updated bundle
      const secondCallBundle = orchestrateSaveMock.mock.calls[1][0];
      expect(secondCallBundle).toBe(bundle2JSON);
    });

    it('overwrites queued bundle on subsequent queueSave calls', async () => {
      const bundle1JSON = JSON.stringify({ ...testBundle, overallProgress: { ...testBundle.overallProgress, currentStreak: 5 } });
      const bundle2JSON = JSON.stringify({ ...testBundle, overallProgress: { ...testBundle.overallProgress, currentStreak: 6 } });
      const bundle3JSON = JSON.stringify({ ...testBundle, overallProgress: { ...testBundle.overallProgress, currentStreak: 7 } });
      
      manager.queueSave(bundle1JSON, true);
      manager.queueSave(bundle2JSON, true);
      manager.queueSave(bundle3JSON, true);
      
      await vi.advanceTimersByTimeAsync(100);
      // Only latest bundle should be saved
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(1);
      const savedBundle = orchestrateSaveMock.mock.calls[0][0];
      expect(savedBundle).toBe(bundle3JSON);
    });
  });

  describe('Online Status Tracking', () => {
    beforeEach(() => {
      manager = SaveManager.getInstance();
    });

    it('returns true when BothSucceeded', async () => {
      orchestrateSaveMock.mockResolvedValue(SaveResult.BothSucceeded);
      
      manager.queueSave(testBundleJSON, true);
      vi.advanceTimersByTime(50);
      await vi.advanceTimersByTimeAsync(100);
      
      expect(manager.getOnlineStatus()).toBe(true);
    });

    it('returns true when OnlySolidSucceeded', async () => {
      orchestrateSaveMock.mockResolvedValue(SaveResult.OnlySolidSucceeded);
      
      manager.queueSave(testBundleJSON, true);
      vi.advanceTimersByTime(50);
      await vi.advanceTimersByTimeAsync(100);
      
      expect(manager.getOnlineStatus()).toBe(true);
    });

    it('returns false when OnlyLocalSucceeded', async () => {
      orchestrateSaveMock.mockResolvedValue(SaveResult.OnlyLocalSucceeded);
      
      manager.queueSave(testBundleJSON, true);
      vi.advanceTimersByTime(50);
      await vi.advanceTimersByTimeAsync(100);
      
      expect(manager.getOnlineStatus()).toBe(false);
    });

    it('returns false when BothFailed', async () => {
      orchestrateSaveMock.mockResolvedValue(SaveResult.BothFailed);
      
      manager.queueSave(testBundleJSON, true);
      vi.advanceTimersByTime(50);
      await vi.advanceTimersByTimeAsync(100);
      
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
      
      manager.queueSave(testBundleJSON, true);
      vi.advanceTimersByTime(50);
      await vi.advanceTimersByTimeAsync(100);
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '⚠️ localStorage save failed - offline mode unavailable'
      );
      
      consoleErrorSpy.mockRestore();
    });

    it('shows critical error when orchestrator throws', async () => {
      orchestrateSaveMock.mockRejectedValue(new Error('Orchestrator bug'));
      
      manager.queueSave(testBundleJSON, true);
      vi.advanceTimersByTime(50);
      await vi.advanceTimersByTimeAsync(100);
      
      expect(showCriticalErrorMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Save System Failure',
          message: 'Progress is not being saved.',
          errorCode: 'save-orchestration-failure'
        })
      );
    });

    it('sets lastSaveResult to BothFailed when orchestrator throws', async () => {
      orchestrateSaveMock.mockRejectedValue(new Error('Orchestrator bug'));
      
      manager.queueSave(testBundleJSON, true);
      vi.advanceTimersByTime(50);
      await vi.advanceTimersByTimeAsync(100);
      
      expect(manager.getOnlineStatus()).toBe(false);
    });

    it('releases saveInProgress lock when orchestrator throws', async () => {
      orchestrateSaveMock
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValueOnce(SaveResult.BothSucceeded);
      
      // First save throws
      manager.queueSave(testBundleJSON, true);
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      
      // Second save should be able to proceed (lock released)
      manager.queueSave(testBundleJSON, true);
      await vi.advanceTimersByTimeAsync(100);
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(2);
    });

    it('continues polling after orchestrator error', async () => {
      orchestrateSaveMock
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce(SaveResult.BothSucceeded);
      
      // First save fails (first save has session init)
      manager.queueSave(testBundleJSON, true);
      await vi.advanceTimersByTimeAsync(100); // Poll at 50ms + session init 50ms
      
      // Second save succeeds
      manager.queueSave(testBundleJSON, true);
      await vi.advanceTimersByTimeAsync(50); // Next poll (no session init needed)
      
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('Sequential Polling Architecture', () => {
    beforeEach(() => {
      manager = SaveManager.getInstance();
    });

    it('queueSave returns immediately without blocking', () => {
      orchestrateSaveMock.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve(SaveResult.BothSucceeded), 1000))
      );
      
      const startTime = Date.now();
      manager.queueSave(testBundleJSON, true);
      const endTime = Date.now();
      
      // Should return instantly
      expect(endTime - startTime).toBeLessThan(10);
    });

    it('polling waits for save to complete before next cycle', async () => {
      let saveStarted = false;
      let saveCompleted = false;
      
      orchestrateSaveMock.mockImplementation(async () => {
        saveStarted = true;
        await new Promise(resolve => setTimeout(resolve, 100));
        saveCompleted = true;
        return SaveResult.BothSucceeded;
      });
      
      manager.queueSave(testBundleJSON, true);
      
      // Start first poll cycle (poll at 50ms, session init takes 50ms, orchestrate starts at ~100ms)
      await vi.advanceTimersByTimeAsync(100);
      expect(saveStarted).toBe(true);
      expect(saveCompleted).toBe(false); // Save still running
      
      // Advance to complete the save
      await vi.advanceTimersByTimeAsync(100);
      expect(saveCompleted).toBe(true);
      expect(manager.getOnlineStatus()).toBe(true);
      
      // Next poll cycle can now run
      orchestrateSaveMock.mockResolvedValueOnce(SaveResult.BothSucceeded);
      manager.queueSave(testBundleJSON, true);
      await vi.advanceTimersByTimeAsync(50); // Next poll (no session init)
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('Edge Cases and Timing', () => {
    beforeEach(() => {
      manager = SaveManager.getInstance();
    });

    it('handles queueSave called exactly when poll cycle runs', async () => {
      let pollExecuted = false;
      
      orchestrateSaveMock.mockImplementation(() => {
        pollExecuted = true;
        return Promise.resolve(SaveResult.BothSucceeded);
      });
      
      // Queue just before poll
      manager.queueSave(testBundleJSON, true);
      
      // Poll cycle runs at t=50ms, session check takes 50ms, orchestrate at t=100ms+
      await vi.advanceTimersByTimeAsync(100);
      
      expect(pollExecuted).toBe(true);
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(1);
    });

    it('handles very rapid sequential queueSave calls', async () => {
      const bundles: string[] = [];
      for (let i = 0; i < 100; i++) {
        const bundle = { ...testBundle, overallProgress: { ...testBundle.overallProgress, currentStreak: i } };
        bundles.push(JSON.stringify(bundle));
        manager.queueSave(bundles[i], true);
      }
      
      // Poll at t=50ms, session check takes 50ms, orchestrate at t=100ms+
      await vi.advanceTimersByTimeAsync(100);
      
      // Only latest bundle saved
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(1);
      const savedBundle = orchestrateSaveMock.mock.calls[0][0];
      expect(savedBundle).toBe(bundles[99]);
    });

    it('maintains correct state through multiple save cycles', async () => {
      // Cycle 1: Success (first save has session init overhead)
      orchestrateSaveMock.mockResolvedValueOnce(SaveResult.BothSucceeded);
      manager.queueSave(testBundleJSON, true);
      await vi.advanceTimersByTimeAsync(100); // Poll + session init
      expect(manager.getOnlineStatus()).toBe(true);
      
      // Cycle 2: Offline (subsequent saves are faster, no session init)
      orchestrateSaveMock.mockResolvedValueOnce(SaveResult.OnlyLocalSucceeded);
      manager.queueSave(testBundleJSON, true);
      await vi.advanceTimersByTimeAsync(50); // Just the poll
      expect(manager.getOnlineStatus()).toBe(false);
      
      // Cycle 3: Recovery (retry triggered even with hasChanged=false)
      orchestrateSaveMock.mockResolvedValueOnce(SaveResult.BothSucceeded);
      manager.queueSave(testBundleJSON, false); // hasChanged=false but should retry
      await vi.advanceTimersByTimeAsync(50);
      expect(manager.getOnlineStatus()).toBe(true);
      
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(3);
    });

    it('handles save completion exactly at next poll cycle boundary', async () => {
      let saveCompleted = false;
      
      orchestrateSaveMock.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        saveCompleted = true;
        return SaveResult.BothSucceeded;
      });
      
      manager.queueSave(testBundleJSON, true);
      
      // Trigger poll at 50ms, session init takes 50ms more, orchestrate starts at ~100ms
      await vi.advanceTimersByTimeAsync(100);
      expect(saveCompleted).toBe(false); // orchestrate's setTimeout not yet complete
      
      // Complete the orchestrate's 50ms setTimeout
      await vi.advanceTimersByTimeAsync(50);
      
      expect(saveCompleted).toBe(true);
      expect(manager.getOnlineStatus()).toBe(true);
    });
  });

  describe('Architectural Contracts', () => {
    beforeEach(() => {
      manager = SaveManager.getInstance();
    });

    it('preserves 50ms polling interval', async () => {
      manager.queueSave(testBundleJSON, true);
      
      await vi.advanceTimersByTimeAsync(49);
      expect(orchestrateSaveMock).not.toHaveBeenCalled();
      
      // Poll fires at 50ms, session check takes 50ms more
      await vi.advanceTimersByTimeAsync(51); // Now at 100ms total
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

  describe('Concurrent Session Protection', () => {
    beforeEach(() => {
      manager = SaveManager.getInstance();
    });

    it('writes session ID on first save attempt', async () => {
      manager.queueSave(testBundleJSON, true);
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      
      // Verify session file was written
      expect(mockBridge.solidSave).toHaveBeenCalledWith(
        'mera_concurrent_session_protection.json',
        expect.stringContaining('sessionId')
      );
    });

    it('verifies session ID after writing', async () => {
      manager.queueSave(testBundleJSON, true);
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      
      // Verify session file was read back for verification
      expect(mockBridge.solidLoad).toHaveBeenCalledWith(
        'mera_concurrent_session_protection.json'
      );
    });

    it('checks session ID on subsequent saves', async () => {
      // First save
      manager.queueSave(testBundleJSON, true);
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      
      const firstSaveCallCount = mockBridge.solidLoad.mock.calls.length;
      
      // Second save
      orchestrateSaveMock.mockResolvedValueOnce(SaveResult.BothSucceeded);
      manager.queueSave(testBundleJSON, true);
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      
      // Should have checked session ID again
      expect(mockBridge.solidLoad.mock.calls.length).toBeGreaterThan(firstSaveCallCount);
    });

    it('detects concurrent session when session ID changes', async () => {
      // First save succeeds
      orchestrateSaveMock.mockResolvedValueOnce(SaveResult.BothSucceeded);
      manager.queueSave(testBundleJSON, true);
      await vi.advanceTimersByTimeAsync(100); // Poll at 50ms + session check 50ms
      
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(1);
      
      // Simulate another device/tab changing the session ID
      const differentSessionId = 'b'.repeat(32);
      mockBridge.solidLoad.mockImplementation(async (filename: string) => {
        if (filename === 'mera_concurrent_session_protection.json') {
          return { 
            success: true, 
            data: JSON.stringify({ sessionId: differentSessionId })
          };
        }
        return { success: true, data: '{}' };
      });
      
      // Attempt second save - should detect concurrent session
      manager.queueSave(testBundleJSON, true);
      await vi.advanceTimersByTimeAsync(50); // Next poll at t=150ms (50ms after first save completed)
      
      // Should have shown concurrent session error
      expect(showCriticalErrorMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Concurrent Session Detected',
          errorCode: 'concurrent-session'
        })
      );
      
      // Should NOT have called orchestrateSave again (early return before orchestration)
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(1);
    });

    it('handles session file write failures with retry', async () => {
      let writeAttempts = 0;
      mockBridge.solidSave.mockImplementation(async (filename: string) => {
        if (filename === 'mera_concurrent_session_protection.json') {
          writeAttempts++;
          if (writeAttempts < 3) {
            throw new Error('Network error');
          }
          return { success: true };
        }
        return { success: true };
      });
      
      manager.queueSave(testBundleJSON, true);
      vi.advanceTimersByTime(50);
      
      // Wait for retries with exponential backoff
      await Promise.resolve();
      vi.advanceTimersByTime(50); // First retry
      await Promise.resolve();
      vi.advanceTimersByTime(100); // Second retry
      await Promise.resolve();
      vi.advanceTimersByTime(200); // Third attempt succeeds
      await Promise.resolve();
      
      // Should have retried
      expect(writeAttempts).toBeGreaterThan(1);
    });

    it('fails initialization after max retry attempts', async () => {
      // Make session file write always fail
      mockBridge.solidSave.mockImplementation(async (filename: string) => {
        if (filename === 'mera_concurrent_session_protection.json') {
          throw new Error('Persistent network failure');
        }
        return { success: true };
      });
      
      manager.queueSave(testBundleJSON, true);
      
      // Trigger poll and wait through all retry attempts
      // Retries happen at: 50, 100, 200, 400, 800ms (exponential backoff)
      await vi.advanceTimersByTimeAsync(50);  // Initial attempt
      await vi.advanceTimersByTimeAsync(50);  // Retry 1
      await vi.advanceTimersByTimeAsync(100); // Retry 2
      await vi.advanceTimersByTimeAsync(200); // Retry 3
      await vi.advanceTimersByTimeAsync(400); // Retry 4
      await vi.advanceTimersByTimeAsync(800); // Retry 5
      await vi.advanceTimersByTimeAsync(100); // Buffer for completion
      
      // Should have shown initialization failure error
      expect(showCriticalErrorMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Save System Failure',
          errorCode: 'session-init-failure'
        })
      );
      
      // Should NOT have called orchestrateSave (early return after init failure)
      expect(orchestrateSaveMock).not.toHaveBeenCalled();
    });

    it('continues save if session check read fails (graceful degradation)', async () => {
      // First save succeeds
      manager.queueSave(testBundleJSON, true);
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      
      // On second save, session read fails
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockBridge.solidLoad.mockImplementation(async (filename: string) => {
        if (filename === 'mera_concurrent_session_protection.json') {
          throw new Error('Network timeout');
        }
        return { success: true, data: '{}' };
      });
      
      orchestrateSaveMock.mockResolvedValueOnce(SaveResult.BothSucceeded);
      manager.queueSave(testBundleJSON, true);
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      
      // Should have logged warning about blocking solid saves
      expect(consoleWarnSpy).toHaveBeenCalled();
      
      // Should have continued with save, but with allowSolidSaves=false
      expect(orchestrateSaveMock).toHaveBeenCalledTimes(2);
      expect(orchestrateSaveMock).toHaveBeenLastCalledWith(
        testBundleJSON,
        expect.any(Number),
        false  // allowSolidSaves should be false when network error occurs
      );
      
      consoleWarnSpy.mockRestore();
    });

    it('passes allowSolidSaves=true when session check passes', async () => {
      manager.queueSave(testBundleJSON, true);
      await vi.advanceTimersByTimeAsync(100);
      
      expect(orchestrateSaveMock).toHaveBeenCalledWith(
        testBundleJSON,
        expect.any(Number),
        true  // Session check passed, allow solid saves
      );
    });

    it('shows correct error for verification failure during initialization', async () => {
      // Write succeeds but read-back shows different session ID (concurrent session during init)
      let writeCount = 0;
      const initialSessionId = JSON.stringify({ sessionId: 'original-id' });
      const overwrittenSessionId = JSON.stringify({ sessionId: 'overwritten-id' });
      
      mockBridge.solidSave.mockImplementation(async (filename: string, data: string) => {
        if (filename === 'mera_concurrent_session_protection.json') {
          writeCount++;
          return { success: true };
        }
        return { success: true };
      });
      
      mockBridge.solidLoad.mockImplementation(async (filename: string) => {
        if (filename === 'mera_concurrent_session_protection.json') {
          // Return different ID than what was written
          return { 
            success: true, 
            data: overwrittenSessionId 
          };
        }
        return { success: true, data: '{}' };
      });
      
      manager.queueSave(testBundleJSON, true);
      await vi.advanceTimersByTimeAsync(150); // Poll + write + pause + verification
      
      // Should detect concurrent session during initialization
      expect(showCriticalErrorMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Concurrent Session Detected',
          errorCode: 'concurrent-session'
        })
      );
      
      expect(orchestrateSaveMock).not.toHaveBeenCalled();
    });
  });
});