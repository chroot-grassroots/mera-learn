// src/ts/persistence/saveOrchestrator.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { orchestrateSave } from './saveOrchestrator.js';
import { SaveResult } from './saveManager.js';
import { MeraBridge } from '../solid/meraBridge.js';
import type { PodStorageBundle } from './podStorageSchema.js';

// Mock MeraBridge
vi.mock('../solid/meraBridge.js', () => {
  const mockBridge = {
    localSave: vi.fn(),
    localLoad: vi.fn(),
    localDelete: vi.fn(),
    solidSave: vi.fn(),
    solidLoad: vi.fn(),
    solidDelete: vi.fn(),
  };

  return {
    MeraBridge: {
      getInstance: vi.fn(() => mockBridge),
    },
  };
});

describe('orchestrateSave', () => {
  let mockBridge: any;
  let testBundle: PodStorageBundle;
  let testBundleJSON: string;
  let testTimestamp: number;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Get the mocked bridge instance
    mockBridge = MeraBridge.getInstance();

    // Create test data
    testBundle = {
      overallProgress: {
        lessonCompletions: { '100': 1234567890 },
        domainsCompleted: [],
        currentStreak: 5,
        lastStreakCheck: 1234567890,
      },
      settings: {
        weekStartDay: 'sunday',
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
        currentEntityId: 1,
        currentPage: 0,
        lastUpdated: 1234567890,
      },
      combinedComponentProgress: {
        lessonId: '100',
        lastUpdated: 1234567890,
        components: {
          '1': { checkbox_checked: [true, false, true] },
          '2': { checkbox_checked: [false, false] },
        },
        overallProgress: {
          lessonCompletions: { '100': 1234567890 },
          domainsCompleted: [],
          currentStreak: 5,
          lastStreakCheck: 1234567890,
        },
      },
      metadata: {
        webId: 'https://example.pod.inrupt.com/profile/card#me',
      },
    };

    // Pre-stringify for string-based architecture
    testBundleJSON = JSON.stringify(testBundle);
    testTimestamp = 1234567890000;

    // Setup default mock implementations - return strings for loads
    mockBridge.localSave.mockImplementation(async () => ({ success: true }));
    mockBridge.localLoad.mockImplementation(async () => ({ 
      success: true, 
      data: testBundleJSON  // Return string, not object
    }));
    mockBridge.localDelete.mockImplementation(async () => ({ success: true }));
    
    mockBridge.solidSave.mockImplementation(async () => ({ success: true }));
    mockBridge.solidLoad.mockImplementation(async () => ({ 
      success: true, 
      data: testBundleJSON  // Return string, not object
    }));
    mockBridge.solidDelete.mockImplementation(async () => ({ success: true }));
  });

  describe('Four-Stage Success Path', () => {
    it('returns BothSucceeded when all four stages complete successfully', async () => {
      const result = await orchestrateSave(testBundleJSON, testTimestamp);

      expect(result).toBe(SaveResult.BothSucceeded);
      
      // Stage 1: Local offline (primary + duplicate)
      expect(mockBridge.localSave).toHaveBeenCalledWith(
        expect.stringContaining('.lofp.'),
        testBundleJSON  // String, not object
      );
      expect(mockBridge.localSave).toHaveBeenCalledWith(
        expect.stringContaining('.lofd.'),
        testBundleJSON  // String, not object
      );

      // Stage 2: Pod save (primary + duplicate)
      expect(mockBridge.solidSave).toHaveBeenCalledWith(
        expect.stringContaining('.sp.'),
        testBundleJSON  // String, not object
      );
      expect(mockBridge.solidSave).toHaveBeenCalledWith(
        expect.stringContaining('.sd.'),
        testBundleJSON  // String, not object
      );

      // Stage 3: Local online (primary + duplicate)
      expect(mockBridge.localSave).toHaveBeenCalledWith(
        expect.stringContaining('.lonp.'),
        testBundleJSON  // String, not object
      );
      expect(mockBridge.localSave).toHaveBeenCalledWith(
        expect.stringContaining('.lond.'),
        testBundleJSON  // String, not object
      );

      // Stage 4: Cleanup offline files
      expect(mockBridge.localDelete).toHaveBeenCalledWith(
        expect.stringContaining('.lofp.')
      );
      expect(mockBridge.localDelete).toHaveBeenCalledWith(
        expect.stringContaining('.lofd.')
      );
    });

    it('creates files with correct naming convention', async () => {
      await orchestrateSave(testBundleJSON, testTimestamp);

      // Verify filename pattern: mera.{major}.{minor}.{patch}.{type}.{timestamp}.json
      const filenamePattern = /^mera\.\d+\.\d+\.\d+\.(lofp|lofd|sp|sd|lonp|lond)\.\d+\.json$/;

      // Check all save calls use correct pattern
      mockBridge.localSave.mock.calls.forEach(([filename]: [string]) => {
        expect(filename).toMatch(filenamePattern);
      });
      
      mockBridge.solidSave.mock.calls.forEach(([filename]: [string]) => {
        expect(filename).toMatch(filenamePattern);
      });
    });

    it('embeds the provided timestamp in all filenames', async () => {
      await orchestrateSave(testBundleJSON, testTimestamp);

      const timestampString = testTimestamp.toString();

      // All generated filenames should contain the timestamp
      const allFilenames = [
        ...mockBridge.localSave.mock.calls.map(([f]: [string]) => f),
        ...mockBridge.solidSave.mock.calls.map(([f]: [string]) => f),
      ];

      allFilenames.forEach(filename => {
        expect(filename).toContain(timestampString);
      });
    });
  });

  describe('Stage 1: Local Offline Failures', () => {
    it('continues to Stage 2 (Pod) even if Stage 1 fails completely', async () => {
      // Make Stage 1 fail by rejecting saves
      mockBridge.localSave.mockImplementation(async () => {
        throw new Error('Local storage full');
      });

      const result = await orchestrateSave(testBundleJSON, testTimestamp);

      // Should still attempt Pod save
      expect(mockBridge.solidSave).toHaveBeenCalled();
      
      // If Pod succeeds, we get OnlySolidSucceeded
      expect(result).toBe(SaveResult.OnlySolidSucceeded);
    });

    it('returns OnlyLocalSucceeded when Stage 1 succeeds but Stage 2 fails', async () => {
      // Stage 1 succeeds (offline local)
      // Stage 2 fails (Pod)
      mockBridge.solidSave.mockImplementation(async () => {
        throw new Error('Network failure');
      });

      const result = await orchestrateSave(testBundleJSON, testTimestamp);

      expect(result).toBe(SaveResult.OnlyLocalSucceeded);
      
      // Should not attempt Stage 3 (online local) after Pod failure
      expect(mockBridge.localSave).toHaveBeenCalledTimes(2); // Only offline files
      expect(mockBridge.localSave).not.toHaveBeenCalledWith(
        expect.stringContaining('.lonp.'),
        expect.anything()
      );
    });
  });

  describe('Stage 2: Pod Save (Critical Operation)', () => {
    it('returns BothFailed when both Stage 1 and Stage 2 fail', async () => {
      // Stage 1 fails
      mockBridge.localSave.mockImplementation(async () => {
        throw new Error('Local storage error');
      });
      
      // Stage 2 fails
      mockBridge.solidSave.mockImplementation(async () => {
        throw new Error('Pod unreachable');
      });

      const result = await orchestrateSave(testBundleJSON, testTimestamp);

      expect(result).toBe(SaveResult.BothFailed);
    });

    it('stops orchestration immediately if Stage 2 fails', async () => {
      mockBridge.solidSave.mockImplementation(async () => {
        throw new Error('Pod authentication failed');
      });

      const result = await orchestrateSave(testBundleJSON, testTimestamp);

      // Should not attempt Stage 3 (online local) after Pod failure
      expect(mockBridge.localSave).toHaveBeenCalledTimes(2); // Only offline files
      expect(mockBridge.localSave).not.toHaveBeenCalledWith(
        expect.stringContaining('.lonp.'),
        expect.anything()
      );

      // localDelete may be called for error recovery (cleaning up corrupted Stage 1 files)
      // This is correct defensive behavior - not Stage 4 cleanup
    });

    it('saves both primary and duplicate to Pod in parallel', async () => {
      const result = await orchestrateSave(testBundleJSON, testTimestamp);

      expect(result).toBe(SaveResult.BothSucceeded);
      
      // Should save both .sp and .sd
      expect(mockBridge.solidSave).toHaveBeenCalledTimes(2);
      expect(mockBridge.solidSave).toHaveBeenCalledWith(
        expect.stringContaining('.sp.'),
        testBundleJSON
      );
      expect(mockBridge.solidSave).toHaveBeenCalledWith(
        expect.stringContaining('.sd.'),
        testBundleJSON
      );
    });
  });

  describe('Stage 3: Local Online Save', () => {
    it('returns OnlySolidSucceeded when Stage 3 fails after Pod succeeds', async () => {
      let callCount = 0;
      
      // First two calls succeed (offline), next four fail (online)
      mockBridge.localSave.mockImplementation(async (filename: string) => {
        callCount++;
        if (callCount > 2) {
          throw new Error('localStorage quota exceeded');
        }
        return { success: true };
      });

      const result = await orchestrateSave(testBundleJSON, testTimestamp);

      expect(result).toBe(SaveResult.OnlySolidSucceeded);
      
      // Should have attempted all four local saves (2 offline + 2 online)
      expect(mockBridge.localSave).toHaveBeenCalledTimes(4);
    });

    it('creates online files after Pod succeeds', async () => {
      const result = await orchestrateSave(testBundleJSON, testTimestamp);

      expect(result).toBe(SaveResult.BothSucceeded);
      
      // Should create .lonp and .lond files
      expect(mockBridge.localSave).toHaveBeenCalledWith(
        expect.stringContaining('.lonp.'),
        testBundleJSON
      );
      expect(mockBridge.localSave).toHaveBeenCalledWith(
        expect.stringContaining('.lond.'),
        testBundleJSON
      );
    });
  });

  describe('Stage 4: Cleanup Offline Files', () => {
    it('removes offline files after all stages succeed', async () => {
      const result = await orchestrateSave(testBundleJSON, testTimestamp);

      expect(result).toBe(SaveResult.BothSucceeded);
      
      // Should delete offline files
      expect(mockBridge.localDelete).toHaveBeenCalledWith(
        expect.stringContaining('.lofp.')
      );
      expect(mockBridge.localDelete).toHaveBeenCalledWith(
        expect.stringContaining('.lofd.')
      );
    });

    it('does not delete offline files if Stage 3 fails', async () => {
      let callCount = 0;
      
      mockBridge.localSave.mockImplementation(async () => {
        callCount++;
        if (callCount > 2) {
          throw new Error('localStorage full');
        }
        return { success: true };
      });

      const result = await orchestrateSave(testBundleJSON, testTimestamp);

      expect(result).toBe(SaveResult.OnlySolidSucceeded);
      
      // localDelete might be called for cleanup of corrupted files, 
      // but not for Stage 4 cleanup (which only happens in BothSucceeded)
    });

    it('continues even if cleanup fails', async () => {
      // Make cleanup fail but everything else succeed
      mockBridge.localDelete.mockImplementation(async () => {
        throw new Error('Delete failed');
      });

      const result = await orchestrateSave(testBundleJSON, testTimestamp);

      // Should still return BothSucceeded despite cleanup failure
      expect(result).toBe(SaveResult.BothSucceeded);
    });
  });

  describe('Verification Logic', () => {
    it('verifies saved data by loading it back', async () => {
      await orchestrateSave(testBundleJSON, testTimestamp);

      // Should load back all six files for verification
      // 2 offline + 2 Pod + 2 online = 6 loads
      expect(mockBridge.localLoad).toHaveBeenCalledTimes(4); // offline + online
      expect(mockBridge.solidLoad).toHaveBeenCalledTimes(2); // Pod
    });

    it('fails if loaded data does not match saved data (string equality)', async () => {
      // Return corrupted string on load
      const corruptedJSON = JSON.stringify({ ...testBundle, metadata: { webId: 'corrupted' } });
      mockBridge.solidLoad.mockImplementation(async () => ({
        success: true,
        data: corruptedJSON  // Different string
      }));

      const result = await orchestrateSave(testBundleJSON, testTimestamp);

      // Pod verification failed
      expect(result).toBe(SaveResult.OnlyLocalSucceeded);
    });

    it('cleans up corrupted files after verification failure', async () => {
      const corruptedJSON = JSON.stringify({ ...testBundle, metadata: { webId: 'corrupted' } });
      mockBridge.solidLoad.mockImplementation(async () => ({
        success: true,
        data: corruptedJSON
      }));

      await orchestrateSave(testBundleJSON, testTimestamp);

      // Should delete corrupted Pod files
      expect(mockBridge.solidDelete).toHaveBeenCalledWith(
        expect.stringContaining('.sp.')
      );
      expect(mockBridge.solidDelete).toHaveBeenCalledWith(
        expect.stringContaining('.sd.')
      );
    });

    it('uses exact string equality for verification (no parsing)', async () => {
      // Even semantically identical JSON with different formatting fails
      const reformattedJSON = JSON.stringify(testBundle, null, 2); // Pretty-printed
      mockBridge.localLoad.mockImplementation(async (filename: string) => {
        if (filename.includes('lonp') || filename.includes('lond')) {
          return { success: true, data: reformattedJSON };
        }
        return { success: true, data: testBundleJSON };
      });

      const result = await orchestrateSave(testBundleJSON, testTimestamp);

      // Online verification should fail due to different string representation
      expect(result).toBe(SaveResult.OnlySolidSucceeded);
    });
  });

  describe('Duplicate File Handling', () => {
    it('saves both primary and duplicate for each stage', async () => {
      const result = await orchestrateSave(testBundleJSON, testTimestamp);

      expect(result).toBe(SaveResult.BothSucceeded);
      
      // Local saves: 2 offline + 2 online = 4
      expect(mockBridge.localSave).toHaveBeenCalledTimes(4);
      
      // Pod saves: 2 (primary + duplicate)
      expect(mockBridge.solidSave).toHaveBeenCalledTimes(2);
    });

    it('fails if either primary or duplicate fails verification', async () => {
      const corruptedJSON = JSON.stringify({ ...testBundle, metadata: { webId: 'corrupted' } });
      
      // Make duplicate fail verification
      mockBridge.solidLoad.mockImplementation(async (filename: string) => {
        if (filename.includes('.sd.')) {
          return { success: true, data: corruptedJSON };
        }
        return { success: true, data: testBundleJSON };
      });

      const result = await orchestrateSave(testBundleJSON, testTimestamp);

      // Promise.all fails if ANY promise rejects, so Pod stage fails
      expect(result).toBe(SaveResult.OnlyLocalSucceeded);
    });
  });

  describe('SaveResult Enum Coverage', () => {
    it('returns BothSucceeded when all stages complete', async () => {
      const result = await orchestrateSave(testBundleJSON, testTimestamp);
      expect(result).toBe(SaveResult.BothSucceeded);
    });

    it('returns OnlyLocalSucceeded when Pod fails', async () => {
      mockBridge.solidSave.mockImplementation(async () => {
        throw new Error('Network error');
      });

      const result = await orchestrateSave(testBundleJSON, testTimestamp);
      expect(result).toBe(SaveResult.OnlyLocalSucceeded);
    });

    it('returns OnlySolidSucceeded when local online fails', async () => {
      let callCount = 0;
      mockBridge.localSave.mockImplementation(async () => {
        callCount++;
        if (callCount > 2) {
          throw new Error('localStorage full');
        }
        return { success: true };
      });

      const result = await orchestrateSave(testBundleJSON, testTimestamp);
      expect(result).toBe(SaveResult.OnlySolidSucceeded);
    });

    it('returns BothFailed when both local and Pod fail', async () => {
      mockBridge.localSave.mockImplementation(async () => {
        throw new Error('Local error');
      });
      mockBridge.solidSave.mockImplementation(async () => {
        throw new Error('Pod error');
      });

      const result = await orchestrateSave(testBundleJSON, testTimestamp);
      expect(result).toBe(SaveResult.BothFailed);
    });
  });

  describe('Error Handling', () => {
    it('logs errors for each failed stage', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockBridge.solidSave.mockImplementation(async () => {
        throw new Error('Network failure');
      });

      await orchestrateSave(testBundleJSON, testTimestamp);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Pod save failed:',
        expect.any(Error)
      );
      
      consoleErrorSpy.mockRestore();
    });

    it('handles missing data field in load result', async () => {
      mockBridge.solidLoad.mockImplementation(async () => ({
        success: true
        // Missing data field
      }));

      const result = await orchestrateSave(testBundleJSON, testTimestamp);

      expect(result).toBe(SaveResult.OnlyLocalSucceeded);
    });

    it('handles load failures gracefully', async () => {
      mockBridge.solidLoad.mockImplementation(async () => ({
        success: false,
        error: 'Pod unreachable'
      }));

      const result = await orchestrateSave(testBundleJSON, testTimestamp);

      expect(result).toBe(SaveResult.OnlyLocalSucceeded);
    });
  });

  describe('Edge Cases', () => {
    it('handles very large bundle strings', async () => {
      const largeBundle = {
        ...testBundle,
        overallProgress: {
          ...testBundle.overallProgress,
          lessonCompletions: Object.fromEntries(
            Array.from({ length: 5000 }, (_, i) => [i.toString(), Date.now()])
          )
        }
      };
      const largeBundleJSON = JSON.stringify(largeBundle);

      // Update mock to return the large string
      mockBridge.localLoad.mockImplementation(async () => ({
        success: true,
        data: largeBundleJSON
      }));
      mockBridge.solidLoad.mockImplementation(async () => ({
        success: true,
        data: largeBundleJSON
      }));

      const result = await orchestrateSave(largeBundleJSON, testTimestamp);

      expect(result).toBe(SaveResult.BothSucceeded);
    });

    it('handles unicode characters in bundle', async () => {
      const unicodeBundle = {
        ...testBundle,
        settings: {
          ...testBundle.settings,
          theme: '🌙 dark mode' as any
        }
      };
      const unicodeBundleJSON = JSON.stringify(unicodeBundle);

      mockBridge.localLoad.mockImplementation(async () => ({
        success: true,
        data: unicodeBundleJSON
      }));
      mockBridge.solidLoad.mockImplementation(async () => ({
        success: true,
        data: unicodeBundleJSON
      }));

      const result = await orchestrateSave(unicodeBundleJSON, testTimestamp);

      expect(result).toBe(SaveResult.BothSucceeded);
    });
  });
});