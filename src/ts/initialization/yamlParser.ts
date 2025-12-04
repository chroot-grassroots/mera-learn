/**
 * @fileoverview YAML lesson content parsing and validation with retry logic
 * @module initialization/yamlParser
 * 
 * Waits for yaml-loader.js to complete, then retries any failed files before
 * parsing and validating all YAML lesson files against their Zod schemas.
 * 
 * Design Philosophy:
 * - yaml-loader.js is fire-and-forget (loads quickly, doesn't block)
 * - yamlParser.ts retries failed files individually (thorough, activist-friendly)
 * - Hard failure only if retries exhausted (developer content must be valid)
 * - Zero tolerance on parse/validation errors (schema violations = build bug)
 */

import yaml from 'js-yaml';
import { LessonSchema, type Lesson } from '../core/lessonSchemas.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Maximum time to wait for initial yaml-loader completion (10 seconds)
 */
const MAX_WAIT_MS = 10000;
const INITIAL_BACKOFF_MS = 50;
const MAX_BACKOFF_MS = 3200;

/**
 * Retry configuration for failed file loads
 */
const MAX_FETCH_RETRIES = 3;
const RETRY_BACKOFF_MS = 1000; // Start at 1s for retries
const MAX_RETRY_BACKOFF_MS = 5000; // Cap at 5s

// ============================================================================
// ERROR CLASSES
// ============================================================================

/**
 * Error thrown when YAML loading times out
 */
export class YAMLLoadTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'YAMLLoadTimeoutError';
  }
}

/**
 * Error thrown when YAML file fetch fails after retries
 */
export class YAMLFetchError extends Error {
  public readonly filename: string;
  public readonly path: string;
  public readonly attempts: number;
  
  constructor(filename: string, path: string, attempts: number, lastError: string) {
    super(
      `Failed to fetch YAML file after ${attempts} attempts: ${filename}\n` +
      `Path: ${path}\n` +
      `Last error: ${lastError}`
    );
    this.name = 'YAMLFetchError';
    this.filename = filename;
    this.path = path;
    this.attempts = attempts;
  }
}

/**
 * Error thrown when YAML parsing fails
 */
export class YAMLParseError extends Error {
  public readonly filename: string;
  public readonly yamlError: Error;
  
  constructor(filename: string, yamlError: Error) {
    super(`Failed to parse YAML file: ${filename}`);
    this.name = 'YAMLParseError';
    this.filename = filename;
    this.yamlError = yamlError;
  }
}

/**
 * Error thrown when Zod validation fails
 */
export class YAMLValidationError extends Error {
  public readonly filename: string;
  public readonly lessonId: number | string;
  public readonly zodError: any;
  
  constructor(filename: string, lessonId: number | string, zodError: any) {
    super(`YAML validation failed for ${filename} (lesson ID: ${lessonId})`);
    this.name = 'YAMLValidationError';
    this.filename = filename;
    this.lessonId = lessonId;
    this.zodError = zodError;
  }
}

// ============================================================================
// TYPE DECLARATIONS
// ============================================================================

/**
 * Type declarations for window globals set by yaml-loader.js
 */
declare global {
  interface Window {
    lessonRegistry: Record<string, string>;
    yamlLoadingErrors: Array<{
      filename: string;
      error: string;
      phase: string;
      path: string;
    }>;
    initializationStatus: {
      yamlsLoaded: number;
      yamlsTotal: number;
      yamlsComplete: boolean;
    };
  }
}

// ============================================================================
// PUBLIC API - MAIN ENTRY POINT
// ============================================================================

/**
 * Complete YAML parsing workflow: wait, retry failures, parse, validate.
 * 
 * This is the main entry point called from progressLoading.ts.
 * 
 * Execution flow:
 * 1. Wait for yaml-loader.js to finish initial load attempt
 * 2. Retry any files that failed during initial load
 * 3. Parse all YAML strings to JavaScript objects
 * 4. Validate all objects against Zod schemas
 * 5. Return Map indexed by lesson ID
 * 
 * @returns Map of lesson ID to validated Lesson object
 * @throws {YAMLLoadTimeoutError} If yaml-loader doesn't complete
 * @throws {YAMLFetchError} If retry attempts exhausted
 * @throws {YAMLParseError} If YAML is malformed
 * @throws {YAMLValidationError} If schema validation fails
 */
