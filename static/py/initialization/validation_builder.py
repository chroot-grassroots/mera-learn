# static/initialization/validation_builder.py
import inspect
from typing import Dict, List, Type, Any
import os
import importlib.util
from pathlib import Path
import sys
sys.path.append('/static/py')
from components.base_component import BaseComponent, BaseComponentConfig, BaseComponentInternal, BaseComponentProgress

def discover_component_classes():
    component_dir = Path("static/py/components")
    component_classes = []
    component_configs = []
    component_progresses = [] 
    component_internals = []

    # Iterate through .py files in components directory
    for py_file in component_dir.glob("*.py"):
        if py_file.name == "__init__.py" or py_file.name == "base_component.py":
            continue
            
        # Import the module dynamically
        module_name = py_file.stem
        spec = importlib.util.spec_from_file_location(module_name, py_file)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        
        # Iterate through classes in each .py file to make list of models
        for _name, discovered_class in inspect.getmembers(module, inspect.isclass):
            if issubclass(discovered_class, BaseComponent):
                component_classes.append(discovered_class)
            if issubclass(discovered_class, BaseComponentConfig):
                component_configs.append(discovered_class)
            if issubclass(discovered_class, BaseComponentProgress):
                component_progresses.append(discovered_class)
            if issubclass(discovered_class, BaseComponentInternal):
                component_internals.append(discovered_class)
    
    return component_classes, component_configs, component_progresses, component_internals

def build_config_type_registry() -> Dict[str, Type]:
    pass

def build_progress_type_registry() -> Dict[str, Type]:  
    pass

def build_internal_type_registry() -> Dict[str, Type]:
    pass 

def build_method_registry() -> Dict[str, Dict[str, Type]]:
    """Build registry of component type -> allowed methods"""
    pass

def build_progress_model_methods_registry() -> Dict[str, Dict[str, Type]]:
    pass

def validate_all_yamls() -> Dict[int, str]:
    """Load and validate all YAML files, return id->type mapping"""
    pass

def build_validation_system():
    """Main builder - creates all validation registries"""
    print("Building validation system...")
    component_classes, component_configs, component_progresses, component_internals = discover_component_classes()
    print("Component Classes:", component_classes)
    print("Component Configs:", component_configs)
    # Coordinates all the above functions
    pass