// src/ts/core/settingsSchema.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SettingsDataManager,
  SettingsMessageQueueManager,
  type SettingsData,
} from './settingsSchema.js';

describe('SettingsDataManager', () => {
  let manager: SettingsDataManager;

  beforeEach(() => {
    const initialSettings: SettingsData = {
      weekStartDay: ['sunday', 0],
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
    };

    manager = new SettingsDataManager(initialSettings);
  });

  describe('tuple structure', () => {
    it('stores value and timestamp for each setting', () => {
      const settings = manager.getSettings();
      
      // Each field should be a tuple [value, timestamp]
      expect(Array.isArray(settings.theme)).toBe(true);
      expect(settings.theme).toHaveLength(2);
      expect(typeof settings.theme[0]).toBe('string');
      expect(typeof settings.theme[1]).toBe('number');
    });

    it('updates timestamp when value changes', () => {
      const before = Math.floor(Date.now() / 1000);
      
      manager.setTheme('dark');
      const settings = manager.getSettings();
      
      expect(settings.theme[0]).toBe('dark');
      expect(settings.theme[1]).toBeGreaterThanOrEqual(before);
      expect(settings.theme[1]).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
    });

    it('updates timestamp on re-setting same value', () => {
      manager.setTheme('dark');
      const firstTimestamp = manager.getSettings().theme[1];
      
      vi.useFakeTimers();
      vi.advanceTimersByTime(2000);
      
      manager.setTheme('dark'); // Same value
      const secondTimestamp = manager.getSettings().theme[1];
      
      expect(secondTimestamp).toBeGreaterThan(firstTimestamp);
      
      vi.useRealTimers();
    });

    it('only updates timestamp for changed field', () => {
      manager.setTheme('dark');
      const themeTimestamp = manager.getSettings().theme[1];
      const fontSizeTimestamp = manager.getSettings().fontSize[1];
      
      vi.useFakeTimers();
      vi.advanceTimersByTime(2000);
      
      manager.setFontSize('large');
      
      // fontSize timestamp should update
      expect(manager.getSettings().fontSize[1]).toBeGreaterThan(fontSizeTimestamp);
      
      // theme timestamp should NOT update
      expect(manager.getSettings().theme[1]).toBe(themeTimestamp);
      
      vi.useRealTimers();
    });
  });

  describe('getSettings', () => {
    it('returns current settings with timestamps', () => {
      const settings = manager.getSettings();

      expect(settings.weekStartDay[0]).toBe('sunday');
      expect(settings.theme[0]).toBe('auto');
      expect(settings.learningPace[0]).toBe('standard');
      
      // All timestamps should be present
      expect(typeof settings.weekStartDay[1]).toBe('number');
      expect(typeof settings.theme[1]).toBe('number');
      expect(typeof settings.learningPace[1]).toBe('number');
    });
  });

  describe('getter methods return values only', () => {
    it('getWeekStartDay returns value without timestamp', () => {
      const value = manager.getWeekStartDay();
      expect(value).toBe('sunday');
      expect(typeof value).toBe('string');
    });

    it('getTheme returns value without timestamp', () => {
      manager.setTheme('dark');
      const value = manager.getTheme();
      expect(value).toBe('dark');
      expect(typeof value).toBe('string');
    });

    it('getOptOutDailyPing returns boolean value only', () => {
      const value = manager.getOptOutDailyPing();
      expect(value).toBe(false);
      expect(typeof value).toBe('boolean');
    });
  });

  describe('setWeekStartDay', () => {
    it('updates week start day with timestamp', () => {
      const before = Math.floor(Date.now() / 1000);
      manager.setWeekStartDay('monday');
      
      expect(manager.getWeekStartDay()).toBe('monday');
      expect(manager.getSettings().weekStartDay[0]).toBe('monday');
      expect(manager.getSettings().weekStartDay[1]).toBeGreaterThanOrEqual(before);
    });

    it('accepts all valid days', () => {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
      days.forEach((day) => {
        expect(() => manager.setWeekStartDay(day)).not.toThrow();
        expect(manager.getWeekStartDay()).toBe(day);
      });
    });

    it('throws error for invalid day', () => {
      expect(() => manager.setWeekStartDay('notaday' as any)).toThrow();
    });
  });

  describe('setWeekStartTimeUTC', () => {
    it('updates week start time with timestamp', () => {
      const before = Math.floor(Date.now() / 1000);
      manager.setWeekStartTimeUTC('14:30');
      
      expect(manager.getWeekStartTimeUTC()).toBe('14:30');
      expect(manager.getSettings().weekStartTimeUTC[1]).toBeGreaterThanOrEqual(before);
    });

    it('accepts valid time formats', () => {
      const validTimes = ['00:00', '12:00', '23:59', '06:30'];
      validTimes.forEach((time) => {
        expect(() => manager.setWeekStartTimeUTC(time)).not.toThrow();
        expect(manager.getWeekStartTimeUTC()).toBe(time);
      });
    });

    it('throws error for invalid time format', () => {
      expect(() => manager.setWeekStartTimeUTC('25:00')).toThrow();
      expect(() => manager.setWeekStartTimeUTC('12:60')).toThrow();
      expect(() => manager.setWeekStartTimeUTC('not-a-time')).toThrow();
    });
  });

  describe('setTheme', () => {
    it('updates theme with timestamp', () => {
      const before = Math.floor(Date.now() / 1000);
      manager.setTheme('dark');
      
      expect(manager.getTheme()).toBe('dark');
      expect(manager.getSettings().theme[1]).toBeGreaterThanOrEqual(before);
    });

    it('accepts all valid themes', () => {
      const themes = ['light', 'dark', 'auto'] as const;
      themes.forEach((theme) => {
        expect(() => manager.setTheme(theme)).not.toThrow();
        expect(manager.getTheme()).toBe(theme);
      });
    });
  });

  describe('setLearningPace', () => {
    it('updates learning pace with timestamp', () => {
      const before = Math.floor(Date.now() / 1000);
      manager.setLearningPace('accelerated');
      
      expect(manager.getLearningPace()).toBe('accelerated');
      expect(manager.getSettings().learningPace[1]).toBeGreaterThanOrEqual(before);
    });

    it('accepts all valid paces', () => {
      const paces = ['accelerated', 'standard', 'flexible'] as const;
      paces.forEach((pace) => {
        expect(() => manager.setLearningPace(pace)).not.toThrow();
        expect(manager.getLearningPace()).toBe(pace);
      });
    });
  });

  describe('opt-out settings', () => {
    it('sets opt out daily ping with timestamp', () => {
      const before = Math.floor(Date.now() / 1000);
      manager.setOptOutDailyPing(true);
      
      expect(manager.getOptOutDailyPing()).toBe(true);
      expect(manager.getSettings().optOutDailyPing[1]).toBeGreaterThanOrEqual(before);

      manager.setOptOutDailyPing(false);
      expect(manager.getOptOutDailyPing()).toBe(false);
    });

    it('sets opt out error ping with timestamp', () => {
      const before = Math.floor(Date.now() / 1000);
      manager.setOptOutErrorPing(true);
      
      expect(manager.getOptOutErrorPing()).toBe(true);
      expect(manager.getSettings().optOutErrorPing[1]).toBeGreaterThanOrEqual(before);

      manager.setOptOutErrorPing(false);
      expect(manager.getOptOutErrorPing()).toBe(false);
    });
  });

  describe('accessibility settings', () => {
    it('sets font size with timestamp', () => {
      const before = Math.floor(Date.now() / 1000);
      manager.setFontSize('large');
      
      expect(manager.getFontSize()).toBe('large');
      expect(manager.getSettings().fontSize[1]).toBeGreaterThanOrEqual(before);
    });

    it('sets high contrast with timestamp', () => {
      const before = Math.floor(Date.now() / 1000);
      manager.setHighContrast(true);
      
      expect(manager.getHighContrast()).toBe(true);
      expect(manager.getSettings().highContrast[1]).toBeGreaterThanOrEqual(before);
    });

    it('sets reduced motion with timestamp', () => {
      const before = Math.floor(Date.now() / 1000);
      manager.setReducedMotion(true);
      
      expect(manager.getReducedMotion()).toBe(true);
      expect(manager.getSettings().reducedMotion[1]).toBeGreaterThanOrEqual(before);
    });

    it('sets focus indicator style with timestamp', () => {
      const before = Math.floor(Date.now() / 1000);
      manager.setFocusIndicatorStyle('enhanced');
      
      expect(manager.getFocusIndicatorStyle()).toBe('enhanced');
      expect(manager.getSettings().focusIndicatorStyle[1]).toBeGreaterThanOrEqual(before);
    });

    it('sets audio enabled with timestamp', () => {
      const before = Math.floor(Date.now() / 1000);
      manager.setAudioEnabled(false);
      
      expect(manager.getAudioEnabled()).toBe(false);
      expect(manager.getSettings().audioEnabled[1]).toBeGreaterThanOrEqual(before);
    });
  });

  describe('getLastWeekStart', () => {
    it('calculates week start based on settings', () => {
      manager.setWeekStartDay('monday');
      manager.setWeekStartTimeUTC('00:00');
      
      const weekStart = manager.getLastWeekStart();
      const weekStartDate = new Date(weekStart * 1000);
      
      // Should be a Monday
      expect(weekStartDate.getUTCDay()).toBe(1);
      
      // Should be at 00:00 UTC
      expect(weekStartDate.getUTCHours()).toBe(0);
      expect(weekStartDate.getUTCMinutes()).toBe(0);
    });

    it('handles custom start times', () => {
      manager.setWeekStartDay('sunday');
      manager.setWeekStartTimeUTC('18:00');
      
      const weekStart = manager.getLastWeekStart();
      const weekStartDate = new Date(weekStart * 1000);
      
      // Should be at 18:00 UTC
      expect(weekStartDate.getUTCHours()).toBe(18);
      expect(weekStartDate.getUTCMinutes()).toBe(0);
    });
  });

  describe('granular conflict resolution scenario', () => {
    it('allows independent timestamps per field for merge', () => {
      // Simulate offline device changes theme
      manager.setTheme('dark');
      const offlineThemeTimestamp = manager.getSettings().theme[1];
      
      vi.useFakeTimers();
      vi.advanceTimersByTime(5000);
      
      // Simulate online device changes fontSize
      manager.setFontSize('large');
      const onlineFontSizeTimestamp = manager.getSettings().fontSize[1];
      
      // Both changes have different timestamps
      expect(onlineFontSizeTimestamp).toBeGreaterThan(offlineThemeTimestamp);
      
      // During merge, each field would be compared independently
      // theme would use offlineThemeTimestamp
      // fontSize would use onlineFontSizeTimestamp
      // Both changes preserved!
      
      vi.useRealTimers();
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
      expect(() => queueManager.queueTheme('invalid' as any)).toThrow();
    });
  });

  describe('queueLearningPace', () => {
    it('queues valid pace message', () => {
      queueManager.queueLearningPace('flexible');
      const messages = queueManager.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].method).toBe('setLearningPace');
      expect(messages[0].args).toEqual(['flexible']);
    });

    it('validates pace before queueing', () => {
      expect(() => queueManager.queueLearningPace('invalid' as any)).toThrow();
    });
  });

  describe('queueOptOutDailyPing', () => {
    it('queues valid opt-out message', () => {
      queueManager.queueOptOutDailyPing(true);
      const messages = queueManager.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].method).toBe('setOptOutDailyPing');
      expect(messages[0].args).toEqual([true]);
    });

    it('validates boolean before queueing', () => {
      expect(() => queueManager.queueOptOutDailyPing('yes' as any)).toThrow();
    });
  });

  describe('queueOptOutErrorPing', () => {
    it('queues valid opt-out message', () => {
      queueManager.queueOptOutErrorPing(false);
      const messages = queueManager.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].method).toBe('setOptOutErrorPing');
      expect(messages[0].args).toEqual([false]);
    });
  });

  describe('queueFontSize', () => {
    it('queues valid font size message', () => {
      queueManager.queueFontSize('small');
      const messages = queueManager.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].method).toBe('setFontSize');
      expect(messages[0].args).toEqual(['small']);
    });

    it('validates size before queueing', () => {
      expect(() => queueManager.queueFontSize('huge' as any)).toThrow();
    });
  });

  describe('queueHighContrast', () => {
    it('queues valid high contrast message', () => {
      queueManager.queueHighContrast(true);
      const messages = queueManager.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].method).toBe('setHighContrast');
      expect(messages[0].args).toEqual([true]);
    });
  });

  describe('queueReducedMotion', () => {
    it('queues valid reduced motion message', () => {
      queueManager.queueReducedMotion(true);
      const messages = queueManager.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].method).toBe('setReducedMotion');
      expect(messages[0].args).toEqual([true]);
    });
  });

  describe('queueFocusIndicatorStyle', () => {
    it('queues valid focus indicator style message', () => {
      queueManager.queueFocusIndicatorStyle('enhanced');
      const messages = queueManager.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].method).toBe('setFocusIndicatorStyle');
      expect(messages[0].args).toEqual(['enhanced']);
    });

    it('validates style before queueing', () => {
      expect(() => queueManager.queueFocusIndicatorStyle('custom' as any)).toThrow();
    });
  });

  describe('queueAudioEnabled', () => {
    it('queues valid audio enabled message', () => {
      queueManager.queueAudioEnabled(false);
      const messages = queueManager.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].method).toBe('setAudioEnabled');
      expect(messages[0].args).toEqual([false]);
    });
  });

  describe('getMessages', () => {
    it('returns and clears queue', () => {
      queueManager.queueTheme('dark');
      queueManager.queueFontSize('large');
      queueManager.queueHighContrast(true);

      const messages = queueManager.getMessages();
      expect(messages).toHaveLength(3);

      const emptyMessages = queueManager.getMessages();
      expect(emptyMessages).toHaveLength(0);
    });
  });
});