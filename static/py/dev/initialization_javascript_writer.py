#!/usr/bin/env python3
"""
Generate initialization.js file for PyScript-based learning platform
"""

import os
import json
import glob
from datetime import datetime

# Simple configuration
LESSONS_DIR = "static/lessons"
OUTPUT_FILE = "static/js/initialization.js"

def scan_lessons():
    """Find all lesson YAML files"""
    lesson_files = glob.glob(os.path.join(LESSONS_DIR, "*.yaml"))
    lessons = []
    
    for lesson_file in lesson_files:
        lesson_id = os.path.splitext(os.path.basename(lesson_file))[0]
        relative_path = os.path.relpath(lesson_file)
        lessons.append({"id": lesson_id, "path": relative_path})
    
    lessons.sort(key=lambda x: x["id"])
    print(f"Found {len(lessons)} lesson files")
    return lessons

def generate_javascript(lessons):
    """Generate the initialization JavaScript for YAML loading only"""
    
    return f'''/*
 * Auto-generated initialization.js
 * Generated on: {datetime.now().isoformat()}
 * 
 * Loads YAML lessons with error tracking
 * PyScript modules now handled via py-config in HTML
 */

console.log('🚀 Initializing Mera learning platform...');

// Global registries
window.lessonRegistry = {{}};
window.yamlLoadingErrors = [];

// Track loading completion
window.initializationStatus = {{
    yamlsLoaded: 0,
    yamlsTotal: {len(lessons)},
    yamlsComplete: false
}};

// Load lessons with error tracking
async function loadLessons() {{
    const lessons = {json.dumps(lessons, indent=2)};
    console.log(`📚 Loading ${{lessons.length}} lesson files...`);
    
    const promises = lessons.map(async (lesson) => {{
        try {{
            const response = await fetch(lesson.path);
            
            if (!response.ok) {{
                window.yamlLoadingErrors.push({{
                    lesson_id: lesson.id,
                    error: `HTTP ${{response.status}}: ${{response.statusText}}`,
                    phase: 'fetch',
                    path: lesson.path
                }});
                console.warn(`⚠️ Failed to fetch ${{lesson.id}}: HTTP ${{response.status}}`);
                return;
            }}
            
            const yamlText = await response.text();
            window.lessonRegistry[lesson.id] = yamlText;
            window.initializationStatus.yamlsLoaded++;
            
            console.log(`✅ Loaded lesson: ${{lesson.id}}`);
            
        }} catch (error) {{
            window.yamlLoadingErrors.push({{
                lesson_id: lesson.id,
                error: error.message,
                phase: 'network',
                path: lesson.path
            }});
            console.error(`❌ Network error loading ${{lesson.id}}:`, error);
        }}
    }});
    
    // Wait for all lesson loading attempts to complete
    await Promise.allSettled(promises);
    window.initializationStatus.yamlsComplete = true;
    
    console.log(`📚 YAML loading complete: ${{window.initializationStatus.yamlsLoaded}}/${{window.initializationStatus.yamlsTotal}} successful`);
    if (window.yamlLoadingErrors.length > 0) {{
        console.warn(`⚠️ ${{window.yamlLoadingErrors.length}} YAML loading errors:`, window.yamlLoadingErrors);
    }}
}}

// Utility function for PyScript to check initialization status
window.getInitializationStatus = function() {{
    return {{
        yamlsLoaded: window.initializationStatus.yamlsLoaded,
        yamlsTotal: window.initializationStatus.yamlsTotal,
        yamlsComplete: window.initializationStatus.yamlsComplete,
        yamlErrors: window.yamlLoadingErrors
    }};
}};

// Start loading immediately
console.log('📥 Starting YAML lesson loading...');
loadLessons();

console.log('⏱️ YAML loading started - ready for PyScript');'''

def main():
    """Generate the initialization file"""
    print("🚀 Generating initialization.js (YAML-only version)...")
    
    # Scan for lessons only
    lessons = scan_lessons()
    
    # Generate JavaScript
    js_code = generate_javascript(lessons)
    
    # Write output
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        f.write(js_code)
    
    print(f"✅ Generated {OUTPUT_FILE}")
    print(f"📊 Summary: {len(lessons)} lessons")
    print("📝 Note: PyScript modules now handled via py-config")

if __name__ == "__main__":
    main()