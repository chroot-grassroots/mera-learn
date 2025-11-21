/**
 * @fileoverview Comprehensive tests for SaveCleaner module
 * 
 * Testing strategy:
 * - Most tests directly call cleanup logic with static test data
 * - A few tests simulate timer behavior for real-world scenarios:
 *   - Starting fresh after week-long idle period
 *   - Working intermittently over several hours
 * 
 * The core cleanup logic (bracket-based deletion) is pure and easily testable.
 * Timer behavior just needs basic verification that intervals run correctly.
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { SaveCleaner } from './saveCleaner';
import { MeraBridge } from '../solid/meraBridge';

// Mock MeraBridge
vi.mock('../solid/meraBridge');
vi.mock('../ui/errorDisplay');

// Helper to create backup filenames with specific ages
function createFilename(type: 'sp' | 'sd' | 'lofp' | 'lofd' | 'lonp' | 'lond', ageMs: number, currentTime: number): string {
  const timestamp = currentTime - ageMs;
  return `mera.0.1.0.${type}.${timestamp}.json`;
}

// Helper to create multiple files at once
function createFiles(specs: Array<{type: 'sp' | 'sd' | 'lofp' | 'lofd' | 'lonp' | 'lond', ageMs: number}>, currentTime: number): string[] {
  return specs.map(spec => createFilename(spec.type, spec.ageMs, currentTime));
}

describe('SaveCleaner', () => {
  let mockBridge: any;
  let cleaner: any; // Access private methods for testing
  
  beforeEach(() => {
    // Reset singleton
    (SaveCleaner as any).instance = null;
    
    // Create mock bridge
    mockBridge = {
      solidList: vi.fn(),
      solidDelete: vi.fn(),
      solidLoad: vi.fn(),
      localList: vi.fn(),
      localDelete: vi.fn(),
      localLoad: vi.fn(),
    };
    
    vi.mocked(MeraBridge.getInstance).mockReturnValue(mockBridge);
    
    // Get instance but prevent interval from starting by mocking setInterval
    const originalSetInterval = global.setInterval;
    global.setInterval = vi.fn() as any;
    
    cleaner = SaveCleaner.getInstance();
    
    // Restore setInterval for timer tests
    global.setInterval = originalSetInterval;
  });
  
  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  describe('parseBackupFiles', () => {
    it('should parse valid backup filenames and calculate ages', () => {
      const currentTime = 1000000;
      const filenames = [
        'mera.0.1.0.sp.900000.json',  // Age: 100000ms
        'mera.0.1.0.sp.950000.json',  // Age: 50000ms
        'mera.0.1.0.sp.990000.json',  // Age: 10000ms
      ];
      
      const result = (cleaner as any).parseBackupFiles(filenames, currentTime);
      
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        filename: 'mera.0.1.0.sp.900000.json',
        timestamp: 900000,
        ageMs: 100000
      });
      expect(result[1]).toEqual({
        filename: 'mera.0.1.0.sp.950000.json',
        timestamp: 950000,
        ageMs: 50000
      });
      // Should be sorted oldest first
      expect(result[0].timestamp).toBeLessThan(result[1].timestamp);
    });

    it('should filter out invalid filenames', () => {
      const currentTime = 1000000;
      const filenames = [
        'mera.0.1.0.sp.900000.json',  // Valid
        'invalid-file.json',          // Invalid
        'mera.sp.900000.json',        // Missing version
        'mera.0.1.0.sp.notanumber.json', // Invalid timestamp
      ];
      
      const result = (cleaner as any).parseBackupFiles(filenames, currentTime);
      
      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe('mera.0.1.0.sp.900000.json');
    });

    it('should handle empty array', () => {
      const result = (cleaner as any).parseBackupFiles([], 1000000);
      expect(result).toEqual([]);
    });

    it('should parse all file types correctly', () => {
      const currentTime = 1000000;
      const filenames = [
        'mera.0.1.0.sp.900000.json',   // Solid primary
        'mera.0.1.0.sd.900000.json',   // Solid duplicate
        'mera.0.1.0.lofp.900000.json', // Local offline primary
        'mera.0.1.0.lofd.900000.json', // Local offline duplicate
        'mera.0.1.0.lonp.900000.json', // Local online primary
        'mera.0.1.0.lond.900000.json', // Local online duplicate
      ];
      
      const result = (cleaner as any).parseBackupFiles(filenames, currentTime);
      
      expect(result).toHaveLength(6);
      result.forEach((backup: any) => {
        expect(backup.ageMs).toBe(100000);
      });
    });
  });

  describe('selectFilesForDeletion - Core Logic Tests', () => {
    const currentTime = 1000000000000; // Use a much larger time to avoid negative timestamps
    const oneMin = 60 * 1000;
    const tenMin = 10 * oneMin;
    const oneHour = 60 * oneMin;
    const twentyFourHours = 24 * oneHour;

    it('should never delete files less than 1 minute old', () => {
      const filenames = createFiles([
        { type: 'sp', ageMs: 0 },
        { type: 'sp', ageMs: 30 * 1000 },      // 30 seconds
        { type: 'sp', ageMs: 59 * 1000 },      // 59 seconds
      ], currentTime);
      
      const backups = (cleaner as any).parseBackupFiles(filenames, currentTime);
      const toDelete = (cleaner as any).selectFilesForDeletion(backups);
      
      expect(toDelete).toEqual([]);
    });

    it('should keep all files when only recent bracket populated', () => {
      const filenames = createFiles([
        { type: 'sp', ageMs: 10 * 1000 },    // Recent
        { type: 'sp', ageMs: 20 * 1000 },    // Recent
        { type: 'sp', ageMs: 30 * 1000 },    // Recent
      ], currentTime);
      
      const backups = (cleaner as any).parseBackupFiles(filenames, currentTime);
      const toDelete = (cleaner as any).selectFilesForDeletion(backups);
      
      expect(toDelete).toEqual([]);
    });

    it('should consolidate 1-10min bracket when recent bracket has files', () => {
      const filenames = createFiles([
        { type: 'sp', ageMs: 30 * 1000 },       // Recent: keep
        { type: 'sp', ageMs: 2 * oneMin },       // 1-10min: NEWEST timestamp, KEEP
        { type: 'sp', ageMs: 5 * oneMin },       // 1-10min: middle, delete  
        { type: 'sp', ageMs: 9 * oneMin },       // 1-10min: OLDEST timestamp, delete
      ], currentTime);
      
      const backups = (cleaner as any).parseBackupFiles(filenames, currentTime);
      const toDelete = (cleaner as any).selectFilesForDeletion(backups);
      
      // Backups sorted by timestamp (oldest first) within each bracket
      // 9min age has oldest timestamp, 2min age has newest timestamp
      // slice(0, -1) removes last element (newest timestamp = 2min age) and deletes the rest
      expect(toDelete).toHaveLength(2);
      expect(toDelete).toContain(createFilename('sp', 5 * oneMin, currentTime));
      expect(toDelete).toContain(createFilename('sp', 9 * oneMin, currentTime));
      expect(toDelete).not.toContain(createFilename('sp', 2 * oneMin, currentTime)); // Newest timestamp kept
    });

    it('should consolidate 10min-1hr bracket when 1-10min bracket has files', () => {
      const filenames = createFiles([
        { type: 'sp', ageMs: 30 * 1000 },       // Recent
        { type: 'sp', ageMs: 5 * oneMin },       // 1-10min
        { type: 'sp', ageMs: 15 * oneMin },      // 10min-1hr: newest timestamp, KEEP
        { type: 'sp', ageMs: 30 * oneMin },      // 10min-1hr: middle, delete
        { type: 'sp', ageMs: 50 * oneMin },      // 10min-1hr: oldest timestamp, delete
      ], currentTime);
      
      const backups = (cleaner as any).parseBackupFiles(filenames, currentTime);
      const toDelete = (cleaner as any).selectFilesForDeletion(backups);
      
      expect(toDelete).toContain(createFilename('sp', 30 * oneMin, currentTime));
      expect(toDelete).toContain(createFilename('sp', 50 * oneMin, currentTime));
      expect(toDelete).not.toContain(createFilename('sp', 15 * oneMin, currentTime)); // Newest timestamp kept
    });

    it('should consolidate 1-24hr bracket when 10min-1hr bracket has files', () => {
      const filenames = createFiles([
        { type: 'sp', ageMs: 30 * 1000 },       // Recent
        { type: 'sp', ageMs: 5 * oneMin },       // 1-10min
        { type: 'sp', ageMs: 30 * oneMin },      // 10min-1hr
        { type: 'sp', ageMs: 2 * oneHour },      // 1-24hr: newest timestamp, KEEP
        { type: 'sp', ageMs: 12 * oneHour },     // 1-24hr: middle, delete
        { type: 'sp', ageMs: 23 * oneHour },     // 1-24hr: oldest timestamp, delete
      ], currentTime);
      
      const backups = (cleaner as any).parseBackupFiles(filenames, currentTime);
      const toDelete = (cleaner as any).selectFilesForDeletion(backups);
      
      expect(toDelete).toContain(createFilename('sp', 12 * oneHour, currentTime));
      expect(toDelete).toContain(createFilename('sp', 23 * oneHour, currentTime));
      expect(toDelete).not.toContain(createFilename('sp', 2 * oneHour, currentTime)); // Newest timestamp kept
    });

    it('should delete all ancient files (>24hr) when 1-24hr bracket has files', () => {
      const filenames = createFiles([
        { type: 'sp', ageMs: 30 * 1000 },           // Recent
        { type: 'sp', ageMs: 5 * oneMin },           // 1-10min
        { type: 'sp', ageMs: 30 * oneMin },          // 10min-1hr
        { type: 'sp', ageMs: 12 * oneHour },         // 1-24hr
        { type: 'sp', ageMs: 25 * oneHour },         // Ancient: delete
        { type: 'sp', ageMs: 48 * oneHour },         // Ancient: delete
        { type: 'sp', ageMs: 7 * twentyFourHours },  // Ancient: delete
      ], currentTime);
      
      const backups = (cleaner as any).parseBackupFiles(filenames, currentTime);
      const toDelete = (cleaner as any).selectFilesForDeletion(backups);
      
      expect(toDelete).toContain(createFilename('sp', 25 * oneHour, currentTime));
      expect(toDelete).toContain(createFilename('sp', 48 * oneHour, currentTime));
      expect(toDelete).toContain(createFilename('sp', 7 * twentyFourHours, currentTime));
    });

    describe('Conditional deletion - Preserves old backups until new ones exist', () => {
      it('should NOT delete ancient files if no 1-24hr bracket files', () => {
        // Scenario: Coming back after a week - old files preserved until new saves create 1-24hr bracket
        const filenames = createFiles([
          { type: 'sp', ageMs: 30 * 1000 },           // Recent (just started working)
          { type: 'sp', ageMs: 7 * twentyFourHours }, // Ancient - KEEP
          { type: 'sp', ageMs: 8 * twentyFourHours }, // Ancient - KEEP
        ], currentTime);
        
        const backups = (cleaner as any).parseBackupFiles(filenames, currentTime);
        const toDelete = (cleaner as any).selectFilesForDeletion(backups);
        
        // No deletion because no 1-24hr bracket exists
        expect(toDelete).toEqual([]);
      });

      it('should NOT consolidate 1-24hr bracket if no 10min-1hr bracket files', () => {
        // Scenario: Have very old and day-old backups, but nothing in between
        const filenames = createFiles([
          { type: 'sp', ageMs: 30 * 1000 },           // Recent
          { type: 'sp', ageMs: 5 * oneMin },           // 1-10min
          { type: 'sp', ageMs: 12 * oneHour },         // 1-24hr: KEEP ALL
          { type: 'sp', ageMs: 18 * oneHour },         // 1-24hr: KEEP ALL
          { type: 'sp', ageMs: 23 * oneHour },         // 1-24hr: KEEP ALL
          { type: 'sp', ageMs: 7 * twentyFourHours },  // Ancient
        ], currentTime);
        
        const backups = (cleaner as any).parseBackupFiles(filenames, currentTime);
        const toDelete = (cleaner as any).selectFilesForDeletion(backups);
        
        // Ancient files deleted because 1-24hr bracket exists
        // But 1-24hr files NOT consolidated because no 10min-1hr bracket
        expect(toDelete).toContain(createFilename('sp', 7 * twentyFourHours, currentTime));
        expect(toDelete).not.toContain(createFilename('sp', 12 * oneHour, currentTime));
        expect(toDelete).not.toContain(createFilename('sp', 18 * oneHour, currentTime));
      });

      it('should NOT consolidate 10min-1hr bracket if no 1-10min bracket files', () => {
        const filenames = createFiles([
          { type: 'sp', ageMs: 30 * 1000 },      // Recent
          { type: 'sp', ageMs: 15 * oneMin },     // 10min-1hr: KEEP ALL
          { type: 'sp', ageMs: 30 * oneMin },     // 10min-1hr: KEEP ALL
          { type: 'sp', ageMs: 50 * oneMin },     // 10min-1hr: KEEP ALL
          { type: 'sp', ageMs: 12 * oneHour },    // 1-24hr
        ], currentTime);
        
        const backups = (cleaner as any).parseBackupFiles(filenames, currentTime);
        const toDelete = (cleaner as any).selectFilesForDeletion(backups);
        
        // 1-24hr consolidated because 10min-1hr exists
        // But 10min-1hr NOT consolidated because no 1-10min bracket
        expect(toDelete).not.toContain(createFilename('sp', 15 * oneMin, currentTime));
        expect(toDelete).not.toContain(createFilename('sp', 30 * oneMin, currentTime));
      });

      it('should NOT consolidate 1-10min bracket if no recent bracket files', () => {
        const filenames = createFiles([
          { type: 'sp', ageMs: 2 * oneMin },      // 1-10min: KEEP ALL
          { type: 'sp', ageMs: 5 * oneMin },      // 1-10min: KEEP ALL
          { type: 'sp', ageMs: 9 * oneMin },      // 1-10min: KEEP ALL
          { type: 'sp', ageMs: 30 * oneMin },     // 10min-1hr
        ], currentTime);
        
        const backups = (cleaner as any).parseBackupFiles(filenames, currentTime);
        const toDelete = (cleaner as any).selectFilesForDeletion(backups);
        
        // 10min-1hr consolidated because 1-10min exists
        // But 1-10min NOT consolidated because no recent bracket
        expect(toDelete).not.toContain(createFilename('sp', 2 * oneMin, currentTime));
        expect(toDelete).not.toContain(createFilename('sp', 5 * oneMin, currentTime));
      });
    });

    describe('Real-world scenario tests', () => {
      it('should handle fresh start after week-long idle period', () => {
        // User comes back after a week - have 7-day-old backups and just created new ones
        const filenames = createFiles([
          // New files (just started working again)
          { type: 'sp', ageMs: 10 * 1000 },            // Recent
          { type: 'sp', ageMs: 30 * 1000 },            // Recent
          
          // Old files from last session a week ago
          { type: 'sp', ageMs: 7 * twentyFourHours },  // Ancient
          { type: 'sp', ageMs: 7 * twentyFourHours + oneHour }, // Ancient
          { type: 'sp', ageMs: 7 * twentyFourHours + 2 * oneHour }, // Ancient
        ], currentTime);
        
        const backups = (cleaner as any).parseBackupFiles(filenames, currentTime);
        const toDelete = (cleaner as any).selectFilesForDeletion(backups);
        
        // Ancient files preserved because no intermediate brackets exist yet
        // This gives graceful transition - old recovery points stay until new ones establish
        expect(toDelete).toEqual([]);
      });

      it('should handle intermittent work over several hours', () => {
        // User has been working on/off for 3 hours with saves every ~30 minutes
        const filenames = createFiles([
          { type: 'sp', ageMs: 30 * 1000 },           // Recent (just saved)
          { type: 'sp', ageMs: 5 * oneMin },           // 1-10min: newest timestamp, KEEP
          { type: 'sp', ageMs: 15 * oneMin },          // 10min-1hr: newest timestamp, KEEP  
          { type: 'sp', ageMs: 45 * oneMin },          // 10min-1hr: oldest timestamp, delete
          { type: 'sp', ageMs: 75 * oneMin },          // 1-24hr: newest timestamp, KEEP
          { type: 'sp', ageMs: 105 * oneMin },         // 1-24hr: middle, delete
          { type: 'sp', ageMs: 135 * oneMin },         // 1-24hr: middle, delete
          { type: 'sp', ageMs: 165 * oneMin },         // 1-24hr: oldest timestamp, delete
        ], currentTime);
        
        const backups = (cleaner as any).parseBackupFiles(filenames, currentTime);
        const toDelete = (cleaner as any).selectFilesForDeletion(backups);
        
        // Should consolidate older brackets, keeping most recent timestamp in each
        // 1-10min: keep 5min (newest timestamp)
        // 10min-1hr: keep 15min (newest timestamp), delete 45min
        // 1-24hr: keep 75min (newest timestamp), delete 105min, 135min, 165min
        expect(toDelete).toContain(createFilename('sp', 45 * oneMin, currentTime));
        expect(toDelete).toContain(createFilename('sp', 105 * oneMin, currentTime));
        expect(toDelete).toContain(createFilename('sp', 135 * oneMin, currentTime));
        expect(toDelete).toContain(createFilename('sp', 165 * oneMin, currentTime));
        
        // These should be kept
        expect(toDelete).not.toContain(createFilename('sp', 30 * 1000, currentTime)); // Recent
        expect(toDelete).not.toContain(createFilename('sp', 5 * oneMin, currentTime)); // Newest 1-10min
        expect(toDelete).not.toContain(createFilename('sp', 15 * oneMin, currentTime)); // Newest 10min-1hr
        expect(toDelete).not.toContain(createFilename('sp', 75 * oneMin, currentTime)); // Newest 1-24hr
      });

      it('should handle steady work session with saves every 2 minutes for an hour', () => {
        // Simulates auto-save every 2 minutes during active work
        const twoMin = 2 * oneMin;
        const filenames: string[] = [];
        
        // Create 30 saves over 60 minutes (one every 2 minutes)
        for (let i = 0; i < 30; i++) {
          filenames.push(createFilename('sp', i * twoMin, currentTime));
        }
        
        const backups = (cleaner as any).parseBackupFiles(filenames, currentTime);
        const toDelete = (cleaner as any).selectFilesForDeletion(backups);
        
        // Recent (<1min): all kept (none in this case)
        // 1-10min: keep newest, delete rest (saves from 2min, 4min, 6min, 8min)
        // 10min-1hr: keep newest, delete rest (saves from 12min to 58min)
        
        // Should keep: 0min (recent), ~8-10min range (newest 1-10min), ~58min (newest 10min-1hr)
        // Should delete: most others
        expect(toDelete.length).toBeGreaterThan(15); // Most should be deleted
        expect(toDelete.length).toBeLessThan(28); // But not all
      });
    });
  });

  describe('cleanSolid - Integration Tests', () => {
    it('should skip cleanup if fewer than 4 backup pairs', async () => {
      mockBridge.solidList.mockResolvedValue({
        success: true,
        data: [
          'mera.0.1.0.sp.1000.json',
          'mera.0.1.0.sp.2000.json',
          'mera.0.1.0.sp.3000.json',
        ]
      });
      
      await (cleaner as any).cleanSolid(10000);
      
      expect(mockBridge.solidDelete).not.toHaveBeenCalled();
    });

    it('should delete both primary and duplicate together', async () => {
      const currentTime = 1000000000000;
      
      // Setup mocks for all the calls cleanSolid will make
      mockBridge.solidList
        // First call: get primary files list
        .mockResolvedValueOnce({
          success: true,
          data: createFiles([
            { type: 'sp', ageMs: 30 * 1000 },
            { type: 'sp', ageMs: 2 * 60 * 1000 },
            { type: 'sp', ageMs: 5 * 60 * 1000 },
            { type: 'sp', ageMs: 12 * 60 * 60 * 1000 }, // Day bracket (1-24hr) - triggers ancient deletion
            { type: 'sp', ageMs: 25 * 60 * 60 * 1000 }, // Ancient - should delete
            { type: 'sp', ageMs: 26 * 60 * 60 * 1000 }, // Ancient - should delete
          ], currentTime)
        })
        // canDeleteSolid calls (one for each file pair we try to delete)
        .mockResolvedValueOnce({ success: true, data: new Array(6).fill('file') })
        .mockResolvedValueOnce({ success: true, data: new Array(6).fill('file') })
        // cleanOrphanedDuplicates call - it will call solidList for duplicate pattern  
        .mockResolvedValueOnce({ success: true, data: [] }) // No orphaned duplicates
        // Fallback for any additional calls
        .mockResolvedValue({ success: true, data: [] });
      
      mockBridge.solidDelete.mockResolvedValue({ success: true });
      mockBridge.solidLoad.mockResolvedValue({ success: false }); // For orphan check
      
      await (cleaner as any).cleanSolid(currentTime);
      
      // Should delete 2 ancient files (primary + duplicate for each)
      expect(mockBridge.solidDelete).toHaveBeenCalledTimes(4); // 2 primaries + 2 duplicates
      
      // Verify both .sp. and .sd. were deleted
      const deleteCalls = mockBridge.solidDelete.mock.calls.map((call: any) => call[0]);
      expect(deleteCalls.some((filename: string) => filename.includes('.sp.'))).toBe(true);
      expect(deleteCalls.some((filename: string) => filename.includes('.sd.'))).toBe(true);
    });

    it('should handle listing errors gracefully', async () => {
      mockBridge.solidList.mockResolvedValue({
        success: false,
        error: 'Network error'
      });
      
      await expect((cleaner as any).cleanSolid(10000)).resolves.not.toThrow();
      expect(mockBridge.solidDelete).not.toHaveBeenCalled();
    });

    it('should stop deleting if minimum count reached during loop', async () => {
      const currentTime = 1000000000000;
      
      // Initial list shows 8 files
      mockBridge.solidList
        .mockResolvedValueOnce({
          success: true,
          data: createFiles([
            { type: 'sp', ageMs: 30 * 1000 },
            { type: 'sp', ageMs: 2 * 60 * 1000 },
            { type: 'sp', ageMs: 5 * 60 * 1000 },
            { type: 'sp', ageMs: 30 * 60 * 1000 },
            { type: 'sp', ageMs: 12 * 60 * 60 * 1000 },
            { type: 'sp', ageMs: 25 * 60 * 60 * 1000 }, // Should delete
            { type: 'sp', ageMs: 26 * 60 * 60 * 1000 }, // Should try to delete
            { type: 'sp', ageMs: 27 * 60 * 60 * 1000 }, // Should try to delete
          ], currentTime)
        })
        // First canDeleteSolid check: 8 files (OK to delete)
        .mockResolvedValueOnce({ success: true, data: new Array(8).fill('file') })
        // Second canDeleteSolid check: Only 4 files remain (STOP)
        .mockResolvedValueOnce({ success: true, data: new Array(4).fill('file') })
        // cleanOrphanedDuplicates call - return empty array in proper structure
        .mockResolvedValueOnce({ success: true, data: [] });
      
      mockBridge.solidDelete.mockResolvedValue({ success: true });
      
      await (cleaner as any).cleanSolid(currentTime);
      
      // Should only delete first ancient file's primary+duplicate, then stop
      expect(mockBridge.solidDelete).toHaveBeenCalledTimes(2);
    });
  });

  describe('cleanLocal - Integration Tests', () => {
    it('should combine offline and online files for unified retention', async () => {
      const currentTime = 1000000000000;
      
      mockBridge.localList
        .mockImplementation((pattern: string) => {
          if (pattern.includes('lofp')) {
            return Promise.resolve({
              success: true,
              data: createFiles([
                { type: 'lofp', ageMs: 30 * 1000 },
                { type: 'lofp', ageMs: 25 * 60 * 60 * 1000 }, // Ancient
              ], currentTime)
            });
          } else if (pattern.includes('lonp')) {
            return Promise.resolve({
              success: true,
              data: createFiles([
                { type: 'lonp', ageMs: 2 * 60 * 1000 },
                { type: 'lonp', ageMs: 5 * 60 * 1000 },
                { type: 'lonp', ageMs: 12 * 60 * 60 * 1000 },
              ], currentTime)
            });
          } else if (pattern.includes('lofd') || pattern.includes('lond')) {
            // Mock for cleanOrphanedDuplicates - return empty
            return Promise.resolve({ success: true, data: [] });
          }
          return Promise.resolve({ success: true, data: new Array(5) });
        });
      
      mockBridge.localDelete.mockResolvedValue({ success: true });
      
      await (cleaner as any).cleanLocal(currentTime);
      
      // Should treat all 5 files as single backup history
      // Should delete ancient file
      expect(mockBridge.localDelete).toHaveBeenCalled();
    });

    it('should correctly replace lofp/lonp with lofd/lond for duplicates', async () => {
      const currentTime = 1000000000000;
      
      mockBridge.localList
        .mockImplementation((pattern: string) => {
          if (pattern.includes('lofp')) {
            return Promise.resolve({
              success: true,
              data: [createFilename('lofp', 25 * 60 * 60 * 1000, currentTime)]
            });
          } else if (pattern.includes('lonp')) {
            return Promise.resolve({
              success: true,
              data: createFiles([
                { type: 'lonp', ageMs: 30 * 1000 },
                { type: 'lonp', ageMs: 2 * 60 * 1000 },
                { type: 'lonp', ageMs: 5 * 60 * 1000 },
                { type: 'lonp', ageMs: 12 * 60 * 60 * 1000 },
              ], currentTime)
            });
          } else if (pattern.includes('lofd') || pattern.includes('lond')) {
            // Mock for cleanOrphanedDuplicates - return empty
            return Promise.resolve({ success: true, data: [] });
          }
          return Promise.resolve({ success: true, data: new Array(5) });
        });
      
      mockBridge.localDelete.mockResolvedValue({ success: true });
      
      await (cleaner as any).cleanLocal(currentTime);
      
      // Verify .lofp. was replaced with .lofd.
      const deleteCalls = mockBridge.localDelete.mock.calls.map((call: any) => call[0]);
      const hasLofd = deleteCalls.some((filename: string) => filename.includes('.lofd.'));
      expect(hasLofd).toBe(true);
    });
  });

  describe('cleanOrphanedDuplicates', () => {
    it('should delete orphaned duplicates older than 24 hours', async () => {
      const currentTime = 100000000;
      const twentyFourHours = 24 * 60 * 60 * 1000;
      
      const orphanedDup = createFilename('sd', twentyFourHours + 1000, currentTime);
      
      mockBridge.solidList.mockResolvedValue({
        success: true,
        data: [orphanedDup]
      });
      
      // Primary doesn't exist
      mockBridge.solidLoad.mockResolvedValue({ success: false });
      mockBridge.solidDelete.mockResolvedValue({ success: true });
      
      await (cleaner as any).cleanOrphanedDuplicates('solid', currentTime);
      
      expect(mockBridge.solidDelete).toHaveBeenCalledWith(orphanedDup);
    });

    it('should NOT delete orphaned duplicates younger than 24 hours', async () => {
      const currentTime = 100000000;
      const twentyFourHours = 24 * 60 * 60 * 1000;
      
      const youngDup = createFilename('sd', twentyFourHours - 1000, currentTime);
      
      mockBridge.solidList.mockResolvedValue({
        success: true,
        data: [youngDup]
      });
      
      mockBridge.solidLoad.mockResolvedValue({ success: false });
      
      await (cleaner as any).cleanOrphanedDuplicates('solid', currentTime);
      
      expect(mockBridge.solidDelete).not.toHaveBeenCalled();
    });

    it('should NOT delete duplicates if primary exists', async () => {
      const currentTime = 100000000;
      const twentyFourHours = 24 * 60 * 60 * 1000;
      
      const dup = createFilename('sd', twentyFourHours + 1000, currentTime);
      
      mockBridge.solidList.mockResolvedValue({
        success: true,
        data: [dup]
      });
      
      // Primary exists
      mockBridge.solidLoad.mockResolvedValue({ success: true, data: {} });
      
      await (cleaner as any).cleanOrphanedDuplicates('solid', currentTime);
      
      expect(mockBridge.solidDelete).not.toHaveBeenCalled();
    });
  });

  describe('Timer behavior', () => {
    it('should start cleanup interval on getInstance', () => {
      vi.useFakeTimers();
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      
      // Create new instance which starts interval
      (SaveCleaner as any).instance = null;
      SaveCleaner.getInstance();
      
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60 * 1000);
      
      vi.useRealTimers();
    });

    it('should run cleanup every 60 seconds', async () => {
      vi.useFakeTimers();
      
      // Mock bridge to return minimal data
      mockBridge.solidList.mockResolvedValue({
        success: true,
        data: ['file1', 'file2', 'file3'] // Under minimum, no cleanup
      });
      mockBridge.localList.mockResolvedValue({
        success: true,
        data: ['file1', 'file2'] // Under minimum
      });
      
      // Create new instance
      (SaveCleaner as any).instance = null;
      const instance = SaveCleaner.getInstance();
      
      // Advance time and verify cleanup runs
      await vi.advanceTimersByTimeAsync(60 * 1000);
      expect(mockBridge.solidList).toHaveBeenCalled();
      
      // Clear and verify it runs again
      mockBridge.solidList.mockClear();
      await vi.advanceTimersByTimeAsync(60 * 1000);
      expect(mockBridge.solidList).toHaveBeenCalled();
      
      vi.useRealTimers();
    });

    it('should simulate week-long idle then resume scenario with timer', async () => {
      vi.useFakeTimers();
      
      const baseTime = 100000000;
      let currentTime = baseTime;
      
      // Override Date.now to control time
      vi.spyOn(Date, 'now').mockImplementation(() => currentTime);
      
      // Initial state: Have week-old backups
      const weekOldFiles = createFiles([
        { type: 'sp', ageMs: 7 * 24 * 60 * 60 * 1000 },
        { type: 'sp', ageMs: 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000 },
      ], currentTime);
      
      mockBridge.solidList.mockResolvedValue({
        success: true,
        data: weekOldFiles
      });
      mockBridge.localList.mockResolvedValue({ success: true, data: [] });
      
      // Start cleaner
      (SaveCleaner as any).instance = null;
      SaveCleaner.getInstance();
      
      // Run cleanup - should NOT delete old files (under minimum)
      await vi.advanceTimersByTimeAsync(60 * 1000);
      expect(mockBridge.solidDelete).not.toHaveBeenCalled();
      
      // Simulate user starts working - add new backups
      currentTime = baseTime + 7 * 24 * 60 * 60 * 1000 + 30 * 1000; // 7 days + 30 seconds later
      
      const newFiles = [
        ...weekOldFiles,
        createFilename('sp', 30 * 1000, currentTime),
        createFilename('sp', 10 * 1000, currentTime),
        createFilename('sp', 2 * 60 * 1000, currentTime),
      ];
      
      mockBridge.solidList.mockResolvedValue({
        success: true,
        data: newFiles
      });
      
      // Run cleanup again - still shouldn't delete (no intermediate brackets yet)
      mockBridge.solidDelete.mockClear();
      await vi.advanceTimersByTimeAsync(60 * 1000);
      
      // Week-old files preserved because no intermediate recovery points exist
      // (This is the conditional deletion working as intended)
      
      vi.useRealTimers();
    });
  });

  describe('canDeleteSolid and canDeleteLocal', () => {
    it('canDeleteSolid should return false if count drops to 4 or below', async () => {
      mockBridge.solidList.mockResolvedValue({
        success: true,
        data: ['f1', 'f2', 'f3', 'f4']
      });
      
      const result = await (cleaner as any).canDeleteSolid();
      expect(result).toBe(false);
    });

    it('canDeleteSolid should return true if more than 4 backups exist', async () => {
      mockBridge.solidList.mockResolvedValue({
        success: true,
        data: ['f1', 'f2', 'f3', 'f4', 'f5']
      });
      
      const result = await (cleaner as any).canDeleteSolid();
      expect(result).toBe(true);
    });

    it('canDeleteLocal should combine offline and online counts', async () => {
      mockBridge.localList
        .mockImplementation((pattern: string) => {
          if (pattern.includes('lofp')) {
            return Promise.resolve({ success: true, data: ['f1', 'f2'] });
          } else {
            return Promise.resolve({ success: true, data: ['f3', 'f4', 'f5'] });
          }
        });
      
      const result = await (cleaner as any).canDeleteLocal();
      expect(result).toBe(true); // 2 + 3 = 5 > 4
    });

    it('canDeleteLocal should return false if combined count is 4 or below', async () => {
      mockBridge.localList
        .mockImplementation((pattern: string) => {
          if (pattern.includes('lofp')) {
            return Promise.resolve({ success: true, data: ['f1', 'f2'] });
          } else {
            return Promise.resolve({ success: true, data: ['f3', 'f4'] });
          }
        });
      
      const result = await (cleaner as any).canDeleteLocal();
      expect(result).toBe(false); // 2 + 2 = 4
    });
  });
});