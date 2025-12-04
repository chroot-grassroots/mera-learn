/**
 * @fileoverview Tests for YAML parsing and validation
 * @module initialization/yamlParser.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  loadAndParseAllLessons,
  YAMLLoadTimeoutError,
  YAMLFetchError,
  YAMLParseError, 
  YAMLValidationError 
} from './yamlParser';

// ============================================================================
// TEST FIXTURES
// ============================================================================

/**
 * Valid lesson YAML that matches LessonSchema
 */
const VALID_LESSON_YAML = `
metadata:
  id: 12345
  entityType: lesson
  title: Test Phishing Lesson
  description: Learn to recognize phishing attacks
  domainId: 1001
  difficulty: beginner
  estimatedMinutes: 15
  version: "1.0.0"
pages:
  - id: 1
    title: Introduction to Phishing
    description: What is phishing?
    order: 0
    components:
      - id: 100
        type: basic_task
        accessibility_label: Phishing identification checklist
        order: 100
        title: Identify Phishing Indicators
        description: Check off each warning sign you should look for
        checkboxes:
          - content: Check sender email address carefully
            required: true
          - content: Look for urgent or threatening language
            required: true
`;

/**
 * Another valid lesson with different ID
 */
const VALID_LESSON_YAML_2 = `
metadata:
  id: 54321
  entityType: lesson
  title: Password Security
  description: Creating strong passwords
  domainId: 1001
  difficulty: beginner
  estimatedMinutes: 10
  version: "1.0.0"
pages:
  - id: 1
    title: Password Basics
    order: 0
    components:
      - id: 200
        type: basic_task
        accessibility_label: Password strength checklist
        order: 100
        title: Create Strong Passwords
        description: Follow these best practices for password security
        checkboxes:
          - content: Use at least 12 characters
            required: true
          - content: Include uppercase and lowercase letters
            required: false
`;

/**
 * Malformed YAML - syntax error
 */
const MALFORMED_YAML = `
metadata:
  id: 12345
  title: This is bad YAML
  - invalid: [syntax here
  missing: closing bracket
`;

/**
 * Valid YAML but missing required fields (schema violation)
 */
const INVALID_SCHEMA_YAML = `
metadata:
  id: 12345
  title: Missing Required Fields
  description: This is missing entityType, difficulty, etc.
pages: []
`;

/**
 * Valid YAML but wrong types (schema violation)
 */
const WRONG_TYPES_YAML = `
metadata:
  id: "not-a-number"
  entityType: lesson
  title: Test Lesson
  description: Test
  difficulty: beginner
  estimatedMinutes: 10
  version: "1.0.0"
pages:
  - id: 1
    title: Page 1
    order: 0
    components: []
`;

/**
 * Valid YAML but pages array is empty (schema violation - min 1 page)
 */
const EMPTY_PAGES_YAML = `
metadata:
  id: 12345
  entityType: lesson
  title: No Pages Lesson
  description: This lesson has no pages
  difficulty: beginner
  estimatedMinutes: 5
  version: "1.0.0"
pages: []
`;

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Setup window globals for successful yaml-loader completion
 */
function setupSuccessfulYAMLLoader(registry: Record<string, string>) {
  window.lessonRegistry = registry;
  window.yamlLoadingErrors = [];
  window.initializationStatus = {
    yamlsLoaded: Object.keys(registry).length,
    yamlsTotal: Object.keys(registry).length,
    yamlsComplete: true
  };
}

/**
 * Setup window globals for yaml-loader with some failures
 */
function setupYAMLLoaderWithFailures(
  successRegistry: Record<string, string>,
  failures: Array<{ filename: string; path: string; error: string }>
) {
  window.lessonRegistry = successRegistry;
  window.yamlLoadingErrors = failures.map(f => ({
    filename: f.filename,
    path: f.path,
    error: f.error,
    phase: 'fetch'
  }));
  window.initializationStatus = {
    yamlsLoaded: Object.keys(successRegistry).length,
    yamlsTotal: Object.keys(successRegistry).length + failures.length,
    yamlsComplete: true
  };
}

/**
 * Setup window globals for yaml-loader not complete
 */
