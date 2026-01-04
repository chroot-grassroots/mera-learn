// src/ts/core/navigationSchema.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NavigationStateManager,
  NavigationMessageHandler,
  NavigationMessageQueueManager,
  getDefaultNavigationState,
} from './navigationSchema.js';

describe('getDefaultNavigationState', () => {
  it('returns main menu with timestamp 0', () => {
    const defaults = getDefaultNavigationState();
    
    expect(defaults.currentEntityId).toBe(0);
    expect(defaults.currentPage).toBe(0);
    expect(defaults.lastUpdated).toBe(0);
  });

  it('returns new object on each call', () => {
    const defaults1 = getDefaultNavigationState();
    const defaults2 = getDefaultNavigationState();
    
    expect(defaults1).not.toBe(defaults2); // Different objects
    expect(defaults1).toEqual(defaults2); // Same values
  });
});

describe('NavigationStateManager', () => {
  let mockRegistry: any;
  let manager: NavigationStateManager;
  
  beforeEach(() => {
    mockRegistry = {
      hasEntity: vi.fn((id: number) => id === 100 || id === 0),
      getEntityPageCount: vi.fn((id: number) => id === 100 ? 5 : 1),
    };
    
    const initialState = {
      currentEntityId: 0,
      currentPage: 0,
      lastUpdated: Math.floor(Date.now() / 1000),
    };
    
    manager = new NavigationStateManager(initialState, mockRegistry);
  });

  describe('constructor cloning', () => {
    it('clones input data to prevent external mutations', () => {
      const externalState = {
        currentEntityId: 0,
        currentPage: 0,
        lastUpdated: 123456,
      };
      
      const manager = new NavigationStateManager(externalState, mockRegistry);
      
      // Mutate external state
      externalState.currentEntityId = 999;
      externalState.currentPage = 42;
      
      // Manager's state should be unchanged
      const view = manager.getCurrentViewRunning();
      expect(view.entityId).toBe(0);
      expect(view.page).toBe(0);
    });
  });

  describe('getState cloning', () => {
    it('returns clone to prevent external mutations', () => {
      manager.setCurrentView(100, 2);
      
      const state1 = manager.getState();
      const state2 = manager.getState();
      
      // Different objects
      expect(state1).not.toBe(state2);
      // Same values
      expect(state1).toEqual(state2);
    });

    it('external mutation of returned state does not affect manager', () => {
      manager.setCurrentView(100, 2);
      
      const externalState = manager.getState();
      externalState.currentEntityId = 999;
      externalState.currentPage = 99;
      externalState.lastUpdated = 0;
      
      // Manager's internal state unchanged
      const view = manager.getCurrentViewRunning();
      expect(view.entityId).toBe(100);
      expect(view.page).toBe(2);
    });
  });

  describe('setCurrentView', () => {
    it('updates navigation state', () => {
      manager.setCurrentView(100, 2);
      const view = manager.getCurrentViewRunning();
      
      expect(view.entityId).toBe(100);
      expect(view.page).toBe(2);
    });

    it('updates timestamp', () => {
      const before = Math.floor(Date.now() / 1000);
      manager.setCurrentView(100, 0);
      const state = manager.getState();
      
      expect(state.lastUpdated).toBeGreaterThanOrEqual(before);
    });
  });

  describe('getCurrentViewStartup', () => {
    it('returns current view if recent (< 30 min)', () => {
      manager.setCurrentView(100, 3);
      const view = manager.getCurrentViewStartup();
      
      expect(view.entityId).toBe(100);
      expect(view.page).toBe(3);
    });

    it('reverts to main menu if stale (> 30 min)', () => {
      const thirtyOneMinutesAgo = Math.floor(Date.now() / 1000) - (31 * 60);
      manager.setCurrentView(100, 3);
      // Manually set old timestamp
      const state = manager['state'];
      state.lastUpdated = thirtyOneMinutesAgo;
      
      const view = manager.getCurrentViewStartup();
      
      expect(view.entityId).toBe(0);
      expect(view.page).toBe(0);
    });
  });

  describe('setDefaults', () => {
    it('resets to main menu', () => {
      manager.setCurrentView(100, 3);
      manager.setDefaults();
      
      const view = manager.getCurrentViewRunning();
      expect(view.entityId).toBe(0);
      expect(view.page).toBe(0);
    });
  });

  describe('getAllTrumpStrategies', () => {
    it('returns LATEST_TIMESTAMP for all fields', () => {
      const strategies = manager.getAllTrumpStrategies();
      
      expect(strategies.currentEntityId).toBe('LATEST_TIMESTAMP');
      expect(strategies.currentPage).toBe('LATEST_TIMESTAMP');
      expect(strategies.lastUpdated).toBe('LATEST_TIMESTAMP');
    });
  });

  describe('validation', () => {
    it('throws error for invalid entity ID', () => {
      manager.setCurrentView(999, 0);
      
      expect(() => manager.getState()).toThrow('Entity 999 does not exist');
    });

    it('throws error for page exceeding entity page count', () => {
      manager.setCurrentView(100, 10);
      
      expect(() => manager.getState()).toThrow('Page 10 exceeds entity 100 page count');
    });
  });
});

