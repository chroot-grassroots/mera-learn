/**
 * yaml-loader.js - Mera Platform YAML Content Loader
 * Loads lesson YAML files using registry-driven discovery
 * 
 * Uses registry from yaml-registry.js (data-only, no TypeScript imports)
 */

import { lessonRegistry } from './yaml-registry.js';

console.log('🚀 YAML Loader initializing...');

// Global registries
window.lessonRegistry = {};
window.yamlLoadingErrors = [];

// Track loading completion
window.initializationStatus = {
    yamlsLoaded: 0,
    yamlsTotal: lessonRegistry.length,
    yamlsComplete: false
};

/**
 * Load all lessons from the registry
 */
async function loadLessons() {
    console.log(`📚 Loading ${lessonRegistry.length} lesson files from registry...`);
    
    const promises = lessonRegistry.map(async (lesson) => {
        try {
            const response = await fetch(lesson.path);
            
            if (!response.ok) {
                window.yamlLoadingErrors.push({
                    lesson_id: lesson.id,
                    error: `HTTP ${response.status}: ${response.statusText}`,
                    phase: 'fetch',
                    path: lesson.path
                });
                console.warn(`⚠️ Failed to fetch ${lesson.id}: HTTP ${response.status}`);
                return;
            }
            
            const yamlText = await response.text();
            window.lessonRegistry[lesson.id] = yamlText;
            window.initializationStatus.yamlsLoaded++;
            
            console.log(`✅ Loaded lesson: ${lesson.id} (${lesson.title || 'Untitled'})`);
            
        } catch (error) {
            window.yamlLoadingErrors.push({
                lesson_id: lesson.id,
                error: error.message,
                phase: 'network',
                path: lesson.path
            });
            console.error(`❌ Network error loading ${lesson.id}:`, error);
        }
    });
    
    // Wait for all lesson loading attempts to complete
    await Promise.allSettled(promises);
    window.initializationStatus.yamlsComplete = true;
    
    console.log(`📚 YAML loading complete: ${window.initializationStatus.yamlsLoaded}/${window.initializationStatus.yamlsTotal} successful`);
    if (window.yamlLoadingErrors.length > 0) {
        console.warn(`⚠️ ${window.yamlLoadingErrors.length} YAML loading errors:`, window.yamlLoadingErrors);
    }
}

/**
 * Utility function for TypeScript to check initialization status
 */
window.getInitializationStatus = function() {
    return {
        yamlsLoaded: window.initializationStatus.yamlsLoaded,
        yamlsTotal: window.initializationStatus.yamlsTotal,
        yamlsComplete: window.initializationStatus.yamlsComplete,
        yamlErrors: window.yamlLoadingErrors
    };
};

/**
 * Get lesson metadata from registry (without loading content)
 */
window.getLessonMetadata = function(lessonId) {
    return lessonRegistry.find(lesson => lesson.id === lessonId);
};

/**
 * Get all lesson metadata from registry
 */
window.getAllLessonMetadata = function() {
    return lessonRegistry;
};

// Start loading immediately
console.log('📥 Starting YAML lesson loading...');
loadLessons();

console.log('⏱️ YAML loading started - ready for TypeScript');