export async function loadAndParseAllLessons(): Promise<Map<number, Lesson>> {
  console.log('🚀 Starting YAML parsing workflow...');
  
  // Step 1: Wait for yaml-loader.js to finish initial attempt
  await waitForYAMLLoad();
  
  // Step 2: Retry any files that failed
  await retryFailedFiles();
  
  // Step 3: Parse and validate all lessons
  const lessons = parseAllLessons();
  
  console.log('✅ YAML parsing workflow complete');
  return lessons;
}

// ============================================================================
// PRIVATE HELPERS - STEP 1: WAIT FOR YAML-LOADER
// ============================================================================

/**
 * Wait for yaml-loader.js to complete initial loading attempt.
 * 
 * Uses exponential backoff polling. Does NOT fail on yaml-loader errors -
 * we'll retry those files ourselves.
 * 
 * @throws {YAMLLoadTimeoutError} If yaml-loader doesn't mark complete in time
 */
async function waitForYAMLLoad(): Promise<void> {
  console.log('⏳ Waiting for YAML loader to complete initial attempt...');
  
  const startTime = Date.now();
  let backoffMs = INITIAL_BACKOFF_MS;
  let attempt = 0;
  
  while (Date.now() - startTime < MAX_WAIT_MS) {
    attempt++;
    
    if (window.initializationStatus?.yamlsComplete === true) {
      const elapsed = Date.now() - startTime;
      const total = window.initializationStatus.yamlsTotal;
      const loaded = window.initializationStatus.yamlsLoaded;
      const failed = total - loaded;
      
      console.log(
        `✅ YAML loader complete in ${elapsed}ms ` +
        `(${loaded}/${total} succeeded, ${failed} failed)`
      );
      return;
    }
    
    await new Promise(resolve => setTimeout(resolve, backoffMs));
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
  }
  
  const status = window.initializationStatus;
  throw new YAMLLoadTimeoutError(
    `YAML loader timed out after ${MAX_WAIT_MS}ms. ` +
    `Status: ${status?.yamlsLoaded || 0}/${status?.yamlsTotal || 0} files loaded. ` +
    `This indicates a critical failure in yaml-loader.js itself.`
  );
}

// ============================================================================
// PRIVATE HELPERS - STEP 2: RETRY FAILED FILES
// ============================================================================

/**
 * Retry fetching a single failed YAML file with exponential backoff.
 * 
 * @param filename - Filename for logging
 * @param path - URL path to fetch
 * @returns YAML text content
 * @throws {YAMLFetchError} If all retry attempts fail
 */
