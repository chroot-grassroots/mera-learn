/**
 * yaml-loader.js - Mera Platform YAML Content Loader
 * Loads lesson YAML files using registry-driven discovery
 * 
 * Uses registry from yaml-registry.js (data-only, no TypeScript imports)
 */

import { lessonFiles, allYamlFiles } from './yaml-registry.js';

console.log('🚀 YAML Loader initializing...');

// Global registries
window.lessonRegistry = {};
window.yamlLoadingErrors = [];

// Track loading completion
window.initializationStatus = {
    yamlsLoaded: 0,
    yamlsTotal: allYamlFiles.length,
    yamlsComplete: false
};

/**
 * Load all YAML files from the registry
 */
async function loadYAMLs() {
    console.log(`📚 Loading ${allYamlFiles.length} YAML files from registry...`);
    
    const promises = allYamlFiles.map(async (file) => {
        try {
            const response = await fetch(file.path);
            
            if (!response.ok) {
                window.yamlLoadingErrors.push({
                    filename: file.filename,
                    error: `HTTP ${response.status}: ${response.statusText}`,
                    phase: 'fetch',
                    path: file.path
                });
                console.warn(`⚠️ Failed to fetch ${file.filename}: HTTP ${response.status}`);
                return;
            }
            
            const yamlText = await response.text();
            // Store by filename for now - will be properly indexed by ID during parsing
            window.lessonRegistry[file.filename] = yamlText;
            window.initializationStatus.yamlsLoaded++;
            
            console.log(`✅ Loaded: ${file.filename}`);
            
        } catch (error) {
            window.yamlLoadingErrors.push({
                filename: file.filename,
                error: error.message,
                phase: 'network',
                path: file.path
            });
            console.error(`❌ Network error loading ${file.filename}:`, error);
        }
    });
    
    // Wait for all YAML loading attempts to complete
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
 * Get lesson file metadata from registry (without loading content)
 */
window.getLessonFiles = function() {
    return lessonFiles;
};

/**
 * Get all YAML file metadata from registry
 */
window.getAllYAMLFiles = function() {
    return allYamlFiles;
};

// Start loading immediately
console.log('📥 Starting YAML file loading...');
loadYAMLs();

console.log('⏱️ YAML loading started - ready for TypeScript');