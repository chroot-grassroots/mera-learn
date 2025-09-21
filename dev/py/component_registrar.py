#!/usr/bin/env python3
"""
Component Registration Generator for Mera Platform

Scans TypeScript component files and generates registration data
for the validation system to consume.
"""

import os
import re
import json
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Tuple

# Configuration
COMPONENTS_DIR = "src/ts/components"
OUTPUT_DIR = "static/js"
REGISTRY_FILE = "component-registry.js"

# Patterns to find component exports
PATTERNS = {
    'component_class': r'export\s+class\s+(\w+Component)\s+extends\s+BaseComponent',
    'config_schema': r'export\s+const\s+(\w+ComponentConfigSchema)\s*=',
    'progress_schema': r'export\s+const\s+(\w+ComponentProgressSchema)\s*=',
    'component_type': r'type:\s*z\.literal\([\'"]([^\'"]+)[\'"]\)'
}

def scan_component_file(filepath: Path) -> Optional[Dict[str, str]]:
    """
    Scan a TypeScript component file for registration patterns.
    
    Args:
        filepath: Path to the TypeScript file
        
    Returns:
        Dictionary with component registration data or None
    """
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"Warning: Could not read {filepath}: {e}")
        return None
    
    # Extract component information
    component_info = {}
    
    # Find component class
    class_match = re.search(PATTERNS['component_class'], content)
    if class_match:
        component_info['componentClass'] = class_match.group(1)
    
    # Find schemas
    config_match = re.search(PATTERNS['config_schema'], content)
    if config_match:
        component_info['configSchema'] = config_match.group(1)
        
    progress_match = re.search(PATTERNS['progress_schema'], content)  
    if progress_match:
        component_info['progressSchema'] = progress_match.group(1)
    
    # Find component type from schema definition
    type_match = re.search(PATTERNS['component_type'], content)
    if type_match:
        component_info['typeName'] = type_match.group(1)
    
    # Only return if we found the essential parts
    required_fields = ['componentClass', 'configSchema', 'progressSchema', 'typeName']
    if all(field in component_info for field in required_fields):
        component_info['file'] = filepath.name
        return component_info
    else:
        missing = [field for field in required_fields if field not in component_info]
        print(f"Warning: {filepath.name} missing required exports: {missing}")
        return None

def discover_components() -> List[Dict[str, str]]:
    """
    Discover all component files in the components directory.
    
    Returns:
        List of component registration dictionaries
    """
    components_path = Path(COMPONENTS_DIR)
    if not components_path.exists():
        print(f"Error: Components directory {COMPONENTS_DIR} not found")
        return []
    
    discovered_components = []
    
    # Scan all TypeScript files except base component
    for ts_file in components_path.glob("*.ts"):
        if ts_file.name == "baseComponent.ts":
            continue
            
        print(f"Scanning {ts_file.name}...")
        component_info = scan_component_file(ts_file)
        
        if component_info:
            discovered_components.append(component_info)
            print(f"  ✅ Registered: {component_info['typeName']} -> {component_info['componentClass']}")
        else:
            print(f"  ⚠️ Skipped: {ts_file.name} (missing required exports)")
    
    return discovered_components

def generate_registry_javascript(components: List[Dict[str, str]]) -> str:
    """
    Generate JavaScript code for component registration.
    
    Args:
        components: List of component dictionaries
        
    Returns:
        JavaScript code as string
    """
    
    # Generate import statements
    imports = []
    registrations = []
    
    for component in components:
        file_without_ext = component['file'].replace('.ts', '')
        
        # Import statement
        imports.append(f"""import {{ 
    {component['componentClass']}, 
    {component['configSchema']}, 
    {component['progressSchema']}
}} from '../ts-build/components/{file_without_ext}.js';""")
        
        # Registration object
        registrations.append(f"""    {{
        componentClass: {component['componentClass']},
        configSchema: {component['configSchema']},
        progressSchema: {component['progressSchema']},
        typeName: '{component['typeName']}'
    }}""")
    
    imports_code = '\n'.join(imports)
    registrations_code = ',\n'.join(registrations)
    
    # Pre-build the join strings outside f-string
    component_type_entries = ',\n'.join(f'    ["{comp["typeName"]}", {comp["componentClass"]}]' for comp in components)
    config_schema_entries = ',\n'.join(f'    ["{comp["typeName"]}", {comp["configSchema"]}]' for comp in components)
    progress_schema_entries = ',\n'.join(f'    ["{comp["typeName"]}", {comp["progressSchema"]}]' for comp in components)
    
    return f'''/*
 * Auto-generated component registry
 * Generated on: {datetime.now().isoformat()}
 * 
 * This file is automatically generated by dev/py/component_registrar.py
 * Do not edit manually - your changes will be overwritten
 */

{imports_code}

/**
 * Component registration data for validation system
 */
export const componentRegistrations = [
{registrations_code}
];

/**
 * Component type lookup map
 */
export const componentTypeMap = new Map([
{component_type_entries}
]);

/**
 * Schema lookup maps
 */
export const configSchemaMap = new Map([
{config_schema_entries}
]);

export const progressSchemaMap = new Map([
{progress_schema_entries}
]);

console.log(`Component registry loaded: ${{componentRegistrations.length}} component types`);
'''

def write_registry_file(content: str) -> bool:
    """
    Write the registry JavaScript file.
    
    Args:
        content: JavaScript code to write
        
    Returns:
        Success status
    """
    output_path = Path(OUTPUT_DIR)
    output_path.mkdir(exist_ok=True)
    
    registry_path = output_path / REGISTRY_FILE
    
    try:
        with open(registry_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print(f"✅ Registry written to: {registry_path}")
        return True
        
    except Exception as e:
        print(f"❌ Failed to write registry: {e}")
        return False

def main():
    """Main execution function."""
    print("🔧 Generating component registry...")
    
    # Discover components
    components = discover_components()
    
    if not components:
        print("❌ No components discovered")
        return False
    
    print(f"\n📊 Summary: {len(components)} components discovered")
    for comp in components:
        print(f"  • {comp['typeName']} ({comp['file']})")
    
    # Generate JavaScript
    registry_js = generate_registry_javascript(components)
    
    # Write output
    success = write_registry_file(registry_js)
    
    if success:
        print(f"\n✅ Component registration complete!")
        print(f"📁 Registry file: {OUTPUT_DIR}/{REGISTRY_FILE}")
        print(f"🔗 Import in validationBuilder.ts: import {{ componentRegistrations }} from '../js/component-registry.js';")
    else:
        print("\n❌ Component registration failed")
    
    return success

if __name__ == "__main__":
    main()