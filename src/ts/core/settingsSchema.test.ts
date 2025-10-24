// src/ts/core/settingsSchema.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SettingsDataManager,
  SettingsMessageQueueManager,
} from './settingsSchema.js';

describe('SettingsDataManager', () => {
  let manager: SettingsDataManager;

  beforeEach(() => {
    const initialSettings = {
      weekStartDay: 'sunday' as const,
      weekStartTimeUTC: '00:00',
      theme: 'auto' as const,
      learningPace: 'standard' as const,
      optOutDailyPing: false,
      optOutErrorPing: false,
      fontSize: 'medium' as const,
      highContrast: false,
      reducedMotion: false,
      focusIndicatorStyle: 'default' as const,
      audioEnabled: true,
    };

    manager = new SettingsDataManager(initialSettings);
  });

  describe('getSettings', () => {
    it('returns current settings', () => {
      const settings = manager.getSettings();

      expect(settings.weekStartDay).toBe('sunday');
      expect(settings.theme).toBe('auto');
      expect(settings.learningPace).toBe('standard');
    });
  });

  describe('setWeekStartDay', () => {
    it('updates week start day', () => {
      manager.setWeekStartDay('monday');
      expect(manager.getSettings().weekStartDay).toBe('monday');
    });

    it('accepts all valid days', () => {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
      days.forEach((day) => {
        expect(() => manager.setWeekStartDay(day)).not.toThrow();
        expect(manager.getSettings().weekStartDay).toBe(day);
      });
    });

    it('throws error for invalid day', () => {
      expect(() => manager.setWeekStartDay('notaday' as any)).toThrow();
    });
  });

  describe('setWeekStartTimeUTC', () => {
    it('updates week start time', () => {
      manager.setWeekStartTimeUTC('14:30');
      expect(manager.getSettings().weekStartTimeUTC).toBe('14:30');
    });

    it('accepts valid time formats', () => {
      const validTimes = ['00:00', '12:00', '23:59', '06:30'];
      validTimes.forEach((time) => {
        expect(() => manager.setWeekStartTimeUTC(time)).not.toThrow();
        expect(manager.getSettings().weekStartTimeUTC).toBe(time);
      });
    });

    it('throws error for invalid time format', () => {
      expect(() => manager.setWeekStartTimeUTC('25:00')).toThrow();
      expect(() => manager.setWeekStartTimeUTC('12:60')).toThrow();
      expect(() => manager.setWeekStartTimeUTC('not-a-time')).toThrow();
    });
  });

  describe('setTheme', () => {
    it('updates theme', () => {
      manager.setTheme('dark');
      expect(manager.getSettings().theme).toBe('dark');
    });

    it('accepts all valid themes', () => {
      const themes = ['light', 'dark', 'auto'] as const;
      themes.forEach((theme) => {
        expect(() => manager.setTheme(theme)).not.toThrow();
        expect(manager.getSettings().theme).toBe(theme);
      });
    });
  });

  describe('setLearningPace', () => {
    it('updates learning pace', () => {
      manager.setLearningPace('accelerated');
      expect(manager.getSettings().learningPace).toBe('accelerated');
    });

    it('accepts all valid paces', () => {
      const paces = ['accelerated', 'standard', 'flexible'] as const;
      paces.forEach((pace) => {
        expect(() => manager.setLearningPace(pace)).not.toThrow();
        expect(manager.getSettings().learningPace).toBe(pace);
      });
    });
  });

  describe('opt-out settings', () => {
    it('sets opt out daily ping', () => {
      manager.setOptOutDailyPing(true);
      expect(manager.getSettings().optOutDailyPing).toBe(true);

      manager.setOptOutDailyPing(false);
      expect(manager.getSettings().optOutDailyPing).toBe(false);
    });

    it('sets opt out error ping', () => {
      manager.setOptOutErrorPing(true);
      expect(manager.getSettings().optOutErrorPing).toBe(true);

      manager.setOptOutErrorPing(false);
      expect(manager.getSettings().optOutErrorPing).toBe(false);
    });
  });

  describe('setDefaultsIfBlank', () => {
    it('fills in missing fields with defaults', () => {
      // Create settings with some fields missing
      const partialSettings: any = {
        theme: 'dark',
        learningPace: 'accelerated',
      };
      
      const partialManager = new SettingsDataManager(partialSettings);
      partialManager.setDefaultsIfBlank();
      const settings = partialManager.getSettings();

      // Missing fields get defaults
      expect(settings.weekStartDay).toBe('sunday');
      expect(settings.weekStartTimeUTC).toBe('00:00');
      expect(settings.optOutDailyPing).toBe(false);
      
      // Existing fields stay unchanged
      expect(settings.theme).toBe('dark');
      expect(settings.learningPace).toBe('accelerated');
    });
  });

  describe('getAllTrumpStrategies', () => {
    it('returns LATEST_TIMESTAMP for all fields', () => {
      const strategies = manager.getAllTrumpStrategies();

      expect(strategies.weekStartDay).toBe('LATEST_TIMESTAMP');
      expect(strategies.weekStartTimeUTC).toBe('LATEST_TIMESTAMP');
      expect(strategies.theme).toBe('LATEST_TIMESTAMP');
      expect(strategies.learningPace).toBe('LATEST_TIMESTAMP');
      expect(strategies.optOutDailyPing).toBe('LATEST_TIMESTAMP');
      expect(strategies.optOutErrorPing).toBe('LATEST_TIMESTAMP');
      expect(strategies.fontSize).toBe('LATEST_TIMESTAMP');
      expect(strategies.highContrast).toBe('LATEST_TIMESTAMP');
      expect(strategies.reducedMotion).toBe('LATEST_TIMESTAMP');
      expect(strategies.focusIndicatorStyle).toBe('LATEST_TIMESTAMP');
      expect(strategies.audioEnabled).toBe('LATEST_TIMESTAMP');
    });
  });
});