describe('NavigationMessageQueueManager', () => {
  let mockRegistry: any;
  let queueManager: NavigationMessageQueueManager;

  beforeEach(() => {
    mockRegistry = {
      hasEntity: vi.fn((id: number) => id === 100),
      getEntityPageCount: vi.fn(() => 5),
    };
    
    queueManager = new NavigationMessageQueueManager(mockRegistry);
  });

  describe('queueNavigationMessage', () => {
    it('queues valid navigation message', () => {
      queueManager.queueNavigationMessage(100, 2);
      const messages = queueManager.getMessages();
      
      expect(messages).toHaveLength(1);
      expect(messages[0].method).toBe('setCurrentView');
      expect(messages[0].args).toEqual([100, 2]);
    });

    it('throws error for invalid entity ID', () => {
      expect(() => queueManager.queueNavigationMessage(999, 0))
        .toThrow('Invalid entity ID: 999');
    });

    it('throws error for invalid page number', () => {
      expect(() => queueManager.queueNavigationMessage(100, 10))
        .toThrow('Invalid page 10 for entity 100');
    });
  });

  describe('getMessages', () => {
    it('returns and clears queue', () => {
      queueManager.queueNavigationMessage(100, 0);
      queueManager.queueNavigationMessage(100, 1);
      
      const messages = queueManager.getMessages();
      expect(messages).toHaveLength(2);
      
      const emptyMessages = queueManager.getMessages();
      expect(emptyMessages).toHaveLength(0);
    });
  });
});

describe('NavigationMessageHandler', () => {
  let mockRegistry: any;
  let mockStateManager: any;
  let messageHandler: NavigationMessageHandler;

  beforeEach(() => {
    mockRegistry = {
      hasEntity: vi.fn((id: number) => id === 100),
      getEntityPageCount: vi.fn(() => 5),
    };
    
    mockStateManager = {
      setCurrentView: vi.fn(),
    };
    
    messageHandler = new NavigationMessageHandler(mockStateManager, mockRegistry);
  });

  describe('handleMessage', () => {
    it('calls setCurrentView on valid message', () => {
      const message = {
        method: 'setCurrentView' as const,
        args: [100, 2] as [number, number],
      };
      
      messageHandler.handleMessage(message);
      
      expect(mockStateManager.setCurrentView).toHaveBeenCalledWith(100, 2);
    });

    it('throws error for invalid entity', () => {
      const message = {
        method: 'setCurrentView' as const,
        args: [999, 0] as [number, number],
      };
      
      expect(() => messageHandler.handleMessage(message))
        .toThrow('Invalid entity ID: 999');
    });

    it('throws error for invalid page', () => {
      const message = {
        method: 'setCurrentView' as const,
        args: [100, 10] as [number, number],
      };
      
      expect(() => messageHandler.handleMessage(message))
        .toThrow('Invalid page 10 for entity 100');
    });
  });
});