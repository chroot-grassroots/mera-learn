// src/ts/core/overallProgressSchema.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OverallProgressManager,
  OverallProgressMessageQueueManager,
} from './overallProgressSchema.js';

describe('OverallProgressManager', () => {
  let mockRegistry: any;
  let manager: OverallProgressManager;

  beforeEach(() => {
    mockRegistry = {
      hasLesson: vi.fn((id: number) => id === 100 || id === 200),
    };

    const initialProgress = {
      lessonCompletions: {},
      domainsCompleted: [],
      currentStreak: 0,
      lastStreakCheck: Math.floor(Date.now() / 1000),
    };

    manager = new OverallProgressManager(initialProgress, mockRegistry);
  });

  describe('markLessonComplete', () => {
    it('marks lesson as complete with timestamp', () => {
      const before = Math.floor(Date.now() / 1000);
      manager.markLessonComplete(100);
      const progress = manager.getProgress();

      expect(progress.lessonCompletions['100']).toBeGreaterThanOrEqual(before);
      expect(progress.lessonCompletions['100']).toBeLessThanOrEqual(
        Math.floor(Date.now() / 1000)
      );
    });

    it('updates timestamp if already completed', () => {
      manager.markLessonComplete(100);
      const firstTimestamp = manager.getProgress().lessonCompletions['100'];

      // Wait a bit
      vi.useFakeTimers();
      vi.advanceTimersByTime(2000);

      manager.markLessonComplete(100);
      const secondTimestamp = manager.getProgress().lessonCompletions['100'];

      expect(secondTimestamp).toBeGreaterThan(firstTimestamp);
      vi.useRealTimers();
    });

    it('throws error for invalid lesson ID', () => {
      expect(() => manager.markLessonComplete(999)).toThrow(
        'Invalid lesson ID: 999'
      );
    });
  });

  describe('markLessonIncomplete', () => {
    it('removes lesson completion', () => {
      manager.markLessonComplete(100);
      expect(manager.getProgress().lessonCompletions['100']).toBeDefined();

      manager.markLessonIncomplete(100);
      expect(manager.getProgress().lessonCompletions['100']).toBeUndefined();
    });

    it('throws error for invalid lesson ID', () => {
      expect(() => manager.markLessonIncomplete(999)).toThrow(
        'Invalid lesson ID: 999'
      );
    });

    it('does not error if lesson was not completed', () => {
      expect(() => manager.markLessonIncomplete(100)).not.toThrow();
    });
  });

  describe('streak management', () => {
    it('updates streak with new value', () => {
      const before = Math.floor(Date.now() / 1000);
      manager.updateStreak(5);
      const progress = manager.getProgress();

      expect(progress.currentStreak).toBe(5);
      expect(progress.lastStreakCheck).toBeGreaterThanOrEqual(before);
    });

    it('resets streak to zero', () => {
      manager.updateStreak(10);
      manager.resetStreak();
      const progress = manager.getProgress();

      expect(progress.currentStreak).toBe(0);
    });

    it('increments streak', () => {
      manager.updateStreak(3);
      manager.incrementStreak();
      const progress = manager.getProgress();

      expect(progress.currentStreak).toBe(4);
    });
  });

  describe('setDefaultsIfBlank', () => {
    it('initializes missing fields', () => {
      const emptyProgress: any = {};
      const emptyManager = new OverallProgressManager(
        emptyProgress,
        mockRegistry
      );

      emptyManager.setDefaultsIfBlank();
      const progress = emptyManager.getProgress();

      expect(progress.lessonCompletions).toEqual({});
      expect(progress.domainsCompleted).toEqual([]);
      expect(progress.currentStreak).toBe(0);
      expect(progress.lastStreakCheck).toBeGreaterThan(0);
    });

    it('does not overwrite existing values', () => {
      manager.markLessonComplete(100);
      manager.updateStreak(5);

      manager.setDefaultsIfBlank();
      const progress = manager.getProgress();

      expect(progress.lessonCompletions['100']).toBeDefined();
      expect(progress.currentStreak).toBe(5);
    });
  });

  describe('getAllTrumpStrategies', () => {
    it('returns correct strategies for each field', () => {
      const strategies = manager.getAllTrumpStrategies();

      expect(strategies.lessonCompletions).toBe('MAX');
      expect(strategies.domainsCompleted).toBe('UNION');
      expect(strategies.currentStreak).toBe('LATEST_TIMESTAMP');
      expect(strategies.lastStreakCheck).toBe('MAX');
    });
  });
});

describe('OverallProgressMessageQueueManager', () => {
  let mockRegistry: any;
  let queueManager: OverallProgressMessageQueueManager;

  beforeEach(() => {
    mockRegistry = {
      hasLesson: vi.fn((id: number) => id === 100),
    };

    queueManager = new OverallProgressMessageQueueManager(mockRegistry);
  });

  describe('queueLessonComplete', () => {
    it('queues valid lesson complete message', () => {
      queueManager.queueLessonComplete(100);
      const messages = queueManager.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].method).toBe('markLessonComplete');
      expect(messages[0].args).toEqual([100]);
    });

    it('throws error for invalid lesson ID', () => {
      expect(() => queueManager.queueLessonComplete(999)).toThrow(
        'Invalid lesson ID: 999 does not exist in curriculum'
      );
    });
  });

  describe('queueLessonIncomplete', () => {
    it('queues valid lesson incomplete message', () => {
      queueManager.queueLessonIncomplete(100);
      const messages = queueManager.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].method).toBe('markLessonIncomplete');
      expect(messages[0].args).toEqual([100]);
    });

    it('throws error for invalid lesson ID', () => {
      expect(() => queueManager.queueLessonIncomplete(999)).toThrow(
        'Invalid lesson ID: 999 does not exist in curriculum'
      );
    });
  });

  describe('streak queue methods', () => {
    it('queues updateStreak message', () => {
      queueManager.queueUpdateStreak(7);
      const messages = queueManager.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].method).toBe('updateStreak');
      expect(messages[0].args).toEqual([7]);
    });

    it('throws error for negative streak value', () => {
      expect(() => queueManager.queueUpdateStreak(-1)).toThrow(
        'newStreak must be a non-negative number'
      );
    });

    it('queues resetStreak message', () => {
      queueManager.queueResetStreak();
      const messages = queueManager.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].method).toBe('resetStreak');
      expect(messages[0].args).toEqual([]);
    });

    it('queues incrementStreak message', () => {
      queueManager.queueIncrementStreak();
      const messages = queueManager.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].method).toBe('incrementStreak');
      expect(messages[0].args).toEqual([]);
    });
  });

  describe('getMessages', () => {
    it('returns and clears queue', () => {
      queueManager.queueLessonComplete(100);
      queueManager.queueResetStreak();

      const messages = queueManager.getMessages();
      expect(messages).toHaveLength(2);

      const emptyMessages = queueManager.getMessages();
      expect(emptyMessages).toHaveLength(0);
    });
  });
});