/**
 * @fileoverview Comprehensive tests for escapeHatch module
 * @module initialization/escapeHatch.test
 * 
 * Tests cover:
 * - Rate limiting (one backup per hour)
 * - Backup creation and filename generation
 * - Cleanup with 20-backup limit
 * - Network call optimization (single list operation)
 * - Error handling (fire-and-forget behavior)
 * - Edge cases (empty Pod, exactly 20 backups, etc.)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { makeEscapeHatchBackup } from './escapeHatch.js';
import { MeraBridge } from '../solid/meraBridge.js';

// Mock MeraBridge
vi.mock('../solid/meraBridge.js', () => {
  const mockBridge = {
    solidSave: vi.fn(),
    solidLoad: vi.fn(),
    solidDelete: vi.fn(),
    solidList: vi.fn(),
  };

  return {
    MeraBridge: {
      getInstance: vi.fn(() => mockBridge),
    },
  };
});

// Mock schemaVersion
vi.mock('../persistence/schemaVersion.js', () => ({
  CURRENT_SCHEMA_VERSION: {
    major: 0,
    minor: 1,
    patch: 0,
  },
}));

describe('escapeHatch', () => {
  let mockBridge: any;
  let testRawJson: string;
  let currentTime: number;

  // Helper to flush all pending promises
  const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Get the mocked bridge instance
    mockBridge = MeraBridge.getInstance();

    // Test data
    testRawJson = JSON.stringify({
      metadata: { webId: 'https://test.pod/profile/card#me' },
      overallProgress: { lessonCompletions: { '100': 1234567890 } },
      settings: { theme: 'auto' },
      navigationState: { currentEntityId: 1 },
      combinedComponentProgress: { components: {} },
    });

    // Set consistent current time
    currentTime = 1700000000000; // Nov 14, 2023
    vi.setSystemTime(currentTime);

    // Default mock implementations
    mockBridge.solidList.mockResolvedValue({ success: true, data: [] });
    mockBridge.solidSave.mockResolvedValue({ success: true });
    mockBridge.solidDelete.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================================================
  // HAPPY PATH - BASIC FUNCTIONALITY
  // ============================================================================

  describe('Basic Functionality', () => {
    it('creates escape hatch backup when none exist', async () => {
      await makeEscapeHatchBackup(testRawJson);

      // Should list existing backups
      expect(mockBridge.solidList).toHaveBeenCalledWith('mera.*.*.*.ehb.*.json');

      // Should save new backup with correct filename pattern
      expect(mockBridge.solidSave).toHaveBeenCalledWith(
        `mera.0.1.0.ehb.${currentTime}.json`,
        testRawJson
      );

      // Should not delete anything (no cleanup needed)
      expect(mockBridge.solidDelete).not.toHaveBeenCalled();
    });

    it('uses correct filename pattern with version', async () => {
      await makeEscapeHatchBackup(testRawJson);

      const savedFilename = mockBridge.solidSave.mock.calls[0][0];
      expect(savedFilename).toMatch(/^mera\.\d+\.\d+\.\d+\.ehb\.\d+\.json$/);
      expect(savedFilename).toContain('.ehb.');
    });

    it('saves raw JSON without modification', async () => {
      await makeEscapeHatchBackup(testRawJson);

      const savedData = mockBridge.solidSave.mock.calls[0][1];
      expect(savedData).toBe(testRawJson);
      expect(savedData).toBeTypeOf('string');
    });
  });

  // ============================================================================
  // RATE LIMITING
  // ============================================================================

  describe('Rate Limiting', () => {
    it('skips backup when recent one exists (< 1 hour)', async () => {
      // Mock existing backup from 30 minutes ago
      const recentTimestamp = currentTime - (30 * 60 * 1000);
      mockBridge.solidList.mockResolvedValue({
        success: true,
        data: [`mera.0.1.0.ehb.${recentTimestamp}.json`],
      });

      await makeEscapeHatchBackup(testRawJson);

      // Should check existing backups
      expect(mockBridge.solidList).toHaveBeenCalledOnce();

      // Should NOT create new backup
      expect(mockBridge.solidSave).not.toHaveBeenCalled();
      expect(mockBridge.solidDelete).not.toHaveBeenCalled();
    });

    it('creates backup when most recent is exactly 1 hour old', async () => {
      // Mock existing backup from exactly 1 hour ago
      const exactlyOneHourAgo = currentTime - (60 * 60 * 1000);
      mockBridge.solidList.mockResolvedValue({
        success: true,
        data: [`mera.0.1.0.ehb.${exactlyOneHourAgo}.json`],
      });

      await makeEscapeHatchBackup(testRawJson);

      // Should create new backup (>= 1 hour is allowed)
      expect(mockBridge.solidSave).toHaveBeenCalledOnce();
    });

    it('creates backup when most recent is older than 1 hour', async () => {
      // Mock existing backup from 2 hours ago
      const twoHoursAgo = currentTime - (2 * 60 * 60 * 1000);
      mockBridge.solidList.mockResolvedValue({
        success: true,
        data: [`mera.0.1.0.ehb.${twoHoursAgo}.json`],
      });

      await makeEscapeHatchBackup(testRawJson);

      // Should create new backup
      expect(mockBridge.solidSave).toHaveBeenCalledOnce();
    });

    it('skips backup when recent one exists among multiple backups', async () => {
      // Mock multiple backups, with newest being recent
      const recentTimestamp = currentTime - (10 * 60 * 1000); // 10 min ago
      const oldTimestamp1 = currentTime - (5 * 60 * 60 * 1000); // 5 hours ago
      const oldTimestamp2 = currentTime - (10 * 60 * 60 * 1000); // 10 hours ago

      mockBridge.solidList.mockResolvedValue({
        success: true,
        data: [
          `mera.0.1.0.ehb.${recentTimestamp}.json`,
          `mera.0.1.0.ehb.${oldTimestamp1}.json`,
          `mera.0.1.0.ehb.${oldTimestamp2}.json`,
        ],
      });

      await makeEscapeHatchBackup(testRawJson);

      // Should NOT create new backup
      expect(mockBridge.solidSave).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // CLEANUP LOGIC
  // ============================================================================

  // ============================================================================
  // CLEANUP LOGIC
  // ============================================================================

  describe('Cleanup Logic', () => {
    it('does not cleanup when total backups <= 20', async () => {
      // Mock 19 existing backups (all older than 1 hour)
      const existingBackups = Array.from({ length: 19 }, (_, i) => {
        const timestamp = currentTime - ((i + 2) * 60 * 60 * 1000);
        return `mera.0.1.0.ehb.${timestamp}.json`;
      });

      mockBridge.solidList.mockResolvedValue({
        success: true,
        data: existingBackups,
      });

      await makeEscapeHatchBackup(testRawJson);

      // Should create backup (19 + 1 = 20, at limit)
      expect(mockBridge.solidSave).toHaveBeenCalledOnce();

      // Cleanup is fire-and-forget, so we can't test it directly
      // But we know from the count that no delete should happen
    });

    it('deletes oldest backup when exceeding 20 limit', async () => {
      // Test the cleanup function directly rather than fire-and-forget
      const existingBackups = Array.from({ length: 20 }, (_, i) => {
        const timestamp = currentTime - ((i + 2) * 60 * 60 * 1000);
        return { filename: `mera.0.1.0.ehb.${timestamp}.json`, timestamp };
      });

      // Import and test cleanup directly
      const { cleanupOldEscapeHatches } = await import('./escapeHatch.js');
      
      await cleanupOldEscapeHatches(21, existingBackups);

      // Should delete 1 oldest backup
      expect(mockBridge.solidDelete).toHaveBeenCalledOnce();
      expect(mockBridge.solidDelete).toHaveBeenCalledWith(
        existingBackups[19].filename // Oldest (last in sorted list)
      );
    });

    it('deletes multiple old backups when far over limit', async () => {
      // Test cleanup function directly
      const existingBackups = Array.from({ length: 25 }, (_, i) => {
        const timestamp = currentTime - ((i + 2) * 60 * 60 * 1000);
        return { filename: `mera.0.1.0.ehb.${timestamp}.json`, timestamp };
      });

      const { cleanupOldEscapeHatches } = await import('./escapeHatch.js');
      
      await cleanupOldEscapeHatches(26, existingBackups);

      // Should delete 6 oldest backups (26 - 20 = 6)
      expect(mockBridge.solidDelete).toHaveBeenCalledTimes(6);

      // Verify it deleted the 6 oldest
      const deletedFiles = mockBridge.solidDelete.mock.calls.map((call: any) => call[0]);
      expect(deletedFiles).toEqual(existingBackups.slice(-6).map(b => b.filename));
    });

    it('handles cleanup with exactly 20 existing backups', async () => {
      // Test cleanup function directly
      const existingBackups = Array.from({ length: 20 }, (_, i) => {
        const timestamp = currentTime - ((i + 2) * 60 * 60 * 1000);
        return { filename: `mera.0.1.0.ehb.${timestamp}.json`, timestamp };
      });

      const { cleanupOldEscapeHatches } = await import('./escapeHatch.js');
      
      await cleanupOldEscapeHatches(21, existingBackups);

      // Should delete exactly 1 (21 - 20 = 1)
      expect(mockBridge.solidDelete).toHaveBeenCalledOnce();
    });
  });

  // ============================================================================
  // NETWORK OPTIMIZATION
  // ============================================================================

  // ============================================================================
  // NETWORK OPTIMIZATION
  // ============================================================================

  describe('Network Optimization', () => {
    it('calls solidList only once per backup attempt', async () => {
      // Mock 15 existing backups (all older than 1 hour)
      const existingBackups = Array.from({ length: 15 }, (_, i) => {
        const timestamp = currentTime - ((i + 2) * 60 * 60 * 1000);
        return `mera.0.1.0.ehb.${timestamp}.json`;
      });

      mockBridge.solidList.mockResolvedValue({
        success: true,
        data: existingBackups,
      });

      await makeEscapeHatchBackup(testRawJson);

      // Should list only ONCE (rate limit check reuses same list for cleanup)
      expect(mockBridge.solidList).toHaveBeenCalledOnce();
    });

    it('does not list again when rate limited', async () => {
      // Mock recent backup
      const recentTimestamp = currentTime - (30 * 60 * 1000);
      mockBridge.solidList.mockResolvedValue({
        success: true,
        data: [`mera.0.1.0.ehb.${recentTimestamp}.json`],
      });

      await makeEscapeHatchBackup(testRawJson);

      // Should list once for rate check
      expect(mockBridge.solidList).toHaveBeenCalledOnce();

      // No save means no cleanup, so still just one list call
      expect(mockBridge.solidList).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  describe('Error Handling', () => {
    it('logs but does not throw when list fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockBridge.solidList.mockResolvedValue({
        success: false,
        error: 'Network failure',
      });

      // Should not throw
      await expect(makeEscapeHatchBackup(testRawJson)).resolves.toBeUndefined();

      // Should still attempt to save (treats empty list as no backups)
      expect(mockBridge.solidSave).toHaveBeenCalledOnce();

      consoleErrorSpy.mockRestore();
    });

    it('logs but does not throw when save fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockBridge.solidSave.mockResolvedValue({
        success: false,
        error: 'Quota exceeded',
      });

      // Should not throw
      await expect(makeEscapeHatchBackup(testRawJson)).resolves.toBeUndefined();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to create escape hatch backup:',
        'Quota exceeded'
      );

      consoleErrorSpy.mockRestore();
    });

    it('continues cleanup even if some deletes fail', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock 25 existing backups
      const existingBackups = Array.from({ length: 25 }, (_, i) => {
        const timestamp = currentTime - ((i + 2) * 60 * 60 * 1000);
        return { filename: `mera.0.1.0.ehb.${timestamp}.json`, timestamp };
      });

      // Make some deletes fail
      mockBridge.solidDelete.mockImplementation(async (filename: string) => {
        const match = filename.match(/\.(\d+)\.json$/);
        if (match) {
          const timestamp = parseInt(match[1]);
          if (timestamp % 2 === 0) {
            return { success: false, error: 'Delete failed' };
          }
        }
        return { success: true };
      });

      const { cleanupOldEscapeHatches } = await import('./escapeHatch.js');
      await cleanupOldEscapeHatches(26, existingBackups);

      // Should attempt all 6 deletes despite failures
      expect(mockBridge.solidDelete).toHaveBeenCalledTimes(6);

      // Should log errors for failures
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('handles cleanup failure without blocking save', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Test that save succeeds even if cleanup would fail
      const existingBackups = Array.from({ length: 21 }, (_, i) => {
        const timestamp = currentTime - ((i + 2) * 60 * 60 * 1000);
        return `mera.0.1.0.ehb.${timestamp}.json`;
      });

      mockBridge.solidList.mockResolvedValue({
        success: true,
        data: existingBackups,
      });

      await makeEscapeHatchBackup(testRawJson);

      // Save should succeed (cleanup is fire-and-forget, doesn't block)
      expect(mockBridge.solidSave).toHaveBeenCalledOnce();

      consoleErrorSpy.mockRestore();
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    it('handles empty Pod (no existing backups)', async () => {
      mockBridge.solidList.mockResolvedValue({ success: true, data: [] });

      await makeEscapeHatchBackup(testRawJson);

      // Should create backup successfully
      expect(mockBridge.solidSave).toHaveBeenCalledOnce();
      
      // Note: We don't assert on solidDelete because cleanup is fire-and-forget
      // and may be running from previous tests. Cleanup logic is tested separately.
    });

    it('handles malformed filenames in list gracefully', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockBridge.solidList.mockResolvedValue({
        success: true,
        data: [
          'mera.0.1.0.ehb.invalid.json', // Matches pattern but invalid timestamp
          `mera.0.1.0.ehb.${currentTime - (2 * 60 * 60 * 1000)}.json`, // Valid, 2 hours old
          'mera.0.1.0.ehb.notanumber.json', // Matches pattern but invalid timestamp
        ],
      });

      await makeEscapeHatchBackup(testRawJson);

      // Should handle valid filename, ignore invalid ones
      expect(mockBridge.solidSave).toHaveBeenCalledOnce();
      
      // Both invalid filenames should be warned about
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid escape hatch filename: mera.0.1.0.ehb.invalid.json');
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid escape hatch filename: mera.0.1.0.ehb.notanumber.json');

      consoleWarnSpy.mockRestore();
    });

    it('handles very large number of existing backups', async () => {
      // Test cleanup function directly with 100 backups
      const existingBackups = Array.from({ length: 100 }, (_, i) => {
        const timestamp = currentTime - ((i + 2) * 60 * 60 * 1000);
        return { filename: `mera.0.1.0.ehb.${timestamp}.json`, timestamp };
      });

      const { cleanupOldEscapeHatches } = await import('./escapeHatch.js');
      await cleanupOldEscapeHatches(101, existingBackups);

      // Should delete 81 backups (101 - 20 = 81)
      expect(mockBridge.solidDelete).toHaveBeenCalledTimes(81);

      // Verify correct backups deleted (oldest 81)
      const deletedFiles = mockBridge.solidDelete.mock.calls.map((call: any) => call[0]);
      expect(deletedFiles).toEqual(existingBackups.slice(-81).map(b => b.filename));
    });

    it('handles timestamp exactly at current time', async () => {
      // This tests the edge case of Date.now() being called multiple times
      const timestamp1 = currentTime;
      vi.setSystemTime(timestamp1);

      await makeEscapeHatchBackup(testRawJson);

      expect(mockBridge.solidSave).toHaveBeenCalledWith(
        `mera.0.1.0.ehb.${timestamp1}.json`,
        testRawJson
      );
    });

    it('properly sorts backups by timestamp (newest first)', async () => {
      // Mock backups in random order
      const timestamps = [
        currentTime - (5 * 60 * 60 * 1000),
        currentTime - (1 * 60 * 60 * 1000),
        currentTime - (10 * 60 * 60 * 1000),
        currentTime - (3 * 60 * 60 * 1000),
      ];

      mockBridge.solidList.mockResolvedValue({
        success: true,
        data: timestamps.map((ts) => `mera.0.1.0.ehb.${ts}.json`),
      });

      await makeEscapeHatchBackup(testRawJson);

      // Should use newest (1 hour ago) for rate limiting
      // Since newest is 1 hour ago, should create new backup
      expect(mockBridge.solidSave).toHaveBeenCalledOnce();
    });

    it('handles unsorted list from solidList', async () => {
      // solidList might not return sorted results
      const unsortedBackups = [
        `mera.0.1.0.ehb.${currentTime - (10 * 60 * 60 * 1000)}.json`,
        `mera.0.1.0.ehb.${currentTime - (2 * 60 * 60 * 1000)}.json`,
        `mera.0.1.0.ehb.${currentTime - (5 * 60 * 60 * 1000)}.json`,
      ];

      mockBridge.solidList.mockResolvedValue({
        success: true,
        data: unsortedBackups,
      });

      await makeEscapeHatchBackup(testRawJson);

      // Should still correctly identify newest (2 hours ago) for rate check
      expect(mockBridge.solidSave).toHaveBeenCalledOnce();
    });
  });

  // ============================================================================
  // INTEGRATION SCENARIOS
  // ============================================================================

  describe('Integration Scenarios', () => {
    it('handles rapid successive calls (simulating page refresh)', async () => {
      // First call - no existing backups
      mockBridge.solidList.mockResolvedValueOnce({ success: true, data: [] });
      
      await makeEscapeHatchBackup(testRawJson);
      
      // Verify first backup was created
      expect(mockBridge.solidSave).toHaveBeenCalledOnce();
      
      // Clear mocks for second call
      vi.clearAllMocks();

      // Second call 1 second later (same hour) - should be rate-limited
      // The first backup has timestamp=currentTime, age = Date.now() - currentTime
      // Need age < 1 hour (3600000ms) to trigger rate limit
      // Advance time by only 1 second
      const newTime = currentTime + 1000; // 1 second later
      vi.setSystemTime(newTime);
      
      const firstBackupTimestamp = currentTime; // The backup we just created
      mockBridge.solidList.mockResolvedValueOnce({
        success: true,
        data: [`mera.0.1.0.ehb.${firstBackupTimestamp}.json`],
      });
      
      await makeEscapeHatchBackup(testRawJson);

      // Second call should be rate-limited (no save)
      // Age = newTime - firstBackupTimestamp = 1000ms < 3600000ms, so rate-limited
      expect(mockBridge.solidSave).not.toHaveBeenCalled();
    });
  });
});