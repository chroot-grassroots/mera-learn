# static/initialization/validation_builder.py
import inspect
from typing import Dict, List, Type, Any

def discover_component_classes():
    """Find ALL component model classes during startup"""
    component_configs = []
    component_progress = []
    component_internals = []
    
    pass
    
    return component_configs, component_progress, component_internals

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
    # Coordinates all the above functions
    pass