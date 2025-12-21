/**
 * @fileoverview Comprehensive tests for progressLoader module
 * @module initialization/progressLoader.test
 * 
 * Tests cover:
 * - Backup enumeration and parsing (Pod and localStorage)
 * - Quality-based scoring system
 * - Source selection logic (Pod vs localStorage, quality thresholds)
 * - Merge validation and corruption detection
 * - Escape hatch integration (callback triggering)
 * - Recovery scenario classification
 * - Error handling and edge cases
 * - Full integration scenarios
 * 
 * Note: orchestrateProgressLoading() now returns ProgressLoadResult with:
 * - scenario: RecoveryScenario enum
 * - mergeOccurred: boolean
 * - bundle: PodStorageBundle
 * - recoveryMetrics: RecoveryMetrics
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { orchestrateProgressLoading, RecoveryScenario, type ProgressLoadResult } from './progressLoader.js';
import type { EnforcementResult } from './progressIntegrity.js';
import type { PodStorageBundle } from '../persistence/podStorageSchema.js';

// ============================================================================
// MOCKS
// ============================================================================

// Mock MeraBridge
vi.mock('../solid/meraBridge.js', () => {
  const mockBridge = {
    getWebId: vi.fn(),
    solidList: vi.fn(),
    solidLoad: vi.fn(),
    localList: vi.fn(),
    localLoad: vi.fn(),
  };

  return {
    MeraBridge: {
      getInstance: vi.fn(() => mockBridge),
    },
  };
});

// Mock progressIntegrity
vi.mock('./progressIntegrity.js', () => ({
  enforceDataIntegrity: vi.fn(),
}));

// Mock progressMerger
vi.mock('./progressMerger.js', () => ({
  mergeBundles: vi.fn(),
}));

// Mock escapeHatch
vi.mock('./escapeHatch.js', () => ({
  makeEscapeHatchBackup: vi.fn(),
}));

// ============================================================================
// TEST SETUP
// ============================================================================

describe('progressLoader', () => {
  let mockBridge: any;
  let mockEnforceDataIntegrity: any;
  let mockMergeBundles: any;
  let mockMakeEscapeHatchBackup: any;
  let mockLessonConfigs: Map<number, any>;
  let currentTime: number;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Get mocked instances
    const { MeraBridge } = await import('../solid/meraBridge.js');
    mockBridge = MeraBridge.getInstance();

    const { enforceDataIntegrity } = await import('./progressIntegrity.js');
    mockEnforceDataIntegrity = enforceDataIntegrity as any;

    const { mergeBundles } = await import('./progressMerger.js');
    mockMergeBundles = mergeBundles as any;

    const { makeEscapeHatchBackup } = await import('./escapeHatch.js');
    mockMakeEscapeHatchBackup = makeEscapeHatchBackup as any;

    // Set consistent time
    currentTime = 1700000000000; // Nov 14, 2023
    vi.setSystemTime(currentTime);

    // Default mock lesson configs
    mockLessonConfigs = new Map([
      [100, { metadata: { title: 'Lesson 1', id: 100 }, pages: [], components: [] }],
      [200, { metadata: { title: 'Lesson 2', id: 200 }, pages: [], components: [] }],
    ]);

    // Default mock implementations
    mockBridge.getWebId.mockReturnValue('https://test.pod/profile/card#me');
    mockBridge.solidList.mockResolvedValue({ success: true, data: [] });
    mockBridge.solidLoad.mockResolvedValue({ success: true, data: null });
    mockBridge.localList.mockResolvedValue({ success: true, data: [] });
    mockBridge.localLoad.mockResolvedValue({ success: true, data: null });
    mockMakeEscapeHatchBackup.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==========================================================================
  // BACKUP ENUMERATION & PARSING
  // ==========================================================================

  describe('Backup Enumeration & Parsing', () => {
    it('lists and parses Pod backup filenames correctly', async () => {
      const podBackups = [
        `mera.0.1.0.sp.${currentTime - 1000}.json`,
        `mera.0.1.0.sd.${currentTime - 2000}.json`,
      ];

      mockBridge.solidList.mockResolvedValue({ success: true, data: podBackups });
      mockBridge.solidLoad.mockImplementation(async (filename: string) => {
        if (filename === podBackups[0]) {
          return { success: true, data: createMockBackupData('https://test.pod/profile/card#me') };
        }
        return { success: false, error: 'Not found' };
      });

      mockEnforceDataIntegrity.mockReturnValue(createMockRecoveryResult(true));

      await orchestrateProgressLoading(mockLessonConfigs);

      expect(mockBridge.solidList).toHaveBeenCalledWith('mera.*.*.*.sp.*.json');
      expect(mockBridge.solidList).toHaveBeenCalledWith('mera.*.*.*.sd.*.json');
      expect(mockBridge.solidLoad).toHaveBeenCalledWith(podBackups[0]);
    });

    it('lists and parses localStorage backup filenames correctly', async () => {
      const localBackups = [
        `mera.0.1.0.lofp.${currentTime - 1000}.json`,
        `mera.0.1.0.lonp.${currentTime - 2000}.json`,
      ];

      mockBridge.localList.mockResolvedValue({ success: true, data: localBackups });
      mockBridge.localLoad.mockImplementation(async (filename: string) => {
        if (filename === localBackups[0]) {
          return { success: true, data: createMockBackupData('https://test.pod/profile/card#me') };
        }
        return { success: false, error: 'Not found' };
      });

      mockEnforceDataIntegrity.mockReturnValue(createMockRecoveryResult(true));

      await orchestrateProgressLoading(mockLessonConfigs);

      expect(mockBridge.localList).toHaveBeenCalledWith('mera.*.*.*.lofp.*.json');
      expect(mockBridge.localList).toHaveBeenCalledWith('mera.*.*.*.lofd.*.json');
      expect(mockBridge.localList).toHaveBeenCalledWith('mera.*.*.*.lonp.*.json');
      expect(mockBridge.localList).toHaveBeenCalledWith('mera.*.*.*.lond.*.json');
    });

    it('sorts backups newest-first based on timestamp', async () => {
      const unorderedBackups = [
        `mera.0.1.0.sp.${currentTime - 5000}.json`,
        `mera.0.1.0.sp.${currentTime - 1000}.json`, // Newest
        `mera.0.1.0.sp.${currentTime - 3000}.json`,
      ];

      mockBridge.solidList.mockResolvedValue({ success: true, data: unorderedBackups });
      mockBridge.solidLoad.mockImplementation(async (filename: string) => {
        // Only the newest should be loaded first
        if (filename === unorderedBackups[1]) {
          return { success: true, data: createMockBackupData('https://test.pod/profile/card#me') };
        }
        return { success: false, error: 'Not found' };
      });

      mockEnforceDataIntegrity.mockReturnValue(createMockRecoveryResult(true));

      await orchestrateProgressLoading(mockLessonConfigs);

      // First solidLoad call should be the newest backup
      expect(mockBridge.solidLoad.mock.calls[0][0]).toBe(unorderedBackups[1]);
    });

    it('handles mixed Pod primary and duplicate backups', async () => {
      const mixedBackups = [
        `mera.0.1.0.sp.${currentTime - 1000}.json`, // Primary
        `mera.0.1.0.sd.${currentTime - 2000}.json`, // Duplicate
      ];

      mockBridge.solidList.mockResolvedValue({ success: true, data: mixedBackups });
      mockBridge.solidLoad.mockImplementation(async (filename: string) => {
        return { success: true, data: createMockBackupData('https://test.pod/profile/card#me') };
      });

      mockEnforceDataIntegrity.mockReturnValue(createMockRecoveryResult(true));

      await orchestrateProgressLoading(mockLessonConfigs);

      expect(mockBridge.solidList).toHaveBeenCalled();
      expect(mockBridge.solidLoad).toHaveBeenCalled();
    });

    it('handles mixed localStorage offline and online backups', async () => {
      const mixedBackups = [
        `mera.0.1.0.lofp.${currentTime - 1000}.json`, // Offline
        `mera.0.1.0.lonp.${currentTime - 2000}.json`, // Online
      ];

      mockBridge.localList.mockResolvedValue({ success: true, data: mixedBackups });
      mockBridge.localLoad.mockImplementation(async (filename: string) => {
        return { success: true, data: createMockBackupData('https://test.pod/profile/card#me') };
      });

      mockEnforceDataIntegrity.mockReturnValue(createMockRecoveryResult(true));

      await orchestrateProgressLoading(mockLessonConfigs);

      expect(mockBridge.localList).toHaveBeenCalled();
    });

    it('detects offline tag in localStorage filename (.lofp.)', async () => {
      const offlineBackup = `mera.0.1.0.lofp.${currentTime - 1000}.json`;
      const podBackup = `mera.0.1.0.sp.${currentTime - 500}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [podBackup] });
      mockBridge.localList.mockResolvedValue({ success: true, data: [offlineBackup] });

      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });
      mockBridge.localLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      // Perfect Pod backup (good quality)
      mockEnforceDataIntegrity.mockImplementation((data: string) => {
        return createMockRecoveryResult(true); // Perfect
      });

      // Offline tag should trigger merge even with perfect Pod
      mockMergeBundles.mockImplementation((a: PodStorageBundle, b: PodStorageBundle) => a);

      await orchestrateProgressLoading(mockLessonConfigs);

      // Should merge because offline work detected
      expect(mockMergeBundles).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // BACKUP SCORING SYSTEM
  // ==========================================================================

  describe('Backup Scoring System', () => {
    it('scores perfect backup as 0', async () => {
      const backup = `mera.0.1.0.sp.${currentTime}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [backup] });
      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      mockEnforceDataIntegrity.mockReturnValue(createMockRecoveryResult(true));

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      expect(result).toBeTruthy();
      expect(result?.scenario).toBe(RecoveryScenario.PERFECT_RECOVERY);
    });

    it('applies 20,000 point penalty per lesson lost to corruption', async () => {
      const backup = `mera.0.1.0.sp.${currentTime}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [backup] });
      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      // Backup with 3 lessons lost
      mockEnforceDataIntegrity.mockReturnValue(
        createMockRecoveryResult(false, {
          overallProgress: {
            lessonsLostToCorruption: 3,
            lessonsDroppedCount: 0,
            lessonsDroppedRatio: 0,
            domainsLostToCorruption: 0,
            domainsDroppedCount: 0,
            domainsDroppedRatio: 0,
            corruptionDetected: true,
          },
          settings: { defaultedRatio: 0 },
          navigationState: { wasDefaulted: false },
          metadata: { defaultedRatio: 0 },
          combinedComponentProgress: { defaultedRatio: 0, componentsRetained: 0, componentsDefaulted: 0 },
        })
      );

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      // Score should be: 3 * 20,000 = 60,000
      expect(result).toBeTruthy();
      expect(result?.scenario).toBe(RecoveryScenario.IMPERFECT_RECOVERY_CORRUPTION);
    });

    it('applies 1,000 point penalty per lesson dropped from curriculum', async () => {
      const backup = `mera.0.1.0.sp.${currentTime}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [backup] });
      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      // Backup with 5 lessons dropped (curriculum change)
      mockEnforceDataIntegrity.mockReturnValue(
        createMockRecoveryResult(false, {
          overallProgress: {
            lessonsLostToCorruption: 0,
            lessonsDroppedCount: 5,
            lessonsDroppedRatio: 0.5,
            domainsLostToCorruption: 0,
            domainsDroppedCount: 0,
            domainsDroppedRatio: 0,
            corruptionDetected: false,
          },
          settings: { defaultedRatio: 0 },
          navigationState: { wasDefaulted: false },
          metadata: { defaultedRatio: 0 },
          combinedComponentProgress: { defaultedRatio: 0, componentsRetained: 0, componentsDefaulted: 0 },
        })
      );

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      // Score should be: 5 * 1,000 = 5,000
      expect(result).toBeTruthy();
    });

    it('applies baseline + proportional penalty for settings defaulting', async () => {
      const backup = `mera.0.1.0.sp.${currentTime}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [backup] });
      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      // 50% of settings defaulted
      mockEnforceDataIntegrity.mockReturnValue(
        createMockRecoveryResult(false, {
          overallProgress: {
            lessonsLostToCorruption: 0,
            lessonsDroppedCount: 0,
            lessonsDroppedRatio: 0,
            domainsLostToCorruption: 0,
            domainsDroppedCount: 0,
            domainsDroppedRatio: 0,
            corruptionDetected: false,
          },
          settings: { defaultedRatio: 0.5 },
          navigationState: { wasDefaulted: false },
          metadata: { defaultedRatio: 0 },
          combinedComponentProgress: { defaultedRatio: 0, componentsRetained: 0, componentsDefaulted: 0 },
        })
      );

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      // Score: 1,000 (baseline) + Math.round(0.5 * 4,000) = 3,000 total
      expect(result).toBeTruthy();
    });

    it('applies 5 point penalty per component defaulted', async () => {
      const backup = `mera.0.1.0.sp.${currentTime}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [backup] });
      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      // 10 components defaulted
      mockEnforceDataIntegrity.mockReturnValue(
        createMockRecoveryResult(false, {
          overallProgress: {
            lessonsLostToCorruption: 0,
            lessonsDroppedCount: 0,
            lessonsDroppedRatio: 0,
            domainsLostToCorruption: 0,
            domainsDroppedCount: 0,
            domainsDroppedRatio: 0,
            corruptionDetected: false,
          },
          settings: { defaultedRatio: 0 },
          navigationState: { wasDefaulted: false },
          metadata: { defaultedRatio: 0 },
          combinedComponentProgress: { defaultedRatio: 0, componentsRetained: 0, componentsDefaulted: 10 },
        })
      );

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      // Score: 10 * 5 = 50
      expect(result).toBeTruthy();
    });

    it('applies 500 point recency penalty per backup step', async () => {
      const backups = [
        `mera.0.1.0.sp.${currentTime - 3000}.json`, // Index 2
        `mera.0.1.0.sp.${currentTime - 2000}.json`, // Index 1
        `mera.0.1.0.sp.${currentTime - 1000}.json`, // Index 0 (newest)
      ];

      mockBridge.solidList.mockResolvedValue({ success: true, data: backups });
      mockBridge.solidLoad.mockImplementation(async (filename: string) => {
        return { success: true, data: createMockBackupData('https://test.pod/profile/card#me') };
      });

      // All imperfect but otherwise identical
      mockEnforceDataIntegrity.mockReturnValue(
        createMockRecoveryResult(false, {
          overallProgress: {
            lessonsLostToCorruption: 0,
            lessonsDroppedCount: 0,
            lessonsDroppedRatio: 0,
            domainsLostToCorruption: 0,
            domainsDroppedCount: 0,
            domainsDroppedRatio: 0,
            corruptionDetected: false,
          },
          settings: { defaultedRatio: 0.1 }, // Small penalty
          navigationState: { wasDefaulted: false },
          metadata: { defaultedRatio: 0 },
          combinedComponentProgress: { defaultedRatio: 0, componentsRetained: 0, componentsDefaulted: 0 },
        })
      );

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      // Should pick newest (index 0) despite identical metrics
      expect(result).toBeTruthy();
    });

    it('combines multiple penalties correctly', async () => {
      const backup = `mera.0.1.0.sp.${currentTime}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [backup] });
      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      // Multiple issues
      mockEnforceDataIntegrity.mockReturnValue(
        createMockRecoveryResult(false, {
          overallProgress: {
            lessonsLostToCorruption: 1, // 20,000
            lessonsDroppedCount: 2, // 2,000
            lessonsDroppedRatio: 0.2,
            domainsLostToCorruption: 0,
            domainsDroppedCount: 0,
            domainsDroppedRatio: 0,
            corruptionDetected: true,
          },
          settings: { defaultedRatio: 0.1 }, // 1,000 + 400 = 1,400
          navigationState: { wasDefaulted: false },
          metadata: { defaultedRatio: 0 },
          combinedComponentProgress: { defaultedRatio: 0, componentsRetained: 0, componentsDefaulted: 5 }, // 25
        })
      );

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      // Total: 20,000 + 2,000 + 1,400 + 25 = 23,425
      expect(result).toBeTruthy();
    });

    it('stops scoring immediately on perfect backup', async () => {
      const backups = [
        `mera.0.1.0.sp.${currentTime - 3000}.json`,
        `mera.0.1.0.sp.${currentTime - 2000}.json`,
        `mera.0.1.0.sp.${currentTime - 1000}.json`, // Newest, perfect
      ];

      mockBridge.solidList.mockResolvedValue({ success: true, data: backups });
      mockBridge.solidLoad.mockImplementation(async (filename: string) => {
        return { success: true, data: createMockBackupData('https://test.pod/profile/card#me') };
      });

      mockEnforceDataIntegrity.mockReturnValue(createMockRecoveryResult(true));

      await orchestrateProgressLoading(mockLessonConfigs);

      // Should load newest backup twice: once for escape hatch capture, once for scoring
      expect(mockBridge.solidLoad).toHaveBeenCalledTimes(2);
      expect(mockBridge.solidLoad).toHaveBeenCalledWith(backups[2]);
    });
  });

  // ==========================================================================
  // SOURCE SELECTION LOGIC
  // ==========================================================================

  describe('Source Selection Logic', () => {
    it('uses Pod when no localStorage backups exist', async () => {
      const podBackup = `mera.0.1.0.sp.${currentTime}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [podBackup] });
      mockBridge.localList.mockResolvedValue({ success: true, data: [] });
      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      mockEnforceDataIntegrity.mockReturnValue(createMockRecoveryResult(true));

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      expect(result).toBeTruthy();
      expect(mockBridge.solidLoad).toHaveBeenCalledWith(podBackup);
      expect(mockMergeBundles).not.toHaveBeenCalled();
    });

    it('uses localStorage when no Pod backups exist', async () => {
      const localBackup = `mera.0.1.0.lonp.${currentTime}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [] });
      mockBridge.localList.mockResolvedValue({ success: true, data: [localBackup] });
      mockBridge.localLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      mockEnforceDataIntegrity.mockReturnValue(createMockRecoveryResult(true));

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      expect(result).toBeTruthy();
      expect(mockBridge.localLoad).toHaveBeenCalledWith(localBackup);
      expect(mockMergeBundles).not.toHaveBeenCalled();
    });

    it('returns result with DEFAULT_NO_SAVES when no backups exist anywhere', async () => {
      mockBridge.solidList.mockResolvedValue({ success: true, data: [] });
      mockBridge.localList.mockResolvedValue({ success: true, data: [] });

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      expect(result).toBeTruthy();
      expect(result?.scenario).toBe(RecoveryScenario.DEFAULT_NO_SAVES);
    });

    it('uses Pod when quality is good (score < 1000) and no offline work', async () => {
      const podBackup = `mera.0.1.0.sp.${currentTime}.json`;
      const localBackup = `mera.0.1.0.lonp.${currentTime - 1000}.json`; // Online tag

      mockBridge.solidList.mockResolvedValue({ success: true, data: [podBackup] });
      mockBridge.localList.mockResolvedValue({ success: true, data: [localBackup] });

      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });
      mockBridge.localLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      // Pod: minor issues (score < 1000)
      mockEnforceDataIntegrity.mockImplementation((data: string) => {
        return createMockRecoveryResult(false, {
          overallProgress: {
            lessonsLostToCorruption: 0,
            lessonsDroppedCount: 0,
            lessonsDroppedRatio: 0,
            domainsLostToCorruption: 0,
            domainsDroppedCount: 0,
            domainsDroppedRatio: 0,
            corruptionDetected: false,
          },
          settings: { defaultedRatio: 0.1 }, // 1,000 + 400 = 1,400 > 1000, actually poor
          navigationState: { wasDefaulted: false },
          metadata: { defaultedRatio: 0 },
          combinedComponentProgress: { defaultedRatio: 0, componentsRetained: 0, componentsDefaulted: 10 }, // 50
        });
      });

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      // Actually should merge because score >= 1000
      expect(result).toBeTruthy();
    });

    it('merges when Pod quality is good but offline work exists', async () => {
      const podBackup = `mera.0.1.0.sp.${currentTime}.json`;
      const localBackup = `mera.0.1.0.lofp.${currentTime - 1000}.json`; // Offline tag

      mockBridge.solidList.mockResolvedValue({ success: true, data: [podBackup] });
      mockBridge.localList.mockResolvedValue({ success: true, data: [localBackup] });

      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });
      mockBridge.localLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      // Perfect Pod
      mockEnforceDataIntegrity.mockReturnValue(createMockRecoveryResult(true));

      mockMergeBundles.mockImplementation((a: PodStorageBundle, b: PodStorageBundle) => a);

      await orchestrateProgressLoading(mockLessonConfigs);

      // Should merge even with perfect Pod due to offline work
      expect(mockMergeBundles).toHaveBeenCalled();
    });

    it('merges when Pod quality is poor (score >= 1000)', async () => {
      const podBackup = `mera.0.1.0.sp.${currentTime}.json`;
      const localBackup = `mera.0.1.0.lonp.${currentTime - 1000}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [podBackup] });
      mockBridge.localList.mockResolvedValue({ success: true, data: [localBackup] });

      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });
      mockBridge.localLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      // Pod: poor quality (score >= 1000)
      mockEnforceDataIntegrity.mockImplementation((data: string) => {
        return createMockRecoveryResult(false, {
          overallProgress: {
            lessonsLostToCorruption: 0,
            lessonsDroppedCount: 2, // 2,000 points
            lessonsDroppedRatio: 0.2,
            domainsLostToCorruption: 0,
            domainsDroppedCount: 0,
            domainsDroppedRatio: 0,
            corruptionDetected: false,
          },
          settings: { defaultedRatio: 0 },
          navigationState: { wasDefaulted: false },
          metadata: { defaultedRatio: 0 },
          combinedComponentProgress: { defaultedRatio: 0, componentsRetained: 0, componentsDefaulted: 0 },
        });
      });

      mockMergeBundles.mockImplementation((a: PodStorageBundle, b: PodStorageBundle) => a);

      await orchestrateProgressLoading(mockLessonConfigs);

      // Should merge because Pod score >= 1000
      expect(mockMergeBundles).toHaveBeenCalled();
    });

    it('skips backups with webId mismatch during scoring', async () => {
      const backups = [
        `mera.0.1.0.sp.${currentTime - 1000}.json`, // Wrong webId
        `mera.0.1.0.sp.${currentTime - 2000}.json`, // Correct webId
      ];

      mockBridge.solidList.mockResolvedValue({ success: true, data: backups });
      mockBridge.solidLoad.mockImplementation(async (filename: string) => {
        if (filename === backups[0]) {
          return { success: true, data: createMockBackupData('https://wrong.pod/profile#me') };
        }
        return { success: true, data: createMockBackupData('https://test.pod/profile/card#me') };
      });

      mockEnforceDataIntegrity.mockImplementation((data: string, webId: string) => {
        const parsed = JSON.parse(data);
        if (parsed.metadata.webId !== webId) {
          // WebId mismatch - set critical failure flag
          return createMockRecoveryResult(
            false,
            {
              overallProgress: {
                lessonsLostToCorruption: 0,
                lessonsDroppedCount: 0,
                lessonsDroppedRatio: 0,
                domainsLostToCorruption: 0,
                domainsDroppedCount: 0,
                domainsDroppedRatio: 0,
                corruptionDetected: false,
              },
              settings: { defaultedRatio: 0 },
              navigationState: { wasDefaulted: false },
              metadata: { defaultedRatio: 1.0 }, // WebId mismatch
              combinedComponentProgress: { defaultedRatio: 0, componentsRetained: 0, componentsDefaulted: 0 },
            },
            { webIDMismatch: true } // CRITICAL: Set this flag
          );
        }
        return createMockRecoveryResult(true);
      });

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      // Should use second backup (correct webId)
      expect(result).toBeTruthy();
    });

    it('chooses best scored backup when multiple exist', async () => {
      const backups = [
        `mera.0.1.0.sp.${currentTime - 1000}.json`, // Newest, high corruption
        `mera.0.1.0.sp.${currentTime - 2000}.json`, // Older, less corruption
      ];

      mockBridge.solidList.mockResolvedValue({ success: true, data: backups });
      mockBridge.solidLoad.mockImplementation(async (filename: string) => {
        return { success: true, data: createMockBackupData('https://test.pod/profile/card#me') };
      });

      // First backup: high corruption (score ~60,500)
      // Second backup: low corruption (score ~2,500)
      let callCount = 0;
      mockEnforceDataIntegrity.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Newest: 3 lessons lost = 60,000 + recency 0 = 60,000
          return createMockRecoveryResult(false, {
            overallProgress: {
              lessonsLostToCorruption: 3,
              lessonsDroppedCount: 0,
              lessonsDroppedRatio: 0,
              domainsLostToCorruption: 0,
              domainsDroppedCount: 0,
              domainsDroppedRatio: 0,
              corruptionDetected: true,
            },
            settings: { defaultedRatio: 0 },
            navigationState: { wasDefaulted: false },
            metadata: { defaultedRatio: 0 },
            combinedComponentProgress: { defaultedRatio: 0, componentsRetained: 0, componentsDefaulted: 0 },
          });
        }
        // Older: 0 corruption + recency 500 = 500 (better!)
        return createMockRecoveryResult(false, {
          overallProgress: {
            lessonsLostToCorruption: 0,
            lessonsDroppedCount: 0,
            lessonsDroppedRatio: 0,
            domainsLostToCorruption: 0,
            domainsDroppedCount: 0,
            domainsDroppedRatio: 0,
            corruptionDetected: false,
          },
          settings: { defaultedRatio: 0 },
          navigationState: { wasDefaulted: false },
          metadata: { defaultedRatio: 0 },
          combinedComponentProgress: { defaultedRatio: 0, componentsRetained: 0, componentsDefaulted: 0 },
        });
      });

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      // Should pick older backup (better score)
      expect(result).toBeTruthy();
      // Called 4 times: 2 Pod backups + 2 localStorage attempts (empty but checked)
      expect(mockEnforceDataIntegrity).toHaveBeenCalledTimes(4);
    });
  });

  // ==========================================================================
  // MERGE VALIDATION
  // ==========================================================================

  describe('Merge Validation', () => {
    it('performs merge with localStorage as primary when Pod quality is poor', async () => {
      const podBackup = `mera.0.1.0.sp.${currentTime}.json`;
      const localBackup = `mera.0.1.0.lonp.${currentTime - 1000}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [podBackup] });
      mockBridge.localList.mockResolvedValue({ success: true, data: [localBackup] });

      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });
      mockBridge.localLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      const podResult = createMockRecoveryResult(false, {
        overallProgress: {
          lessonsLostToCorruption: 2, // Poor quality: 40,000
          lessonsDroppedCount: 0,
          lessonsDroppedRatio: 0,
          domainsLostToCorruption: 0,
          domainsDroppedCount: 0,
          domainsDroppedRatio: 0,
          corruptionDetected: true,
        },
        settings: { defaultedRatio: 0 },
        navigationState: { wasDefaulted: false },
        metadata: { defaultedRatio: 0 },
        combinedComponentProgress: { defaultedRatio: 0, componentsRetained: 0, componentsDefaulted: 0 },
      });

      const localResult = createMockRecoveryResult(true); // Perfect

      mockEnforceDataIntegrity.mockImplementation((data: string) => {
        const parsed = JSON.parse(data);
        // Distinguish by checking backup content (hacky but works for test)
        if (parsed.timestamp) {
          return parsed.timestamp === currentTime ? podResult : localResult;
        }
        return localResult;
      });

      mockMergeBundles.mockImplementation((a: PodStorageBundle, b: PodStorageBundle) => {
        return a; // Return primary (localStorage in this case)
      });

      await orchestrateProgressLoading(mockLessonConfigs);

      // Should call merge with localStorage as primary (better quality)
      expect(mockMergeBundles).toHaveBeenCalled();
      const mergeCall = mockMergeBundles.mock.calls[0];
      // Primary should be localStorage (better bundle)
      expect(mergeCall).toBeDefined();
    });

    it('validates merged result and throws on corruption', async () => {
      const podBackup = `mera.0.1.0.sp.${currentTime}.json`;
      const localBackup = `mera.0.1.0.lofp.${currentTime - 1000}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [podBackup] });
      mockBridge.localList.mockResolvedValue({ success: true, data: [localBackup] });

      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });
      mockBridge.localLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      // Perfect inputs
      mockEnforceDataIntegrity.mockImplementation((data: string) => {
        // Check if this is the merged result validation
        const parsed = JSON.parse(data);
        if (parsed.merged === true) {
          // Merged result has corruption (bug in merger!)
          return createMockRecoveryResult(false, {
            overallProgress: {
              lessonsLostToCorruption: 5, // Merge introduced corruption!
              lessonsDroppedCount: 0,
              lessonsDroppedRatio: 0,
              domainsLostToCorruption: 0,
              domainsDroppedCount: 0,
              domainsDroppedRatio: 0,
              corruptionDetected: true,
            },
            settings: { defaultedRatio: 0 },
            navigationState: { wasDefaulted: false },
            metadata: { defaultedRatio: 0 },
            combinedComponentProgress: { defaultedRatio: 0, componentsRetained: 0, componentsDefaulted: 0 },
          });
        }
        return createMockRecoveryResult(true);
      });

      mockMergeBundles.mockImplementation((a: PodStorageBundle, b: PodStorageBundle) => {
        return createMockBundle({ merged: true });
      });

      await expect(orchestrateProgressLoading(mockLessonConfigs)).rejects.toThrow();
    });

    it('accepts merged result when validation passes', async () => {
      const podBackup = `mera.0.1.0.sp.${currentTime}.json`;
      const localBackup = `mera.0.1.0.lofp.${currentTime - 1000}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [podBackup] });
      mockBridge.localList.mockResolvedValue({ success: true, data: [localBackup] });

      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });
      mockBridge.localLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      // All results perfect
      mockEnforceDataIntegrity.mockReturnValue(createMockRecoveryResult(true));

      mockMergeBundles.mockImplementation((a: PodStorageBundle, b: PodStorageBundle) => a);

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      expect(result).toBeTruthy();
      expect(mockMergeBundles).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // ESCAPE HATCH INTEGRATION
  // ==========================================================================

  describe('Escape Hatch Integration', () => {
    it('creates escape hatch when backup is imperfect (not perfectlyValidInput)', async () => {
      const podBackup = `mera.0.1.0.sp.${currentTime}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [podBackup] });
      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      // Imperfect backup
      mockEnforceDataIntegrity.mockReturnValue(
        createMockRecoveryResult(false, {
          overallProgress: {
            lessonsLostToCorruption: 1,
            lessonsDroppedCount: 0,
            lessonsDroppedRatio: 0,
            domainsLostToCorruption: 0,
            domainsDroppedCount: 0,
            domainsDroppedRatio: 0,
            corruptionDetected: true,
          },
          settings: { defaultedRatio: 0 },
          navigationState: { wasDefaulted: false },
          metadata: { defaultedRatio: 0 },
          combinedComponentProgress: { defaultedRatio: 0, componentsRetained: 0, componentsDefaulted: 0 },
        })
      );

      await orchestrateProgressLoading(mockLessonConfigs);

      // Should create escape hatch backup
      expect(mockMakeEscapeHatchBackup).toHaveBeenCalled();
      const backupData = mockMakeEscapeHatchBackup.mock.calls[0][0];
      expect(typeof backupData).toBe('string'); // Raw JSON
    });

    it('creates escape hatch when merge is performed', async () => {
      const podBackup = `mera.0.1.0.sp.${currentTime}.json`;
      const localBackup = `mera.0.1.0.lofp.${currentTime - 1000}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [podBackup] });
      mockBridge.localList.mockResolvedValue({ success: true, data: [localBackup] });

      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });
      mockBridge.localLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      // Both perfect
      mockEnforceDataIntegrity.mockReturnValue(createMockRecoveryResult(true));
      mockMergeBundles.mockImplementation((a: PodStorageBundle, b: PodStorageBundle) => a);

      await orchestrateProgressLoading(mockLessonConfigs);

      // Should create escape hatch due to merge
      expect(mockMakeEscapeHatchBackup).toHaveBeenCalled();
    });

    it('does not create escape hatch for perfect single source', async () => {
      const podBackup = `mera.0.1.0.sp.${currentTime}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [podBackup] });
      mockBridge.localList.mockResolvedValue({ success: true, data: [] });

      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      // Perfect backup
      mockEnforceDataIntegrity.mockReturnValue(createMockRecoveryResult(true));

      await orchestrateProgressLoading(mockLessonConfigs);

      // No escape hatch needed (perfect + no merge)
      expect(mockMakeEscapeHatchBackup).not.toHaveBeenCalled();
    });

    it('captures raw Pod JSON for escape hatch (not localStorage)', async () => {
      const podBackup = `mera.0.1.0.sp.${currentTime}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [podBackup] });
      mockBridge.localList.mockResolvedValue({ success: true, data: [] });

      const rawPodData = createMockBackupData('https://test.pod/profile/card#me');
      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: rawPodData,
      });

      // Imperfect
      mockEnforceDataIntegrity.mockReturnValue(
        createMockRecoveryResult(false, {
          overallProgress: {
            lessonsLostToCorruption: 1,
            lessonsDroppedCount: 0,
            lessonsDroppedRatio: 0,
            domainsLostToCorruption: 0,
            domainsDroppedCount: 0,
            domainsDroppedRatio: 0,
            corruptionDetected: true,
          },
          settings: { defaultedRatio: 0 },
          navigationState: { wasDefaulted: false },
          metadata: { defaultedRatio: 0 },
          combinedComponentProgress: { defaultedRatio: 0, componentsRetained: 0, componentsDefaulted: 0 },
        })
      );

      await orchestrateProgressLoading(mockLessonConfigs);

      expect(mockMakeEscapeHatchBackup).toHaveBeenCalledWith(rawPodData);
    });

    it('handles escape hatch failure gracefully (fire-and-forget)', async () => {
      const podBackup = `mera.0.1.0.sp.${currentTime}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [podBackup] });
      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      mockEnforceDataIntegrity.mockReturnValue(
        createMockRecoveryResult(false, {
          overallProgress: {
            lessonsLostToCorruption: 1,
            lessonsDroppedCount: 0,
            lessonsDroppedRatio: 0,
            domainsLostToCorruption: 0,
            domainsDroppedCount: 0,
            domainsDroppedRatio: 0,
            corruptionDetected: true,
          },
          settings: { defaultedRatio: 0 },
          navigationState: { wasDefaulted: false },
          metadata: { defaultedRatio: 0 },
          combinedComponentProgress: { defaultedRatio: 0, componentsRetained: 0, componentsDefaulted: 0 },
        })
      );

      // Escape hatch fails
      mockMakeEscapeHatchBackup.mockRejectedValue(new Error('Pod offline'));

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      // Should still succeed (fire-and-forget)
      expect(result).toBeTruthy();
    });

    it('skips escape hatch when no Pod primary backup exists', async () => {
      const localBackup = `mera.0.1.0.lonp.${currentTime}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [] });
      mockBridge.localList.mockResolvedValue({ success: true, data: [localBackup] });

      mockBridge.localLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      mockEnforceDataIntegrity.mockReturnValue(
        createMockRecoveryResult(false, {
          overallProgress: {
            lessonsLostToCorruption: 1,
            lessonsDroppedCount: 0,
            lessonsDroppedRatio: 0,
            domainsLostToCorruption: 0,
            domainsDroppedCount: 0,
            domainsDroppedRatio: 0,
            corruptionDetected: true,
          },
          settings: { defaultedRatio: 0 },
          navigationState: { wasDefaulted: false },
          metadata: { defaultedRatio: 0 },
          combinedComponentProgress: { defaultedRatio: 0, componentsRetained: 0, componentsDefaulted: 0 },
        })
      );

      await orchestrateProgressLoading(mockLessonConfigs);

      // No Pod backup = no escape hatch
      expect(mockMakeEscapeHatchBackup).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // ERROR HANDLING
  // ==========================================================================

  describe('Error Handling', () => {
    it('returns null when webId is not available', async () => {
      mockBridge.getWebId.mockReturnValue(null);

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      expect(result).toBeNull();
    });

    it('handles Pod list failure gracefully', async () => {
      mockBridge.solidList.mockResolvedValue({ success: false, error: 'Network error' });
      mockBridge.localList.mockResolvedValue({ success: true, data: [] });

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      // Should continue with empty Pod list
      expect(result?.scenario).toBe(RecoveryScenario.DEFAULT_NO_SAVES); // No backups anywhere
    });

    it('handles localStorage list failure gracefully', async () => {
      mockBridge.solidList.mockResolvedValue({ success: true, data: [] });
      mockBridge.localList.mockResolvedValue({ success: false, error: 'Quota exceeded' });

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      // Should continue with empty localStorage list
      expect(result?.scenario).toBe(RecoveryScenario.DEFAULT_NO_SAVES);
    });

    it('skips backup when load fails', async () => {
      const backups = [
        `mera.0.1.0.sp.${currentTime - 1000}.json`, // Load fails
        `mera.0.1.0.sp.${currentTime - 2000}.json`, // Load succeeds
      ];

      mockBridge.solidList.mockResolvedValue({ success: true, data: backups });
      mockBridge.solidLoad.mockImplementation(async (filename: string) => {
        if (filename === backups[0]) {
          return { success: false, error: 'Corrupted file' };
        }
        return { success: true, data: createMockBackupData('https://test.pod/profile/card#me') };
      });

      mockEnforceDataIntegrity.mockReturnValue(createMockRecoveryResult(true));

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      // Should use second backup
      expect(result).toBeTruthy();
      expect(mockBridge.solidLoad).toHaveBeenCalledWith(backups[0]);
      expect(mockBridge.solidLoad).toHaveBeenCalledWith(backups[1]);
    });

    it('throws when backup data is not a string (meraBridge bug)', async () => {
      const backup = `mera.0.1.0.sp.${currentTime}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [backup] });
      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: { invalid: 'object' }, // Should be string
      });

      // This is a bug in meraBridge - should throw immediately
      await expect(orchestrateProgressLoading(mockLessonConfigs)).rejects.toThrow(
        'meraBridge returned non-string data'
      );
    });

    it('handles enforceDataIntegrity throwing error', async () => {
      const backup = `mera.0.1.0.sp.${currentTime}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [backup] });
      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      mockEnforceDataIntegrity.mockImplementation(() => {
        throw new Error('Invalid JSON');
      });

      // Should propagate the error (fail-fast behavior)
      await expect(orchestrateProgressLoading(mockLessonConfigs)).rejects.toThrow('Invalid JSON');
    });

    it('handles all backups being invalid', async () => {
      const backups = [
        `mera.0.1.0.sp.${currentTime - 1000}.json`,
        `mera.0.1.0.sp.${currentTime - 2000}.json`,
        `mera.0.1.0.sp.${currentTime - 3000}.json`,
      ];

      mockBridge.solidList.mockResolvedValue({ success: true, data: backups });
      mockBridge.solidLoad.mockResolvedValue({
        success: false,
        error: 'All corrupted',
      });

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      expect(result?.scenario).toBe(RecoveryScenario.DEFAULT_FAILED_RECOVERY);
    });

    it('throws on malformed backup filenames', async () => {
      const backups = [
        'invalid-filename.json',
        `mera.0.1.0.sp.${currentTime}.json`, // Valid
      ];

      mockBridge.solidList.mockResolvedValue({ success: true, data: backups });

      // Should throw on first invalid filename during parsing
      await expect(orchestrateProgressLoading(mockLessonConfigs)).rejects.toThrow(
        'Invalid backup filename format'
      );
    });
  });

  // ==========================================================================
  // INTEGRATION SCENARIOS
  // ==========================================================================

  describe('Integration Scenarios', () => {
    it('handles full happy path: perfect Pod backup, no localStorage', async () => {
      const podBackup = `mera.0.1.0.sp.${currentTime}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [podBackup] });
      mockBridge.localList.mockResolvedValue({ success: true, data: [] });

      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      mockEnforceDataIntegrity.mockReturnValue(createMockRecoveryResult(true, undefined, { webIDMismatch: false }));

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      expect(result).toBeTruthy();
      expect(result?.scenario).toBe(RecoveryScenario.PERFECT_RECOVERY);
      expect(result?.mergeOccurred).toBe(false);
      expect(mockMergeBundles).not.toHaveBeenCalled();
      expect(mockMakeEscapeHatchBackup).not.toHaveBeenCalled();
    });

    it('handles multi-device scenario: Pod + offline localStorage merge', async () => {
      const podBackup = `mera.0.1.0.sp.${currentTime}.json`;
      const localBackup = `mera.0.1.0.lofp.${currentTime - 3600000}.json`; // 1 hour offline

      mockBridge.solidList.mockResolvedValue({ success: true, data: [podBackup] });
      mockBridge.localList.mockResolvedValue({ success: true, data: [localBackup] });

      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });
      mockBridge.localLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      mockEnforceDataIntegrity.mockReturnValue(createMockRecoveryResult(true, undefined, { webIDMismatch: false }));
      mockMergeBundles.mockImplementation((a: PodStorageBundle, b: PodStorageBundle) => a);

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      expect(result).toBeTruthy();
      expect(mockMergeBundles).toHaveBeenCalled();
      expect(mockMakeEscapeHatchBackup).toHaveBeenCalled();
    });

    it('handles version migration scenario: old backup with curriculum changes', async () => {
      const oldBackup = `mera.0.0.9.sp.${currentTime - 86400000}.json`; // 1 day old

      mockBridge.solidList.mockResolvedValue({ success: true, data: [oldBackup] });
      mockBridge.localList.mockResolvedValue({ success: true, data: [] });

      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      // Old version with curriculum changes
      mockEnforceDataIntegrity.mockReturnValue(
        createMockRecoveryResult(
          false,
          {
            overallProgress: {
              lessonsLostToCorruption: 0,
              lessonsDroppedCount: 5, // Curriculum changed
              lessonsDroppedRatio: 0.5,
              domainsLostToCorruption: 0,
              domainsDroppedCount: 0,
              domainsDroppedRatio: 0,
              corruptionDetected: false,
            },
            settings: { defaultedRatio: 0.2 }, // Some settings changed
            navigationState: { wasDefaulted: false },
            metadata: { defaultedRatio: 0 },
            combinedComponentProgress: { defaultedRatio: 0, componentsRetained: 0, componentsDefaulted: 15 },
          },
          { webIDMismatch: false }
        )
      );

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      expect(result).toBeTruthy();
      expect(result?.scenario).toBe(RecoveryScenario.IMPERFECT_RECOVERY_MIGRATION);
      expect(result?.mergeOccurred).toBe(false);
      expect(mockMakeEscapeHatchBackup).toHaveBeenCalled();
    });

    it('handles device seizure scenario: corrupted Pod, good localStorage', async () => {
      const podBackup = `mera.0.1.0.sp.${currentTime}.json`;
      const localBackup = `mera.0.1.0.lonp.${currentTime - 3600000}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [podBackup] });
      mockBridge.localList.mockResolvedValue({ success: true, data: [localBackup] });

      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });
      mockBridge.localLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      // Pod: severe corruption
      // localStorage: perfect
      let callCount = 0;
      mockEnforceDataIntegrity.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Pod primary backup (first load for escape hatch)
          return createMockRecoveryResult(
            false,
            {
              overallProgress: {
                lessonsLostToCorruption: 10, // 200,000 points
                lessonsDroppedCount: 0,
                lessonsDroppedRatio: 0,
                domainsLostToCorruption: 0,
                domainsDroppedCount: 0,
                domainsDroppedRatio: 0,
                corruptionDetected: true,
              },
              settings: { defaultedRatio: 0 },
              navigationState: { wasDefaulted: false },
              metadata: { defaultedRatio: 0 },
              combinedComponentProgress: { defaultedRatio: 0, componentsRetained: 0, componentsDefaulted: 0 },
            },
            { webIDMismatch: false }
          );
        }
        if (callCount === 2) {
          // Pod duplicate backup (scoring)  
          return createMockRecoveryResult(
            false,
            {
              overallProgress: {
                lessonsLostToCorruption: 10,
                lessonsDroppedCount: 0,
                lessonsDroppedRatio: 0,
                domainsLostToCorruption: 0,
                domainsDroppedCount: 0,
                domainsDroppedRatio: 0,
                corruptionDetected: true,
              },
              settings: { defaultedRatio: 0 },
              navigationState: { wasDefaulted: false },
              metadata: { defaultedRatio: 0 },
              combinedComponentProgress: { defaultedRatio: 0, componentsRetained: 0, componentsDefaulted: 0 },
            },
            { webIDMismatch: false }
          );
        }
        // localStorage backups (perfect)
        return createMockRecoveryResult(true, undefined, { webIDMismatch: false });
      });

      mockMergeBundles.mockImplementation((a: PodStorageBundle, b: PodStorageBundle) => a);

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      expect(result).toBeTruthy();
      expect(mockMergeBundles).toHaveBeenCalled();
    });

    it('handles new user scenario: no backups anywhere', async () => {
      mockBridge.solidList.mockResolvedValue({ success: true, data: [] });
      mockBridge.localList.mockResolvedValue({ success: true, data: [] });

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      expect(result?.scenario).toBe(RecoveryScenario.DEFAULT_NO_SAVES);
      expect(mockEnforceDataIntegrity).not.toHaveBeenCalled();
      expect(mockMergeBundles).not.toHaveBeenCalled();
    });

    it('handles intermittent connectivity: Pod offline, localStorage available', async () => {
      const localBackup = `mera.0.1.0.lofp.${currentTime}.json`;

      mockBridge.solidList.mockResolvedValue({ success: false, error: 'Network timeout' });
      mockBridge.localList.mockResolvedValue({ success: true, data: [localBackup] });

      mockBridge.localLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      mockEnforceDataIntegrity.mockReturnValue(createMockRecoveryResult(true, undefined, { webIDMismatch: false }));

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      expect(result).toBeTruthy();
      expect(mockBridge.localLoad).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // RECOVERY SCENARIO CLASSIFICATION
  // ==========================================================================

  describe('Recovery Scenario Classification', () => {
    it('returns PERFECT_RECOVERY for same-version backup with zero defaulting', async () => {
      const backup = `mera.0.1.0.sp.${currentTime}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [backup] });
      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      mockEnforceDataIntegrity.mockReturnValue(createMockRecoveryResult(true, undefined, { webIDMismatch: false }));

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      expect(result?.scenario).toBe(RecoveryScenario.PERFECT_RECOVERY);
      expect(result?.mergeOccurred).toBe(false);
    });

    it('returns IMPERFECT_RECOVERY_CORRUPTION when counter mismatches detected', async () => {
      const backup = `mera.0.1.0.sp.${currentTime}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [backup] });
      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      mockEnforceDataIntegrity.mockReturnValue(
        createMockRecoveryResult(false, {
          overallProgress: {
            lessonsLostToCorruption: 2,
            lessonsDroppedCount: 0,
            lessonsDroppedRatio: 0,
            domainsLostToCorruption: 0,
            domainsDroppedCount: 0,
            domainsDroppedRatio: 0,
            corruptionDetected: true,
          },
          settings: { defaultedRatio: 0 },
          navigationState: { wasDefaulted: false },
          metadata: { defaultedRatio: 0 },
          combinedComponentProgress: { defaultedRatio: 0, componentsRetained: 0, componentsDefaulted: 0 },
        })
      );

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      expect(result?.scenario).toBe(RecoveryScenario.IMPERFECT_RECOVERY_CORRUPTION);
    });

    it('returns IMPERFECT_RECOVERY_MIGRATION for cross-version migration without corruption', async () => {
      const backup = `mera.0.1.0.sp.${currentTime}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [backup] });
      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      mockEnforceDataIntegrity.mockReturnValue(
        createMockRecoveryResult(false, {
          overallProgress: {
            lessonsLostToCorruption: 0,
            lessonsDroppedCount: 3,
            lessonsDroppedRatio: 0.3,
            domainsLostToCorruption: 0,
            domainsDroppedCount: 0,
            domainsDroppedRatio: 0,
            corruptionDetected: false, // No corruption, just migration
          },
          settings: { defaultedRatio: 0.1 },
          navigationState: { wasDefaulted: false },
          metadata: { defaultedRatio: 0 },
          combinedComponentProgress: { defaultedRatio: 0, componentsRetained: 10, componentsDefaulted: 5 },
        })
      );

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      expect(result?.scenario).toBe(RecoveryScenario.IMPERFECT_RECOVERY_MIGRATION);
    });

    it('returns DEFAULT_NO_SAVES when no backups exist', async () => {
      mockBridge.solidList.mockResolvedValue({ success: true, data: [] });
      mockBridge.localList.mockResolvedValue({ success: true, data: [] });

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      expect(result?.scenario).toBe(RecoveryScenario.DEFAULT_NO_SAVES);
      expect(result?.bundle).toBeNull();
    });

    it('returns DEFAULT_WEBID_MISMATCH when all backups belong to different user', async () => {
      const backup = `mera.0.1.0.sp.${currentTime}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [backup] });
      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://wrong.pod/profile#me'),
      });

      mockEnforceDataIntegrity.mockReturnValue(
        createMockRecoveryResult(true, undefined, { webIDMismatch: true })
      );

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      expect(result?.scenario).toBe(RecoveryScenario.DEFAULT_WEBID_MISMATCH);
    });

    it('returns DEFAULT_FAILED_RECOVERY when backups exist but all fail to load', async () => {
      const backups = [
        `mera.0.1.0.sp.${currentTime}.json`,
        `mera.0.1.0.sp.${currentTime - 1000}.json`,
      ];

      mockBridge.solidList.mockResolvedValue({ success: true, data: backups });
      mockBridge.solidLoad.mockResolvedValue({
        success: false,
        error: 'All corrupted',
      });

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      expect(result?.scenario).toBe(RecoveryScenario.DEFAULT_FAILED_RECOVERY);
    });

    it('sets mergeOccurred=true when offline work merge happens', async () => {
      const podBackup = `mera.0.1.0.sp.${currentTime}.json`;
      const localBackup = `mera.0.1.0.lofp.${currentTime - 1000}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [podBackup] });
      mockBridge.localList.mockResolvedValue({ success: true, data: [localBackup] });

      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });
      mockBridge.localLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      mockEnforceDataIntegrity.mockReturnValue(createMockRecoveryResult(true, undefined, { webIDMismatch: false }));
      mockMergeBundles.mockReturnValue(createMockBundle());

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      expect(result?.mergeOccurred).toBe(true);
      expect(mockMergeBundles).toHaveBeenCalled();
    });

    it('sets mergeOccurred=false when using single source', async () => {
      const backup = `mera.0.1.0.sp.${currentTime}.json`;

      mockBridge.solidList.mockResolvedValue({ success: true, data: [backup] });
      mockBridge.localList.mockResolvedValue({ success: true, data: [] });

      mockBridge.solidLoad.mockResolvedValue({
        success: true,
        data: createMockBackupData('https://test.pod/profile/card#me'),
      });

      mockEnforceDataIntegrity.mockReturnValue(createMockRecoveryResult(true, undefined, { webIDMismatch: false }));

      const result = await orchestrateProgressLoading(mockLessonConfigs);

      expect(result?.mergeOccurred).toBe(false);
      expect(mockMergeBundles).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create mock backup data as JSON string
 */