async function retryFetchYAML(filename: string, path: string): Promise<string> {
  console.log(`🔄 Retrying failed file: ${filename}`);
  
  let lastError = 'Unknown error';
  
  for (let attempt = 1; attempt <= MAX_FETCH_RETRIES; attempt++) {
    try {
      console.log(`  📡 Attempt ${attempt}/${MAX_FETCH_RETRIES} for ${filename}...`);
      
      const response = await fetch(path);
      
      if (!response.ok) {
        lastError = `HTTP ${response.status}: ${response.statusText}`;
        
        if (attempt < MAX_FETCH_RETRIES) {
          const delay = Math.min(
            RETRY_BACKOFF_MS * Math.pow(2, attempt - 1),
            MAX_RETRY_BACKOFF_MS
          );
          console.warn(
            `  ⚠️ HTTP ${response.status} for ${filename}, ` +
            `retrying in ${delay}ms...`
          );
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw new YAMLFetchError(filename, path, attempt, lastError);
      }
      
      const yamlText = await response.text();
      console.log(`  ✅ Successfully fetched ${filename} on attempt ${attempt}`);
      return yamlText;
      
    } catch (error) {
      if (error instanceof YAMLFetchError) {
        throw error; // Already formatted
      }
      
      lastError = error instanceof Error ? error.message : String(error);
      
      if (attempt < MAX_FETCH_RETRIES) {
        const delay = Math.min(
          RETRY_BACKOFF_MS * Math.pow(2, attempt - 1),
          MAX_RETRY_BACKOFF_MS
        );
        console.warn(
          `  ⚠️ Network error for ${filename}: ${lastError}, ` +
          `retrying in ${delay}ms...`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw new YAMLFetchError(filename, path, attempt, lastError);
    }
  }
  
  // Shouldn't reach here, but TypeScript needs it
  throw new YAMLFetchError(filename, path, MAX_FETCH_RETRIES, lastError);
}

/**
 * Retry any files that yaml-loader.js failed to load.
 * 
 * Checks window.yamlLoadingErrors and attempts to fetch each failed file
 * individually with retry logic. Updates window.lessonRegistry on success.
 * 
 * @throws {YAMLFetchError} If any file fails after all retries
 */
async function retryFailedFiles(): Promise<void> {
  const errors = window.yamlLoadingErrors || [];
  
  if (errors.length === 0) {
    console.log('✅ No failed files to retry');
    return;
  }
  
  console.log(`🔄 Retrying ${errors.length} failed file(s)...`);
  
  const retryResults = await Promise.allSettled(
    errors.map(error => retryFetchYAML(error.filename, error.path))
  );
  
  // Process results
  const stillFailed: typeof errors = [];
  let retrySucceeded = 0;
  
  for (let i = 0; i < retryResults.length; i++) {
    const result = retryResults[i];
    const error = errors[i];
    
    if (result.status === 'fulfilled') {
      // Success - store in registry
      window.lessonRegistry[error.filename] = result.value;
      retrySucceeded++;
    } else {
      // Still failed after retries
      stillFailed.push(error);
    }
  }
  
  if (stillFailed.length > 0) {
    console.error(
      `❌ ${stillFailed.length} file(s) failed after retries:`,
      stillFailed.map(e => e.filename)
    );
    
    // Throw the first failure (they're all critical)
    const first = stillFailed[0];
    throw new YAMLFetchError(
      first.filename,
      first.path,
      MAX_FETCH_RETRIES,
      first.error
    );
  }
  
  console.log(`✅ Successfully retried all ${retrySucceeded} failed file(s)`);
}

// ============================================================================
// PRIVATE HELPERS - STEP 3: PARSE AND VALIDATE
// ============================================================================

/**
 * Parse and validate all loaded YAML lesson files.
 * 
 * Reads raw YAML strings from window.lessonRegistry, parses with js-yaml,
 * validates against LessonSchema with Zod, and returns indexed by lesson ID.
 * 
 * CRITICAL: Any parse or validation failure throws immediately.
 * Developer content must be perfect.
 * 
 * @returns Map of lesson ID to validated Lesson object
 * @throws {YAMLParseError} If YAML parsing fails (malformed YAML)
 * @throws {YAMLValidationError} If Zod validation fails (schema mismatch)
 */
function parseAllLessons(): Map<number, Lesson> {
  console.log('📖 Parsing and validating lesson YAML files...');
  
  if (!window.lessonRegistry) {
    throw new Error(
      'window.lessonRegistry is not defined. ' +
      'Critical initialization failure - yaml-loader.js did not execute.'
    );
  }
  
  const lessons = new Map<number, Lesson>();
  const entries = Object.entries(window.lessonRegistry);
  
  if (entries.length === 0) {
    throw new Error(
      'No lesson files found in window.lessonRegistry. ' +
      'This means all YAML files failed to load. Critical failure.'
    );
  }
  
  console.log(`📚 Processing ${entries.length} lesson file(s)...`);
  
  for (const [filename, yamlText] of entries) {
    console.log(`📄 Parsing ${filename}...`);
    
    // Step 1: Parse YAML string to JavaScript object
    let parsed: any;
    try {
      parsed = yaml.load(yamlText);
    } catch (error) {
      console.error(`❌ YAML parse error in ${filename}:`, error);
      throw new YAMLParseError(filename, error as Error);
    }
    
    // Step 2: Extract lesson ID for error reporting
    const lessonId = parsed?.metadata?.id ?? 'UNKNOWN';
    
    // Step 3: Validate against Zod schema
    let lesson: Lesson;
    try {
      lesson = LessonSchema.parse(parsed);
    } catch (error) {
      console.error(`❌ Validation error in ${filename} (lesson ${lessonId}):`, error);
      throw new YAMLValidationError(filename, lessonId, error);
    }
    
    // Step 4: Check for duplicate lesson IDs
    if (lessons.has(lesson.metadata.id)) {
      throw new Error(
        `Duplicate lesson ID ${lesson.metadata.id} found in ${filename}. ` +
        `Each lesson must have a unique ID. Critical content error.`
      );
    }
    
    // Step 5: Store validated lesson
    lessons.set(lesson.metadata.id, lesson);
    console.log(
      `✅ Validated ${filename} ` +
      `(lesson ${lesson.metadata.id}: "${lesson.metadata.title}")`
    );
  }
  
  console.log(`🎉 Successfully parsed and validated ${lessons.size} lesson(s)`);
  return lessons;
}