describe('SettingsMessageQueueManager', () => {
  let queueManager: SettingsMessageQueueManager;

  beforeEach(() => {
    queueManager = new SettingsMessageQueueManager();
  });

  describe('queueWeekStartDay', () => {
    it('queues valid week start day message', () => {
      queueManager.queueWeekStartDay('wednesday');
      const messages = queueManager.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].method).toBe('setWeekStartDay');
      expect(messages[0].args).toEqual(['wednesday']);
    });

    it('validates day before queueing', () => {
      expect(() => queueManager.queueWeekStartDay('notaday' as any)).toThrow();
    });
  });

  describe('queueWeekStartTimeUTC', () => {
    it('queues valid time message', () => {
      queueManager.queueWeekStartTimeUTC('15:30');
      const messages = queueManager.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].method).toBe('setWeekStartTimeUTC');
      expect(messages[0].args).toEqual(['15:30']);
    });

    it('validates time before queueing', () => {
      expect(() => queueManager.queueWeekStartTimeUTC('25:00')).toThrow();
      expect(() => queueManager.queueWeekStartTimeUTC('invalid')).toThrow();
    });
  });

  describe('queueTheme', () => {
    it('queues valid theme message', () => {
      queueManager.queueTheme('dark');
      const messages = queueManager.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].method).toBe('setTheme');
      expect(messages[0].args).toEqual(['dark']);
    });

    it('validates theme before queueing', () => {
      const validThemes = ['light', 'dark', 'auto'] as const;
      validThemes.forEach((theme) => {
        expect(() => queueManager.queueTheme(theme)).not.toThrow();
      });
    });
  });

  describe('queueLearningPace', () => {
    it('queues valid learning pace message', () => {
      queueManager.queueLearningPace('flexible');
      const messages = queueManager.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].method).toBe('setLearningPace');
      expect(messages[0].args).toEqual(['flexible']);
    });

    it('validates pace before queueing', () => {
      const paces = ['accelerated', 'standard', 'flexible'] as const;
      paces.forEach((pace) => {
        expect(() => queueManager.queueLearningPace(pace)).not.toThrow();
      });
    });
  });

  describe('opt-out queue methods', () => {
    it('queues opt out daily ping message', () => {
      queueManager.queueOptOutDailyPing(true);
      const messages = queueManager.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].method).toBe('setOptOutDailyPing');
      expect(messages[0].args).toEqual([true]);
    });

    it('queues opt out error ping message', () => {
      queueManager.queueOptOutErrorPing(false);
      const messages = queueManager.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].method).toBe('setOptOutErrorPing');
      expect(messages[0].args).toEqual([false]);
    });
  });

  describe('getMessages', () => {
    it('returns and clears queue', () => {
      queueManager.queueTheme('dark');
      queueManager.queueLearningPace('accelerated');
      queueManager.queueOptOutDailyPing(true);

      const messages = queueManager.getMessages();
      expect(messages).toHaveLength(3);

      const emptyMessages = queueManager.getMessages();
      expect(emptyMessages).toHaveLength(0);
    });
  });
});