function setupIncompleteYAMLLoader() {
  window.lessonRegistry = {};
  window.yamlLoadingErrors = [];
  window.initializationStatus = {
    yamlsLoaded: 0,
    yamlsTotal: 1,
    yamlsComplete: false
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('yamlParser', () => {
  beforeEach(() => {
    // Reset window globals before each test
    window.lessonRegistry = {};
    window.yamlLoadingErrors = [];
    window.initializationStatus = {
      yamlsLoaded: 0,
      yamlsTotal: 0,
      yamlsComplete: false
    };
    
    // Clear any mocked timers
    vi.clearAllTimers();
  });

  describe('loadAndParseAllLessons - happy path', () => {
    it('parses single valid lesson into Map', async () => {
      setupSuccessfulYAMLLoader({
        'phishing-basics.yaml': VALID_LESSON_YAML
      });

      const result = await loadAndParseAllLessons();

      expect(result.size).toBe(1);
      expect(result.has(12345)).toBe(true);
      
      const lesson = result.get(12345);
      expect(lesson?.metadata.title).toBe('Test Phishing Lesson');
      expect(lesson?.metadata.difficulty).toBe('beginner');
      expect(lesson?.pages.length).toBe(1);
      expect(lesson?.pages[0].components.length).toBe(1);
    });

    it('parses multiple valid lessons into Map', async () => {
      setupSuccessfulYAMLLoader({
        'phishing-basics.yaml': VALID_LESSON_YAML,
        'password-security.yaml': VALID_LESSON_YAML_2
      });

      const result = await loadAndParseAllLessons();

      expect(result.size).toBe(2);
      expect(result.has(12345)).toBe(true);
      expect(result.has(54321)).toBe(true);
      
      expect(result.get(12345)?.metadata.title).toBe('Test Phishing Lesson');
      expect(result.get(54321)?.metadata.title).toBe('Password Security');
    });

    it('indexes lessons by numeric ID', async () => {
      setupSuccessfulYAMLLoader({
        'phishing-basics.yaml': VALID_LESSON_YAML
      });

      const result = await loadAndParseAllLessons();

      // Key should be number, not string
      expect(typeof [...result.keys()][0]).toBe('number');
      expect([...result.keys()][0]).toBe(12345);
    });
  });

  describe('loadAndParseAllLessons - error cases', () => {
    it('throws YAMLLoadTimeoutError if yaml-loader never completes', async () => {
      setupIncompleteYAMLLoader();

      // Use fake timers to avoid actually waiting 10 seconds
      vi.useFakeTimers();

      const promise = loadAndParseAllLessons();

      // Set up the rejection expectation, then advance timers
      const expectation = expect(promise).rejects.toThrow(YAMLLoadTimeoutError);
      
      // Fast-forward past the timeout
      await vi.runAllTimersAsync();

      // Now check the expectation
      await expectation;

      vi.useRealTimers();
    });

    it('throws YAMLParseError on malformed YAML', async () => {
      setupSuccessfulYAMLLoader({
        'bad-syntax.yaml': MALFORMED_YAML
      });

      await expect(loadAndParseAllLessons()).rejects.toThrow(YAMLParseError);
      await expect(loadAndParseAllLessons()).rejects.toThrow(/bad-syntax.yaml/);
    });

    it('throws YAMLValidationError on missing required fields', async () => {
      setupSuccessfulYAMLLoader({
        'invalid-schema.yaml': INVALID_SCHEMA_YAML
      });

      await expect(loadAndParseAllLessons()).rejects.toThrow(YAMLValidationError);
      await expect(loadAndParseAllLessons()).rejects.toThrow(/invalid-schema.yaml/);
    });

    it('throws YAMLValidationError on wrong field types', async () => {
      setupSuccessfulYAMLLoader({
        'wrong-types.yaml': WRONG_TYPES_YAML
      });

      await expect(loadAndParseAllLessons()).rejects.toThrow(YAMLValidationError);
    });

    it('throws YAMLValidationError on empty pages array', async () => {
      setupSuccessfulYAMLLoader({
        'no-pages.yaml': EMPTY_PAGES_YAML
      });

      await expect(loadAndParseAllLessons()).rejects.toThrow(YAMLValidationError);
    });

    it('throws error on duplicate lesson IDs', async () => {
      // Create second lesson with SAME ID but different content
      const duplicateYAML = `
metadata:
  id: 12345
  entityType: lesson
  title: Different Lesson Same ID
  description: This has the same ID as the phishing lesson
  domainId: 1002
  difficulty: intermediate
  estimatedMinutes: 20
  version: "1.0.0"
pages:
  - id: 1
    title: Different Content
    order: 0
    components:
      - id: 999
        type: basic_task
        accessibility_label: Different task
        order: 100
        title: Different Task
        description: Different description
        checkboxes:
          - content: Different checkbox
            required: false
      `;
      
      setupSuccessfulYAMLLoader({
        'lesson1.yaml': VALID_LESSON_YAML,
        'lesson2.yaml': duplicateYAML  // Same ID: 12345!
      });

      await expect(loadAndParseAllLessons()).rejects.toThrow(/duplicate/i);
      await expect(loadAndParseAllLessons()).rejects.toThrow(/12345/);
    });

    it('throws error if window.lessonRegistry is undefined', async () => {
      setupSuccessfulYAMLLoader({});
      
      // Simulate yaml-loader.js never running
      delete (window as any).lessonRegistry;

      await expect(loadAndParseAllLessons()).rejects.toThrow(/not defined/i);
    });

    it('throws error if no lessons loaded', async () => {
      setupSuccessfulYAMLLoader({});  // Empty registry

      await expect(loadAndParseAllLessons()).rejects.toThrow(/no lesson files found/i);
    });
  });

  describe('loadAndParseAllLessons - retry logic', () => {
    it('succeeds after yaml-loader reports failures if fetch succeeds', async () => {
      // yaml-loader failed to load one file
      setupYAMLLoaderWithFailures(
        { 'phishing-basics.yaml': VALID_LESSON_YAML },
        [{ filename: 'password-security.yaml', path: '/static/yaml/lessons/password-security.yaml', error: 'HTTP 503' }]
      );

      // Mock fetch to succeed on retry
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => VALID_LESSON_YAML_2
      });

      const result = await loadAndParseAllLessons();

      // Should have both lessons - one from initial load, one from retry
      expect(result.size).toBe(2);
      expect(result.has(12345)).toBe(true);
      expect(result.has(54321)).toBe(true);
      
      // Verify fetch was called for the failed file
      expect(global.fetch).toHaveBeenCalledWith('/static/yaml/lessons/password-security.yaml');
    });

    it('throws YAMLFetchError if retry exhausts all attempts', async () => {
      setupYAMLLoaderWithFailures(
        {},
        [{ filename: 'missing.yaml', path: '/static/yaml/lessons/missing.yaml', error: 'HTTP 404' }]
      );

      // Use fake timers to avoid waiting for retry delays
      vi.useFakeTimers();

      // Mock fetch to always fail
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      const promise = loadAndParseAllLessons();
      
      // Set up the rejection expectation, then advance timers
      const expectation = expect(promise).rejects.toThrow(YAMLFetchError);
      
      // Fast-forward through all timers
      await vi.runAllTimersAsync();

      // Now check the expectation
      await expectation;
      
      // Should have tried 3 times (MAX_FETCH_RETRIES)
      expect(global.fetch).toHaveBeenCalledTimes(3);
      
      vi.useRealTimers();
    });
  });

  describe('lesson structure validation', () => {
    it('validates lesson has required metadata fields', async () => {
      setupSuccessfulYAMLLoader({
        'test.yaml': VALID_LESSON_YAML
      });

      const result = await loadAndParseAllLessons();
      const lesson = result.get(12345)!;

      // Check all required metadata fields exist
      expect(lesson.metadata.id).toBe(12345);
      expect(lesson.metadata.entityType).toBe('lesson');
      expect(lesson.metadata.title).toBeTruthy();
      expect(lesson.metadata.description).toBeTruthy();
      expect(lesson.metadata.difficulty).toBeTruthy();
      expect(lesson.metadata.estimatedMinutes).toBeGreaterThan(0);
      expect(lesson.metadata.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('validates lesson has at least one page', async () => {
      setupSuccessfulYAMLLoader({
        'test.yaml': VALID_LESSON_YAML
      });

      const result = await loadAndParseAllLessons();
      const lesson = result.get(12345)!;

      expect(lesson.pages.length).toBeGreaterThan(0);
    });

    it('validates page has at least one component', async () => {
      setupSuccessfulYAMLLoader({
        'test.yaml': VALID_LESSON_YAML
      });

      const result = await loadAndParseAllLessons();
      const lesson = result.get(12345)!;

      expect(lesson.pages[0].components.length).toBeGreaterThan(0);
    });

    it('validates component has required fields', async () => {
      setupSuccessfulYAMLLoader({
        'test.yaml': VALID_LESSON_YAML
      });

      const result = await loadAndParseAllLessons();
      const lesson = result.get(12345)!;
      const component = lesson.pages[0].components[0];

      expect(component.id).toBe(100);
      expect(component.type).toBe('basic_task');
      expect(component.accessibility_label).toBeTruthy();
      expect(component.order).toBe(100);
    });
  });

  describe('edge cases', () => {
    it('handles lesson with optional domainId missing', async () => {
      const menuYAML = `
metadata:
  id: 99999
  entityType: menu
  title: Main Menu
  description: Top level menu
  difficulty: beginner
  estimatedMinutes: 1
  version: "1.0.0"
pages:
  - id: 1
    title: Menu Page
    order: 0
    components:
      - id: 999
        type: basic_task
        accessibility_label: Menu navigation
        order: 100
        title: Choose Your Path
        description: Select a learning module to begin
        checkboxes:
          - content: Navigate to next section
            required: false
      `;

      setupSuccessfulYAMLLoader({
        'main-menu.yaml': menuYAML
      });

      const result = await loadAndParseAllLessons();
      
      expect(result.size).toBe(1);
      expect(result.get(99999)?.metadata.entityType).toBe('menu');
      expect(result.get(99999)?.metadata.domainId).toBeUndefined();
    });

    it('handles very large lesson ID (within number range)', async () => {
      const largeIdYAML = VALID_LESSON_YAML.replace('id: 12345', 'id: 999999999999');

      setupSuccessfulYAMLLoader({
        'large-id.yaml': largeIdYAML
      });

      const result = await loadAndParseAllLessons();
      
      expect(result.has(999999999999)).toBe(true);
    });

    it('preserves lesson order from registry', async () => {
      setupSuccessfulYAMLLoader({
        'first.yaml': VALID_LESSON_YAML,
        'second.yaml': VALID_LESSON_YAML_2
      });

      const result = await loadAndParseAllLessons();
      
      // Map maintains insertion order in modern JS
      const ids = [...result.keys()];
      expect(ids).toEqual([12345, 54321]);
    });
  });
});