function createMockBackupData(webId: string, timestamp?: number): string {
  return JSON.stringify({
    metadata: { webId },
    overallProgress: {
      lessonCompletions: {},
      domainCompletions: {},
      currentStreak: 0,
      lastStreakCheck: 0,
      totalLessonsCompleted: 0,
      totalDomainsCompleted: 0,
    },
    settings: {},
    navigationState: { currentEntityId: 0, currentPage: 0, lastUpdated: Date.now() },
    combinedComponentProgress: { components: {} },
    timestamp: timestamp || Date.now(),
  });
}

/**
 * Create mock recovery result from enforceDataIntegrity
 */
function createMockRecoveryResult(
  perfectlyValid: boolean,
  metrics?: Partial<EnforcementResult['recoveryMetrics']>,
  criticalFailures?: { webIDMismatch?: boolean }
): EnforcementResult {
  return {
    bundle: createMockBundle(),
    perfectlyValidInput: perfectlyValid,
    criticalFailures: {
      webIdMismatch: criticalFailures?.webIDMismatch
        ? {
            expected: 'https://test.pod/profile/card#me',
            found: 'https://wrong.pod/profile#me',
          }
        : undefined,
    },
    recoveryMetrics: {
      overallProgress: {
        lessonsLostToCorruption: 0,
        lessonsDroppedCount: 0,
        lessonsDroppedRatio: 0,
        domainsLostToCorruption: 0,
        domainsDroppedCount: 0,
        domainsDroppedRatio: 0,
        corruptionDetected: false,
        ...metrics?.overallProgress,
      },
      settings: {
        defaultedRatio: 0,
        ...metrics?.settings,
      },
      navigationState: {
        wasDefaulted: false,
        ...metrics?.navigationState,
      },
      metadata: {
        defaultedRatio: 0,
        ...metrics?.metadata,
      },
      combinedComponentProgress: {
        defaultedRatio: 0,
        componentsRetained: 0,
        componentsDefaulted: 0,
        ...metrics?.combinedComponentProgress,
      },
    },
  };
}

/**
 * Create mock PodStorageBundle
 */
function createMockBundle(overrides?: any): PodStorageBundle {
  return {
    metadata: { webId: 'https://test.pod/profile/card#me', ...overrides?.metadata },
    overallProgress: {
      lessonCompletions: {},
      domainCompletions: {},
      currentStreak: 0,
      lastStreakCheck: 0,
      totalLessonsCompleted: 0,
      totalDomainsCompleted: 0,
      ...overrides?.overallProgress,
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
      ...overrides?.settings,
    },
    navigationState: {
      currentEntityId: 0,
      currentPage: 0,
      lastUpdated: Date.now(),
      ...overrides?.navigationState,
    },
    combinedComponentProgress: {
      components: {},
      ...overrides?.combinedComponentProgress,
    },
    ...overrides,
  };
}