/*
 * Auto-generated initialization.js
 * Generated on: 2025-09-21T08:42:46.542009
 * 
 * Loads YAML lessons with error tracking
 */

console.log('🚀 Initializing Mera learning platform...');

// Global registries
window.lessonRegistry = {};
window.yamlLoadingErrors = [];

// Track loading completion
window.initializationStatus = {
    yamlsLoaded: 0,
    yamlsTotal: 0,
    yamlsComplete: false
};

// Load lessons with error tracking
async function loadLessons() {
    const lessons = [];
    console.log(`📚 Loading ${lessons.length} lesson files...`);
    
    const promises = lessons.map(async (lesson) => {
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
            
            console.log(`✅ Loaded lesson: ${lesson.id}`);
            
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

// Utility function for TypeScript to check initialization status
window.getInitializationStatus = function() {
    return {
        yamlsLoaded: window.initializationStatus.yamlsLoaded,
        yamlsTotal: window.initializationStatus.yamlsTotal,
        yamlsComplete: window.initializationStatus.yamlsComplete,
        yamlErrors: window.yamlLoadingErrors
    };
};

// Start loading immediately
console.log('📥 Starting YAML lesson loading...');
loadLessons();

console.log('⏱️ YAML loading started - ready for TypeScript');