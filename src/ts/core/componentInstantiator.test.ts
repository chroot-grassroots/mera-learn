/**
 * @fileoverview Test Suite for Component Instantiator
 * @module components/componentInstantiator_test
 * 
 * Tests the component instantiation logic including:
 * - Page-based component filtering
 * - Registry lookups and validation
 * - Permission-based polling map construction
 * - Primary/secondary manager cloning
 * - Component core creation with error isolation
 * - ComponentCoordinator integration
 * 
 * Note: Mock data uses 'as any as ParsedLessonData' type assertions to bypass
 * strict type checking. Tests focus on runtime behavior, not type compatibility.
 * Full schema validation happens at runtime via Zod schemas.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { instantiateComponents } from '../core/componentInstantiator.js';
import type { NavigationState } from '../core/navigationSchema.js';
import type { ParsedLessonData } from '../core/parsedLessonData.js';
import type { BaseComponentProgressManager } from '../components/cores/baseComponentCore.js';
import type { CurriculumRegistry } from '../registry/mera-registry.js';

// Mock dependencies
vi.mock('../components/componentPermissions.js', () => ({
  hasPermissions: vi.fn(),
  getPermissions: vi.fn(),
}));

vi.mock('../registry/mera-registry.js', () => ({
  componentIdToTypeMap: new Map(),
}));

vi.mock('../components/componentCoreFactory.js', () => ({
  createComponentCore: vi.fn(),
}));

vi.mock('../components/componentManagerFactory.js', () => ({
  createComponentProgressManager: vi.fn(),
}));

vi.mock('../components/componentCoordinator.js', () => ({
  componentCoordinator: {
    beginPageLoad: vi.fn(),
  },
}));

import { hasPermissions, getPermissions } from '../components/componentPermissions.js';
import { componentIdToTypeMap } from '../registry/mera-registry.js';
import { createComponentCore } from '../components/componentCoreFactory.js';
import { createComponentProgressManager } from '../components/componentManagerFactory.js';
import { componentCoordinator } from '../components/componentCoordinator.js';

describe('componentInstantiator', () => {
  // Test fixtures
  let mockNavigationState: NavigationState;
  let mockLessonConfigs: Map<number, ParsedLessonData>;
  let mockComponentManagers: Map<number, BaseComponentProgressManager<any, any>>;
  let mockCurriculumData: CurriculumRegistry;
  let mockSettingsManager: any;
  let mockOverallProgressManager: any;
  let mockNavigationManager: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup navigation state
    mockNavigationState = {
      currentEntityId: 1,
      currentPage: 0,
      lastUpdated: Date.now(),
    };

    // Setup lesson configs with components on different pages
    // Using 'as any as ParsedLessonData' to bypass strict type checking
    // Tests only need minimal fields; full schema validation happens at runtime
    mockLessonConfigs = new Map([
      [1, {
        metadata: { 
          id: 1, 
          title: 'Test Lesson', 
          entityType: 'lesson',
          description: 'Test description',
          estimatedMinutes: 10,
          difficulty: 'beginner',
          version: '1.0.0'
        },
        pages: [
          { 
            id: 1, 
            title: 'Page 1', 
            order: 0, 
            components: [
              { id: 100, page: 0, type: 'basic_task' } as any,
              { id: 101, page: 0, type: 'text' } as any
            ] 
          },
          { 
            id: 2, 
            title: 'Page 2', 
            order: 1, 
            components: [
              { id: 102, page: 1, type: 'quiz' } as any
            ] 
          }
        ],
        components: [
          { id: 100, page: 0, type: 'basic_task' } as any,
          { id: 101, page: 0, type: 'text' } as any,
          { id: 102, page: 1, type: 'quiz' } as any,
        ],
      } as any as ParsedLessonData],
    ]);

    // Setup component managers (primary managers)
    // Mock only the methods actually called during instantiation
    const mockManager = {
      getProgress: vi.fn(() => ({ completed: false })),
    } as any as BaseComponentProgressManager<any, any>;
    
    mockComponentManagers = new Map([
      [100, mockManager],
      [101, mockManager],
      [102, mockManager],
    ]);

    // Setup curriculum data - mock only what's needed
    mockCurriculumData = {
      lessonMetadata: new Map(),
    } as any as CurriculumRegistry;

    // Setup readonly managers
    mockSettingsManager = {};
    mockOverallProgressManager = {};
    mockNavigationManager = {};

    // Setup registry with component types
    (componentIdToTypeMap as Map<number, string>).clear();
    (componentIdToTypeMap as Map<number, string>).set(100, 'basic_task');
    (componentIdToTypeMap as Map<number, string>).set(101, 'text');
    (componentIdToTypeMap as Map<number, string>).set(102, 'quiz');

    // Setup default permission responses
    (hasPermissions as any).mockReturnValue(true);
    (getPermissions as any).mockReturnValue({
      componentProgress: true,
      overallProgress: false,
      navigation: false,
      settings: false,
    });

    // Setup component creation to return mock cores
    (createComponentProgressManager as any).mockReturnValue(mockManager);
    (createComponentCore as any).mockReturnValue({
      config: { id: 100 },
      interface: { destroy: vi.fn() },
      getComponentProgressMessages: vi.fn(() => []),
      getOverallProgressMessages: vi.fn(() => []),
      getNavigationMessages: vi.fn(() => []),
      getSettingsMessages: vi.fn(() => []),
    });
  });

  describe('Happy Path - Basic Functionality', () => {
    it('instantiates only components on current page', () => {
      const result = instantiateComponents(
        mockNavigationState,
        mockLessonConfigs,
        mockComponentManagers,
        mockCurriculumData,
        mockSettingsManager,
        mockOverallProgressManager,
        mockNavigationManager
      );

      // Should only create components 100 and 101 (page 0), not 102 (page 1)
      expect(result.componentCores.size).toBe(2);
      expect(result.componentCores.has(100)).toBe(true);
      expect(result.componentCores.has(101)).toBe(true);
      expect(result.componentCores.has(102)).toBe(false);
    });

    it('creates secondary managers with cloned progress', () => {
      instantiateComponents(
        mockNavigationState,
        mockLessonConfigs,
        mockComponentManagers,
        mockCurriculumData,
        mockSettingsManager,
        mockOverallProgressManager,
        mockNavigationManager
      );

      // Should call getProgress() on primary manager to clone data
      const primaryManager = mockComponentManagers.get(100)!;
      expect(primaryManager.getProgress).toHaveBeenCalled();

      // Should create secondary manager with cloned progress
      expect(createComponentProgressManager).toHaveBeenCalledWith(
        'basic_task',
        expect.any(Object),
        { completed: false }
      );
    });

    it('calls componentCoordinator.beginPageLoad with cores', () => {
      const result = instantiateComponents(
        mockNavigationState,
        mockLessonConfigs,
        mockComponentManagers,
        mockCurriculumData,
        mockSettingsManager,
        mockOverallProgressManager,
        mockNavigationManager
      );

      expect(vi.mocked(componentCoordinator.beginPageLoad)).toHaveBeenCalledWith(
        result.componentCores
      );
    });

    it('instantiates components in order field sequence', () => {
      // Create lesson with components deliberately out of order
      const lesson = mockLessonConfigs.get(1)!;
      (lesson as any).components = [
        { id: 103, page: 0, order: 300, type: 'basic_task' } as any,
        { id: 101, page: 0, order: 100, type: 'text' } as any,
        { id: 102, page: 0, order: 200, type: 'quiz' } as any,
      ];
      (lesson.pages[0] as any).components = [
        { id: 103, page: 0, order: 300, type: 'basic_task' } as any,
        { id: 101, page: 0, order: 100, type: 'text' } as any,
        { id: 102, page: 0, order: 200, type: 'quiz' } as any,
      ];

      // Add to registries
      (componentIdToTypeMap as Map<number, string>).set(103, 'basic_task');
      mockComponentManagers.set(102, {
        getProgress: vi.fn(() => ({ completed: false })),
      } as any as BaseComponentProgressManager<any, any>);
      mockComponentManagers.set(103, {
        getProgress: vi.fn(() => ({ completed: false })),
      } as any as BaseComponentProgressManager<any, any>);

      const result = instantiateComponents(
        mockNavigationState,
        mockLessonConfigs,
        mockComponentManagers,
        mockCurriculumData,
        mockSettingsManager,
        mockOverallProgressManager,
        mockNavigationManager
      );

      // Maps preserve insertion order - verify components were instantiated in sorted order
      const ids = Array.from(result.componentCores.keys());
      expect(ids).toEqual([101, 102, 103]); // Sorted by order field (100, 200, 300)
    });

    it('returns empty maps when page has no components', () => {
      // Navigate to page 2 which has no components
      mockNavigationState.currentPage = 2;

      const result = instantiateComponents(
        mockNavigationState,
        mockLessonConfigs,
        mockComponentManagers,
        mockCurriculumData,
        mockSettingsManager,
        mockOverallProgressManager,
        mockNavigationManager
      );

      expect(result.componentCores.size).toBe(0);
      expect(result.componentProgressPolling.size).toBe(0);
      expect(result.overallProgressPolling.size).toBe(0);
      expect(result.navigationPolling.size).toBe(0);
      expect(result.settingsPolling.size).toBe(0);
    });
  });

  describe('Permission-Based Polling Maps', () => {
    it('includes component in componentProgress polling when permitted', () => {
      (getPermissions as any).mockReturnValue({
        componentProgress: true,
        overallProgress: false,
        navigation: false,
        settings: false,
      });

      const result = instantiateComponents(
        mockNavigationState,
        mockLessonConfigs,
        mockComponentManagers,
        mockCurriculumData,
        mockSettingsManager,
        mockOverallProgressManager,
        mockNavigationManager
      );

      expect(result.componentProgressPolling.size).toBe(2);
      expect(result.componentProgressPolling.has(100)).toBe(true);
      expect(result.componentProgressPolling.has(101)).toBe(true);
    });

    it('includes component in overallProgress polling when permitted', () => {
      (getPermissions as any).mockReturnValue({
        componentProgress: false,
        overallProgress: true,
        navigation: false,
        settings: false,
      });

      const result = instantiateComponents(
        mockNavigationState,
        mockLessonConfigs,
        mockComponentManagers,
        mockCurriculumData,
        mockSettingsManager,
        mockOverallProgressManager,
        mockNavigationManager
      );

      expect(result.overallProgressPolling.size).toBe(2);
      expect(result.overallProgressPolling.has(100)).toBe(true);
      expect(result.overallProgressPolling.has(101)).toBe(true);
    });

    it('includes component in navigation polling when permitted', () => {
      (getPermissions as any).mockReturnValue({
        componentProgress: false,
        overallProgress: false,
        navigation: true,
        settings: false,
      });

      const result = instantiateComponents(
        mockNavigationState,
        mockLessonConfigs,
        mockComponentManagers,
        mockCurriculumData,
        mockSettingsManager,
        mockOverallProgressManager,
        mockNavigationManager
      );

      expect(result.navigationPolling.size).toBe(2);
      expect(result.navigationPolling.has(100)).toBe(true);
      expect(result.navigationPolling.has(101)).toBe(true);
    });

    it('includes component in settings polling when permitted', () => {
      (getPermissions as any).mockReturnValue({
        componentProgress: false,
        overallProgress: false,
        navigation: false,
        settings: true,
      });

      const result = instantiateComponents(
        mockNavigationState,
        mockLessonConfigs,
        mockComponentManagers,
        mockCurriculumData,
        mockSettingsManager,
        mockOverallProgressManager,
        mockNavigationManager
      );

      expect(result.settingsPolling.size).toBe(2);
      expect(result.settingsPolling.has(100)).toBe(true);
      expect(result.settingsPolling.has(101)).toBe(true);
    });

    it('respects different permissions for different components', () => {
      // Component 100: can do componentProgress
      // Component 101: can do navigation
      (getPermissions as any).mockImplementation((type: string) => {
        if (type === 'basic_task') {
          return {
            componentProgress: true,
            overallProgress: false,
            navigation: false,
            settings: false,
          };
        }
        if (type === 'text') {
          return {
            componentProgress: false,
            overallProgress: false,
            navigation: true,
            settings: false,
          };
        }
        return {
          componentProgress: false,
          overallProgress: false,
          navigation: false,
          settings: false,
        };
      });

      const result = instantiateComponents(
        mockNavigationState,
        mockLessonConfigs,
        mockComponentManagers,
        mockCurriculumData,
        mockSettingsManager,
        mockOverallProgressManager,
        mockNavigationManager
      );

      // Component 100 in componentProgress, not navigation
      expect(result.componentProgressPolling.has(100)).toBe(true);
      expect(result.navigationPolling.has(100)).toBe(false);

      // Component 101 in navigation, not componentProgress
      expect(result.componentProgressPolling.has(101)).toBe(false);
      expect(result.navigationPolling.has(101)).toBe(true);
    });

    it('includes component in multiple polling maps when permitted', () => {
      (getPermissions as any).mockReturnValue({
        componentProgress: true,
        overallProgress: true,
        navigation: true,
        settings: true,
      });

      const result = instantiateComponents(
        mockNavigationState,
        mockLessonConfigs,
        mockComponentManagers,
        mockCurriculumData,
        mockSettingsManager,
        mockOverallProgressManager,
        mockNavigationManager
      );

      // Both components should be in all four polling maps
      expect(result.componentProgressPolling.size).toBe(2);
      expect(result.overallProgressPolling.size).toBe(2);
      expect(result.navigationPolling.size).toBe(2);
      expect(result.settingsPolling.size).toBe(2);

      expect(result.componentProgressPolling.has(100)).toBe(true);
      expect(result.overallProgressPolling.has(100)).toBe(true);
      expect(result.navigationPolling.has(100)).toBe(true);
      expect(result.settingsPolling.has(100)).toBe(true);
    });
  });

  describe('Registry Validation - Deployment Bug Detection', () => {
    it('throws error when lesson config not found', () => {
      mockNavigationState.currentEntityId = 999; // Non-existent lesson

      expect(() =>
        instantiateComponents(
          mockNavigationState,
          mockLessonConfigs,
          mockComponentManagers,
          mockCurriculumData,
          mockSettingsManager,
          mockOverallProgressManager,
          mockNavigationManager
        )
      ).toThrow(/Lesson config not found/);
    });

    it('throws error when component type not in registry', () => {
      // Remove component 100 from type map
      (componentIdToTypeMap as Map<number, string>).delete(100);

      expect(() =>
        instantiateComponents(
          mockNavigationState,
          mockLessonConfigs,
          mockComponentManagers,
          mockCurriculumData,
          mockSettingsManager,
          mockOverallProgressManager,
          mockNavigationManager
        )
      ).toThrow(/not found in componentIdToTypeMap/);
    });

    it('throws error when component type has no permissions defined', () => {
      (hasPermissions as any).mockReturnValue(false);

      expect(() =>
        instantiateComponents(
          mockNavigationState,
          mockLessonConfigs,
          mockComponentManagers,
          mockCurriculumData,
          mockSettingsManager,
          mockOverallProgressManager,
          mockNavigationManager
        )
      ).toThrow(/has no defined permissions/);
    });

    it('throws error when primary manager not found', () => {
      // Remove component 100 from managers
      mockComponentManagers.delete(100);

      expect(() =>
        instantiateComponents(
          mockNavigationState,
          mockLessonConfigs,
          mockComponentManagers,
          mockCurriculumData,
          mockSettingsManager,
          mockOverallProgressManager,
          mockNavigationManager
        )
      ).toThrow(/Progress manager not found/);
    });
  });

  describe('Component Creation Failure Handling', () => {
    it('continues creating other components when one fails', () => {
      // Make component 100 fail during creation
      (createComponentCore as any).mockImplementation((type: string) => {
        if (type === 'basic_task') {
          throw new Error('Component creation failed');
        }
        return {
          config: { id: 101 },
          interface: { destroy: vi.fn() },
          getComponentProgressMessages: vi.fn(() => []),
          getOverallProgressMessages: vi.fn(() => []),
          getNavigationMessages: vi.fn(() => []),
          getSettingsMessages: vi.fn(() => []),
        };
      });

      const result = instantiateComponents(
        mockNavigationState,
        mockLessonConfigs,
        mockComponentManagers,
        mockCurriculumData,
        mockSettingsManager,
        mockOverallProgressManager,
        mockNavigationManager
      );

      // Component 101 should still be created
      expect(result.componentCores.size).toBe(1);
      expect(result.componentCores.has(101)).toBe(true);
      expect(result.componentCores.has(100)).toBe(false);
    });

    it('excludes failed component from polling maps', () => {
      // Make component 100 fail
      (createComponentCore as any).mockImplementation((type: string) => {
        if (type === 'basic_task') {
          throw new Error('Component creation failed');
        }
        return {
          config: { id: 101 },
          interface: { destroy: vi.fn() },
          getComponentProgressMessages: vi.fn(() => []),
          getOverallProgressMessages: vi.fn(() => []),
          getNavigationMessages: vi.fn(() => []),
          getSettingsMessages: vi.fn(() => []),
        };
      });

      // Add component 103 which should succeed
      const lesson = mockLessonConfigs.get(1)!;
      (lesson as any).components = [
        { id: 100, page: 0, type: 'basic_task' } as any,
        { id: 101, page: 0, type: 'text' } as any,
        { id: 103, page: 0, type: 'text' } as any,
      ];
      (lesson.pages[0] as any).components = [
        { id: 100, page: 0, type: 'basic_task' } as any,
        { id: 101, page: 0, type: 'text' } as any,
        { id: 103, page: 0, type: 'text' } as any,
      ];

      (componentIdToTypeMap as Map<number, string>).set(103, 'text');
      mockComponentManagers.set(103, {
        getProgress: vi.fn(() => ({ completed: false })),
      } as any as BaseComponentProgressManager<any, any>);

      const result = instantiateComponents(
        mockNavigationState,
        mockLessonConfigs,
        mockComponentManagers,
        mockCurriculumData,
        mockSettingsManager,
        mockOverallProgressManager,
        mockNavigationManager
      );

      // Should have components 101 and 103, but not 100 (which failed)
      expect(result.componentCores.size).toBe(2);
      expect(result.componentCores.has(100)).toBe(false);
      expect(result.componentCores.has(101)).toBe(true);
      expect(result.componentCores.has(103)).toBe(true);
    });

    it('logs errors for failed components', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      (createComponentCore as any).mockImplementation((type: string) => {
        if (type === 'basic_task') {
          throw new Error('Specific component error');
        }
        return {
          config: { id: 101 },
          interface: { destroy: vi.fn() },
          getComponentProgressMessages: vi.fn(() => []),
          getOverallProgressMessages: vi.fn(() => []),
          getNavigationMessages: vi.fn(() => []),
          getSettingsMessages: vi.fn(() => []),
        };
      });

      instantiateComponents(
        mockNavigationState,
        mockLessonConfigs,
        mockComponentManagers,
        mockCurriculumData,
        mockSettingsManager,
        mockOverallProgressManager,
        mockNavigationManager
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Component 100'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    it('handles main menu (entityId 0) if no special handling needed', () => {
      mockNavigationState.currentEntityId = 0;
      mockLessonConfigs.set(0, {
        metadata: { 
          id: 0, 
          title: 'Main Menu', 
          entityType: 'menu',
          description: 'Main navigation menu',
          estimatedMinutes: 1,
          difficulty: 'beginner',
          version: '1.0.0'
        },
        pages: [{ 
          id: 0, 
          title: 'Menu', 
          order: 0, 
          components: [{ id: 10, page: 0, type: 'menu' } as any] 
        }],
        components: [
          { id: 10, page: 0, type: 'menu' } as any,
        ],
      } as any as ParsedLessonData);

      (componentIdToTypeMap as Map<number, string>).set(10, 'menu');
      mockComponentManagers.set(10, {
        getProgress: vi.fn(() => ({})),
      } as any as BaseComponentProgressManager<any, any>);

      const result = instantiateComponents(
        mockNavigationState,
        mockLessonConfigs,
        mockComponentManagers,
        mockCurriculumData,
        mockSettingsManager,
        mockOverallProgressManager,
        mockNavigationManager
      );

      expect(result.componentCores.size).toBe(1);
      expect(result.componentCores.has(10)).toBe(true);
    });

    it('handles lesson with single component', () => {
      const lesson = mockLessonConfigs.get(1)!;
      (lesson as any).components = [
        { id: 100, page: 0, type: 'basic_task' } as any,
      ];
      (lesson.pages[0] as any).components = [
        { id: 100, page: 0, type: 'basic_task' } as any,
      ];

      const result = instantiateComponents(
        mockNavigationState,
        mockLessonConfigs,
        mockComponentManagers,
        mockCurriculumData,
        mockSettingsManager,
        mockOverallProgressManager,
        mockNavigationManager
      );

      expect(result.componentCores.size).toBe(1);
    });

    it('handles lesson with many components on same page', () => {
      // Add many components to page 0
      const lesson = mockLessonConfigs.get(1)!;
      const newComponents = [...lesson.components];
      const newPageComponents = [...lesson.pages[0].components];
      
      for (let i = 200; i < 210; i++) {
        newComponents.push({
          id: i,
          page: 0,
          type: 'basic_task',
        } as any);
        
        newPageComponents.push({
          id: i,
          page: 0,
          type: 'basic_task',
        } as any);

        (componentIdToTypeMap as Map<number, string>).set(i, 'basic_task');
        mockComponentManagers.set(i, {
          getProgress: vi.fn(() => ({ completed: false })),
        } as any as BaseComponentProgressManager<any, any>);
      }
      
      // Recreate lesson with updated arrays
      (lesson as any).components = newComponents;
      (lesson.pages[0] as any).components = newPageComponents;

      const result = instantiateComponents(
        mockNavigationState,
        mockLessonConfigs,
        mockComponentManagers,
        mockCurriculumData,
        mockSettingsManager,
        mockOverallProgressManager,
        mockNavigationManager
      );

      // 2 original + 10 new = 12 total on page 0
      expect(result.componentCores.size).toBe(12);
    });

    it('handles component with no permissions (all false)', () => {
      (getPermissions as any).mockReturnValue({
        componentProgress: false,
        overallProgress: false,
        navigation: false,
        settings: false,
      });

      const result = instantiateComponents(
        mockNavigationState,
        mockLessonConfigs,
        mockComponentManagers,
        mockCurriculumData,
        mockSettingsManager,
        mockOverallProgressManager,
        mockNavigationManager
      );

      // Component should be created but not in any polling map
      expect(result.componentCores.size).toBe(2);
      expect(result.componentProgressPolling.size).toBe(0);
      expect(result.overallProgressPolling.size).toBe(0);
      expect(result.navigationPolling.size).toBe(0);
      expect(result.settingsPolling.size).toBe(0);
    });
  });

  describe('Data Integrity', () => {
    it('stores componentType string in polling maps', () => {
      const result = instantiateComponents(
        mockNavigationState,
        mockLessonConfigs,
        mockComponentManagers,
        mockCurriculumData,
        mockSettingsManager,
        mockOverallProgressManager,
        mockNavigationManager
      );

      expect(result.componentProgressPolling.get(100)).toBe('basic_task');
      expect(result.componentProgressPolling.get(101)).toBe('text');
    });

    it('preserves componentId keys across all maps', () => {
      (getPermissions as any).mockReturnValue({
        componentProgress: true,
        overallProgress: true,
        navigation: true,
        settings: true,
      });

      const result = instantiateComponents(
        mockNavigationState,
        mockLessonConfigs,
        mockComponentManagers,
        mockCurriculumData,
        mockSettingsManager,
        mockOverallProgressManager,
        mockNavigationManager
      );

      // All maps should use same componentId keys
      const coreIds = Array.from(result.componentCores.keys());
      const progressIds = Array.from(result.componentProgressPolling.keys());
      const overallIds = Array.from(result.overallProgressPolling.keys());

      expect(progressIds).toEqual(coreIds);
      expect(overallIds).toEqual(coreIds);
    });

    it('passes readonly managers to component core factory', () => {
      instantiateComponents(
        mockNavigationState,
        mockLessonConfigs,
        mockComponentManagers,
        mockCurriculumData,
        mockSettingsManager,
        mockOverallProgressManager,
        mockNavigationManager
      );

      expect(createComponentCore).toHaveBeenCalledWith(
        'basic_task',
        expect.any(Object), // config
        expect.any(Object), // secondary manager
        mockCurriculumData,
        mockSettingsManager,
        mockOverallProgressManager,
        mockNavigationManager
      );
    });
  });
});