#!/usr/bin/env python3
"""
Generate pyscript-config.json for PyScript module loading
Handles Python file mapping for proper imports
"""

import os
import json
import glob
from datetime import datetime

# Configuration
PYTHON_DIR = "static/py"
OUTPUT_FILE = "static/config/pyscript-config.json"

def scan_python_modules():
    """Find all Python modules that need to be mapped in py-config"""
    py_files = glob.glob(os.path.join(PYTHON_DIR, "**/*.py"), recursive=True)
    file_mappings = {}
    
    for py_file in py_files:
        # Skip dev files
        if '/dev/' in py_file or '\\dev\\' in py_file:
            print(f"Skipping dev file: {py_file}")
            continue
            
        # Create mapping from server path to PyScript virtual path
        relative_path = os.path.relpath(py_file)
        virtual_path = relative_path.replace('static/py/', './')
        server_path = '/' + relative_path.replace('\\', '/')
        
        file_mappings[server_path] = virtual_path
        print(f"Mapped: {server_path} -> {virtual_path}")
    
    print(f"Found {len(file_mappings)} Python files to map")
    return file_mappings

def generate_pyconfig(file_mappings):
    """Generate PyScript configuration"""
    config = {
        "packages": [],
        "files": file_mappings
    }
    
    # Add generation timestamp as comment (JSON doesn't support comments, but helpful for debugging)
    return config

def main():
    """Generate the PyScript configuration file"""
    print("Generating PyScript configuration...")
    
    # Scan for Python modules
    file_mappings = scan_python_modules()
    
    # Generate PyScript config
    pyconfig = generate_pyconfig(file_mappings)
    
    # Write output
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(pyconfig, f, indent=2)
    
    print(f"Generated {OUTPUT_FILE}")
    print(f"Summary: {len(file_mappings)} Python files mapped")
    print(f"Generated on: {datetime.now().isoformat()}")

if __name__ == "__main__":
    main()