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
      hasDomain: vi.fn((id: number) => id === 1 || id === 2),
    };

    const initialProgress = {
      lessonCompletions: {},
      domainCompletions: {},
      currentStreak: 0,
      lastStreakCheck: Math.floor(Date.now() / 1000),
      totalLessonsCompleted: 0,
      totalDomainsCompleted: 0,
    };

    manager = new OverallProgressManager(initialProgress, mockRegistry);
  });

  describe('CompletionData structure', () => {
    it('stores timeCompleted and lastUpdated on first lesson completion', () => {
      const before = Math.floor(Date.now() / 1000);
      manager.markLessonComplete(100);
      const completion = manager.getProgress().lessonCompletions['100'];

      expect(completion.timeCompleted).toBeGreaterThanOrEqual(before);
      expect(completion.lastUpdated).toBe(completion.timeCompleted);
    });

    it('preserves timeCompleted but updates lastUpdated on lesson re-completion', () => {
      vi.useFakeTimers();
      
      manager.markLessonComplete(100);
      const firstCompletion = manager.getProgress().lessonCompletions['100'];
      
      vi.advanceTimersByTime(2000); // Advance 2 seconds (2000ms)
      
      manager.markLessonComplete(100);
      const secondCompletion = manager.getProgress().lessonCompletions['100'];
      
      expect(secondCompletion.timeCompleted).toBe(firstCompletion.timeCompleted);
      expect(secondCompletion.lastUpdated).toBeGreaterThan(firstCompletion.lastUpdated);
      
      vi.useRealTimers();
    });

    it('sets timeCompleted to null but updates lastUpdated on lesson incompletion', () => {
      manager.markLessonComplete(100);
      const firstTimestamp = manager.getProgress().lessonCompletions['100'].timeCompleted;
      
      vi.useFakeTimers();
      vi.advanceTimersByTime(2000);
      
      manager.markLessonIncomplete(100);
      const completion = manager.getProgress().lessonCompletions['100'];
      
      expect(completion.timeCompleted).toBeNull();
      expect(completion.lastUpdated).toBeGreaterThan(firstTimestamp!);
      
      vi.useRealTimers();
    });

    it('stores timeCompleted and lastUpdated on first domain completion', () => {
      const before = Math.floor(Date.now() / 1000);
      manager.markDomainComplete(1);
      const completion = manager.getProgress().domainCompletions['1'];

      expect(completion.timeCompleted).toBeGreaterThanOrEqual(before);
      expect(completion.lastUpdated).toBe(completion.timeCompleted);
    });

    it('sets timeCompleted to null but updates lastUpdated on domain incompletion', () => {
      manager.markDomainComplete(1);
      const firstTimestamp = manager.getProgress().domainCompletions['1'].timeCompleted;
      
      vi.useFakeTimers();
      vi.advanceTimersByTime(2000);
      
      manager.markDomainIncomplete(1);
      const completion = manager.getProgress().domainCompletions['1'];
      
      expect(completion.timeCompleted).toBeNull();
      expect(completion.lastUpdated).toBeGreaterThan(firstTimestamp!);
      
      vi.useRealTimers();
    });
  });

  describe('markLessonComplete', () => {
    it('marks lesson as complete with CompletionData', () => {
      const before = Math.floor(Date.now() / 1000);
      manager.markLessonComplete(100);
      const completion = manager.getProgress().lessonCompletions['100'];

      expect(completion).toBeDefined();
      expect(completion.timeCompleted).toBeGreaterThanOrEqual(before);
      expect(completion.lastUpdated).toBeGreaterThanOrEqual(before);
    });

    it('throws error for invalid lesson ID', () => {
      expect(() => manager.markLessonComplete(999)).toThrow(
        'Invalid lesson ID: 999'
      );
    });

    it('increments counter on first completion', () => {
      expect(manager.getProgress().totalLessonsCompleted).toBe(0);
      
      manager.markLessonComplete(100);
      expect(manager.getProgress().totalLessonsCompleted).toBe(1);
      
      manager.markLessonComplete(200);
      expect(manager.getProgress().totalLessonsCompleted).toBe(2);
    });

    it('does not increment counter on re-completion', () => {
      manager.markLessonComplete(100);
      expect(manager.getProgress().totalLessonsCompleted).toBe(1);
      
      manager.markLessonComplete(100); // Re-complete same lesson
      expect(manager.getProgress().totalLessonsCompleted).toBe(1); // Still 1
    });
  });

  describe('markLessonIncomplete', () => {
    it('sets timeCompleted to null and updates lastUpdated', () => {
      manager.markLessonComplete(100);
      expect(manager.getProgress().lessonCompletions['100']).toBeDefined();

      manager.markLessonIncomplete(100);
      const completion = manager.getProgress().lessonCompletions['100'];
      
      expect(completion.timeCompleted).toBeNull();
      expect(completion.lastUpdated).toBeGreaterThan(0);
    });

    it('throws error for invalid lesson ID', () => {
      expect(() => manager.markLessonIncomplete(999)).toThrow(
        'Invalid lesson ID: 999'
      );
    });

    it('does not error if lesson was not completed', () => {
      expect(() => manager.markLessonIncomplete(100)).not.toThrow();
    });

    it('decrements counter when marking incomplete from completed state', () => {
      manager.markLessonComplete(100);
      manager.markLessonComplete(200);
      expect(manager.getProgress().totalLessonsCompleted).toBe(2);
      
      manager.markLessonIncomplete(100);
      expect(manager.getProgress().totalLessonsCompleted).toBe(1);
    });

    it('does not decrement counter if lesson was already incomplete', () => {
      manager.markLessonComplete(100);
      expect(manager.getProgress().totalLessonsCompleted).toBe(1);
      
      // Mark 100 incomplete
      manager.markLessonIncomplete(100);
      expect(manager.getProgress().totalLessonsCompleted).toBe(0);
      
      // Try to mark it incomplete again
      manager.markLessonIncomplete(100);
      expect(manager.getProgress().totalLessonsCompleted).toBe(0); // Still 0, no underflow
    });

    it('allows re-completion after incompletion', () => {
      manager.markLessonComplete(100);
      const firstTimestamp = manager.getProgress().lessonCompletions['100'].timeCompleted;
      
      manager.markLessonIncomplete(100);
      expect(manager.getProgress().lessonCompletions['100'].timeCompleted).toBeNull();
      
      vi.useFakeTimers();
      vi.advanceTimersByTime(3000);
      
      manager.markLessonComplete(100);
      const completion = manager.getProgress().lessonCompletions['100'];
      
      expect(completion.timeCompleted).toBeGreaterThan(firstTimestamp!);
      expect(completion.lastUpdated).toBe(completion.timeCompleted);
      expect(manager.getProgress().totalLessonsCompleted).toBe(1);
      
      vi.useRealTimers();
    });
  });

  describe('markDomainComplete', () => {
    it('marks domain as complete with CompletionData', () => {
      const before = Math.floor(Date.now() / 1000);
      manager.markDomainComplete(1);
      const completion = manager.getProgress().domainCompletions['1'];

      expect(completion).toBeDefined();
      expect(completion.timeCompleted).toBeGreaterThanOrEqual(before);
      expect(completion.lastUpdated).toBeGreaterThanOrEqual(before);
    });

    it('throws error for invalid domain ID', () => {
      expect(() => manager.markDomainComplete(999)).toThrow(
        'Invalid domain ID: 999'
      );
    });

    it('increments counter on first completion', () => {
      expect(manager.getProgress().totalDomainsCompleted).toBe(0);
      
      manager.markDomainComplete(1);
      expect(manager.getProgress().totalDomainsCompleted).toBe(1);
      
      manager.markDomainComplete(2);
      expect(manager.getProgress().totalDomainsCompleted).toBe(2);
    });

    it('does not increment counter on re-completion', () => {
      manager.markDomainComplete(1);
      expect(manager.getProgress().totalDomainsCompleted).toBe(1);
      
      manager.markDomainComplete(1); // Re-complete same domain
      expect(manager.getProgress().totalDomainsCompleted).toBe(1); // Still 1
    });
  });

  describe('markDomainIncomplete', () => {
    it('sets timeCompleted to null and updates lastUpdated', () => {
      manager.markDomainComplete(1);
      expect(manager.getProgress().domainCompletions['1']).toBeDefined();

      manager.markDomainIncomplete(1);
      const completion = manager.getProgress().domainCompletions['1'];
      
      expect(completion.timeCompleted).toBeNull();
      expect(completion.lastUpdated).toBeGreaterThan(0);
    });

    it('throws error for invalid domain ID', () => {
      expect(() => manager.markDomainIncomplete(999)).toThrow(
        'Invalid domain ID: 999'
      );
    });

    it('does not error if domain was not completed', () => {
      expect(() => manager.markDomainIncomplete(1)).not.toThrow();
    });

    it('decrements counter when marking incomplete from completed state', () => {
      manager.markDomainComplete(1);
      manager.markDomainComplete(2);
      expect(manager.getProgress().totalDomainsCompleted).toBe(2);
      
      manager.markDomainIncomplete(1);
      expect(manager.getProgress().totalDomainsCompleted).toBe(1);
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

  describe('getAllTrumpStrategies', () => {
    it('returns correct strategies (counters excluded as derived values)', () => {
      const strategies = manager.getAllTrumpStrategies();

      expect(strategies.lessonCompletions).toBe('LATEST_TIMESTAMP');
      expect(strategies.domainCompletions).toBe('LATEST_TIMESTAMP');
      expect(strategies.currentStreak).toBe('LATEST_TIMESTAMP');
      expect(strategies.lastStreakCheck).toBe('MAX');
      
      // Counters should NOT be in strategies - they're derived values
      expect(strategies.totalLessonsCompleted).toBeUndefined();
      expect(strategies.totalDomainsCompleted).toBeUndefined();
    });
  });

  describe('counter integrity', () => {
    it('maintains counter === count of non-null timeCompleted invariant for lessons', () => {
      const progress = manager.getProgress();
      
      // Initial state
      const countCompleted = () => 
        Object.values(progress.lessonCompletions)
          .filter(c => c.timeCompleted !== null).length;
      
      expect(progress.totalLessonsCompleted).toBe(countCompleted());
      
      // After completing lessons
      manager.markLessonComplete(100);
      manager.markLessonComplete(200);
      expect(progress.totalLessonsCompleted).toBe(countCompleted());
      expect(progress.totalLessonsCompleted).toBe(2);
      
      // After marking one incomplete (timeCompleted becomes null)
      manager.markLessonIncomplete(100);
      expect(progress.totalLessonsCompleted).toBe(countCompleted());
      expect(progress.totalLessonsCompleted).toBe(1);
      
      // After marking all incomplete
      manager.markLessonIncomplete(200);
      expect(progress.totalLessonsCompleted).toBe(countCompleted());
      expect(progress.totalLessonsCompleted).toBe(0);
    });

    it('maintains counter === count of non-null timeCompleted invariant for domains', () => {
      const progress = manager.getProgress();
      
      const countCompleted = () => 
        Object.values(progress.domainCompletions)
          .filter(c => c.timeCompleted !== null).length;
      
      expect(progress.totalDomainsCompleted).toBe(countCompleted());
      
      manager.markDomainComplete(1);
      manager.markDomainComplete(2);
      expect(progress.totalDomainsCompleted).toBe(countCompleted());
      expect(progress.totalDomainsCompleted).toBe(2);
      
      manager.markDomainIncomplete(1);
      expect(progress.totalDomainsCompleted).toBe(countCompleted());
      expect(progress.totalDomainsCompleted).toBe(1);
    });
  });
});

describe('OverallProgressMessageQueueManager', () => {
  let mockRegistry: any;
  let queueManager: OverallProgressMessageQueueManager;

  beforeEach(() => {
    mockRegistry = {
      hasLesson: vi.fn((id: number) => id === 100),
      hasDomain: vi.fn((id: number) => id === 1),
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

  describe('queueDomainComplete', () => {
    it('queues valid domain complete message', () => {
      queueManager.queueDomainComplete(1);
      const messages = queueManager.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].method).toBe('markDomainComplete');
      expect(messages[0].args).toEqual([1]);
    });

    it('throws error for invalid domain ID', () => {
      expect(() => queueManager.queueDomainComplete(999)).toThrow(
        'Invalid domain ID: 999 does not exist in curriculum'
      );
    });
  });

  describe('queueDomainIncomplete', () => {
    it('queues valid domain incomplete message', () => {
      queueManager.queueDomainIncomplete(1);
      const messages = queueManager.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].method).toBe('markDomainIncomplete');
      expect(messages[0].args).toEqual([1]);
    });

    it('throws error for invalid domain ID', () => {
      expect(() => queueManager.queueDomainIncomplete(999)).toThrow(
        'Invalid domain ID: 999 does not exist in curriculum'
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