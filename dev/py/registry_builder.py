#!/usr/bin/env python3
"""
Complete Registry Generator for Mera Platform

Generates two separate registry files:
1. yaml-registry.js - Just file paths for runtime YAML loading
2. mera-registry.ts - Complete registry with all 11 mappings for TypeScript bundling
"""

import os
import re
import json
import yaml
import glob
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Set, Tuple

# Configuration
COMPONENTS_DIR = "src/ts/components/cores"
YAML_BASE_DIR = "static/yaml"
LESSONS_DIR = f"{YAML_BASE_DIR}/lessons"
CURRICULUM_DIR = f"{YAML_BASE_DIR}/curriculum"
DOMAINS_DIR = f"{YAML_BASE_DIR}/domains"
MENUS_DIR = f"{YAML_BASE_DIR}/menus"
YAML_REGISTRY_FILE = "static/js/yaml-registry.js"
COMPONENT_REGISTRY_FILE = "src/ts/registry/mera-registry.ts"

# Component discovery patterns
COMPONENT_PATTERNS = {
    "component_class": r"export\s+class\s+(\w+)\s+extends\s+BaseComponentProgressManager",
    "config_schema": r"export\s+const\s+(\w+ConfigSchema)\s*=",
    "progress_schema": r"export\s+const\s+(\w+ProgressSchema)\s*=",
    "component_type": r'type:\s*z\.literal\([\'"]([^\'"]+)[\'"]\)',
    "validator_function": r"export\s+function\s+(validate\w+Structure)\s*\(",
    "initializer_function": r"export\s+function\s+(createInitialProgress)\s*\(",
}


def scan_component_file(filepath: Path) -> Optional[Dict[str, str]]:
    """Scan a TypeScript component file for registration patterns."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception as e:
        print(f"Warning: Could not read {filepath}: {e}")
        return None

    component_info = {}

    for pattern_name, pattern in COMPONENT_PATTERNS.items():
        match = re.search(pattern, content)
        if match:
            if pattern_name == "component_type":
                component_info["typeName"] = match.group(1)
            elif pattern_name == "component_class":
                component_info["componentClass"] = match.group(1)
            elif pattern_name == "config_schema":
                component_info["configSchema"] = match.group(1)
            elif pattern_name == "progress_schema":
                component_info["progressSchema"] = match.group(1)
            elif pattern_name == "validator_function":
                component_info["validatorFunction"] = match.group(1)
            elif pattern_name == "initializer_function":
                component_info["initializerFunction"] = match.group(1)

    required_fields = ["componentClass", "configSchema", "progressSchema", "typeName", "initializerFunction"]
    if all(field in component_info for field in required_fields):
        component_info["file"] = filepath.stem
        # Validator function is optional (not all components have it yet)
        if "validatorFunction" not in component_info:
            print(f"  ⚠️  No validator function found (this is okay for now)")
        return component_info
    else:
        missing = [field for field in required_fields if field not in component_info]
        print(f"Warning: {filepath.name} missing required exports: {missing}")
        return None


def discover_components() -> List[Dict[str, str]]:
    """Discover all component files in the components directory."""
    components_path = Path(COMPONENTS_DIR)
    if not components_path.exists():
        print(f"Warning: Components directory {COMPONENTS_DIR} not found")
        return []

    discovered_components = []

    for ts_file in components_path.glob("*.ts"):
        if ts_file.stem == "baseComponentCore":
            continue
        print(f"Scanning component: {ts_file.name}...")
        component_info = scan_component_file(ts_file)

        if component_info:
            discovered_components.append(component_info)
            print(f"  ✅ Registered: {component_info['typeName']}")
        else:
            print(f"  ⚠️ Skipped: {ts_file.name}")

    return discovered_components


def scan_yaml_files_in_directory(
    directory: str, file_type: str
) -> List[Dict[str, str]]:
    """Scan YAML files in a directory and return file info."""
    dir_path = Path(directory)
    if not dir_path.exists():
        print(f"Warning: Directory {directory} not found")
        return []

    files = []
    for yaml_file in dir_path.glob("*.yaml"):
        # Create absolute path from domain root by adding leading slash
        relative_path = yaml_file.relative_to(".").as_posix()
        file_info = {
            "path": f"/{relative_path}",  # Add leading slash for absolute path
            "filename": yaml_file.name,
            "type": file_type,
        }
        files.append(file_info)
        print(f"  Found {file_type}: {yaml_file.name}")

    return files


def scan_all_yaml_files() -> Dict[str, List[Dict[str, str]]]:
    """Scan all YAML directories and return file lists."""
    print("Scanning YAML directories...")

    yaml_files = {
        "lessons": scan_yaml_files_in_directory(LESSONS_DIR, "lesson"),
        "curriculum": scan_yaml_files_in_directory(CURRICULUM_DIR, "curriculum"),
        "domains": scan_yaml_files_in_directory(DOMAINS_DIR, "domain"),
        "menus": scan_yaml_files_in_directory(MENUS_DIR, "menu"),
    }

    total = sum(len(files) for files in yaml_files.values())
    print(f"📊 Total YAML files: {total}")

    return yaml_files


def parse_entity_yaml(yaml_file: Path, entity_type: str) -> Optional[Dict]:
    """Parse a single entity (lesson or menu) YAML file."""
    try:
        with open(yaml_file, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)

        metadata = data.get("metadata", {})
        entity_id = metadata.get("id")

        if not entity_id:
            return None

        pages = data.get("pages", [])
        total_components = sum(len(page.get("components", [])) for page in pages)

        entity_info = {
            "id": entity_id,
            "path": str(yaml_file.relative_to(".")).replace("\\", "/"),
            "title": metadata.get("title", ""),
            "entityType": entity_type,
            "pageCount": len(pages),
            "componentCount": total_components,
            "difficulty": metadata.get("difficulty", "beginner"),
            "estimatedMinutes": metadata.get("estimatedMinutes", 0),
            "required": metadata.get("required", True),
        }

        # Only add domainId for lesson type
        if entity_type == "lesson":
            entity_info["domainId"] = metadata.get("domainId")

        return entity_info

    except Exception as e:
        print(f"  ❌ Error parsing {yaml_file.name}: {e}")
        return None


def parse_all_entities() -> Tuple[List[Dict], Set[int], Set[int], Dict[int, List[int]], Dict[int, str], Dict[int, int]]:
    """Parse all entity YAML files (lessons and menus).
    
    Returns:
        - all_entities: List of entity metadata
        - entity_ids: Set of all entity IDs
        - component_ids: Set of all component IDs
        - domain_lesson_map: Map of domain ID to lesson IDs
        - component_id_to_type: Map of component ID to component type string
        - component_to_lesson_map: Map of component ID to lesson ID (NEW!)
    """
    all_entities = []
    entity_ids = set()
    component_ids = set()
    domain_lesson_map = {}
    component_id_to_type = {}
    component_to_lesson_map = {}  # NEW: Reverse index componentId -> lessonId

    # Parse lesson entities
    lessons_path = Path(LESSONS_DIR)
    if lessons_path.exists():
        for yaml_file in lessons_path.glob("*.yaml"):
            entity_info = parse_entity_yaml(yaml_file, "lesson")
            if not entity_info:
                continue

            entity_id = entity_info["id"]
            if entity_id in entity_ids:
                print(f"  ❌ Error: Duplicate entity ID {entity_id}")
                continue

            entity_ids.add(entity_id)
            all_entities.append(entity_info)

            # Collect component IDs AND types
            with open(yaml_file, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
                for page in data.get("pages", []):
                    for component in page.get("components", []):
                        comp_id = component.get("id")
                        comp_type = component.get("type")
                        if comp_id and comp_type:
                            component_ids.add(comp_id)
                            # Store the type mapping - FAIL on conflict
                            if comp_id in component_id_to_type and component_id_to_type[comp_id] != comp_type:
                                raise ValueError(
                                    f"FATAL: Component ID {comp_id} has conflicting types!\n"
                                    f"  Previously seen as: '{component_id_to_type[comp_id]}'\n"
                                    f"  Now found as: '{comp_type}'\n"
                                    f"  in file: {yaml_file.name}\n"
                                    f"Component IDs must be unique across all components."
                                )
                            component_id_to_type[comp_id] = comp_type
                            # NEW: Build reverse index componentId -> lessonId
                            component_to_lesson_map[comp_id] = entity_id

            # Map domain to lessons (only for lesson type)
            domain_id = entity_info.get("domainId")
            if domain_id:
                if domain_id not in domain_lesson_map:
                    domain_lesson_map[domain_id] = []
                domain_lesson_map[domain_id].append(entity_id)

    # Parse menu entities
    menus_path = Path(MENUS_DIR)
    if menus_path.exists():
        for yaml_file in menus_path.glob("*.yaml"):
            entity_info = parse_entity_yaml(yaml_file, "menu")
            if not entity_info:
                continue

            entity_id = entity_info["id"]
            if entity_id in entity_ids:
                print(f"  ❌ Error: Duplicate entity ID {entity_id}")
                continue

            entity_ids.add(entity_id)
            all_entities.append(entity_info)

            # Collect component IDs AND types from menus too
            with open(yaml_file, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
                for page in data.get("pages", []):
                    for component in page.get("components", []):
                        comp_id = component.get("id")
                        comp_type = component.get("type")
                        if comp_id and comp_type:
                            component_ids.add(comp_id)
                            # NEW: Store the mapping - FAIL on conflict
                            if comp_id in component_id_to_type and component_id_to_type[comp_id] != comp_type:
                                raise ValueError(
                                    f"FATAL: Component ID {comp_id} has conflicting types!\n"
                                    f"  Previously seen as: '{component_id_to_type[comp_id]}'\n"
                                    f"  Now found as: '{comp_type}'\n"
                                    f"  in file: {yaml_file.name}\n"
                                    f"Component IDs must be unique across all components."
                                )
                            component_id_to_type[comp_id] = comp_type

    return all_entities, entity_ids, component_ids, domain_lesson_map, component_id_to_type, component_to_lesson_map


def parse_curriculum() -> Optional[Dict]:
    """Parse curriculum YAML file."""
    curriculum_path = Path(CURRICULUM_DIR)
    if not curriculum_path.exists():
        return None

    yaml_files = list(curriculum_path.glob("*.yaml"))
    if not yaml_files:
        return None

    try:
        with open(yaml_files[0], "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
    except Exception as e:
        print(f"❌ Error parsing curriculum: {e}")
        return None


def parse_domains() -> List[Dict]:
    """Parse domain YAML files."""
    domains_path = Path(DOMAINS_DIR)
    if not domains_path.exists():
        return []

    domains = []
    for yaml_file in domains_path.glob("*.yaml"):
        try:
            with open(yaml_file, "r", encoding="utf-8") as f:
                domain_data = yaml.safe_load(f)
                domains.append(domain_data)
        except Exception as e:
            print(f"❌ Error parsing domain {yaml_file.name}: {e}")

    return domains


def generate_yaml_registry(yaml_files: Dict[str, List[Dict[str, str]]]) -> str:
    """Generate simple YAML registry with just file paths for loading."""

    return f"""/*
 * Auto-generated YAML File Registry for Runtime Loading
 * Generated on: {datetime.now().isoformat()}
 * 
 * This file contains ONLY file paths for loading YAML content at runtime.
 * All parsed data and mappings are in mera-registry.ts (bundled with TypeScript).
 * 
 * This file is automatically generated by dev/py/registry_builder.py
 * Do not edit manually - your changes will be overwritten
 */

/**
 * Lesson files to load
 */
export const lessonFiles = {json.dumps(yaml_files['lessons'], indent=2)};

/**
 * Curriculum files to load
 */
export const curriculumFiles = {json.dumps(yaml_files['curriculum'], indent=2)};

/**
 * Domain files to load
 */
export const domainFiles = {json.dumps(yaml_files['domains'], indent=2)};

/**
 * Menu files to load
 */
export const menuFiles = {json.dumps(yaml_files['menus'], indent=2)};

/**
 * All YAML files combined
 */
export const allYamlFiles = [
    ...lessonFiles,
    ...curriculumFiles,
    ...domainFiles,
    ...menuFiles
];

console.log(`YAML File Registry loaded: ${{allYamlFiles.length}} files to load`);
"""


def generate_component_registry(
    components: List[Dict],
    entities: List[Dict],
    entity_ids: Set,
    component_ids: Set,
    domain_lesson_map: Dict[int, List[int]],
    component_id_to_type: Dict[int, str],
    component_to_lesson_map: Dict[int, int],  # NEW parameter!
    curriculum: Optional[Dict],
    domains: List[Dict],
) -> str:
    """Generate complete TypeScript registry with all 13 mappings."""
    imports = []
    registrations = []

    for component in components:
        imports_list = [
            component['componentClass'],
            component['configSchema'],
            component['progressSchema']
        ]
        # Add validator function if it exists
        if 'validatorFunction' in component:
            imports_list.append(component['validatorFunction'])
        
        import_stmt = f"""import {{ 
    {', '.join(imports_list)}
}} from '../components/cores/{component['file']}.js';"""
        imports.append(import_stmt)

        registration = f"""    {{
        componentClass: {component['componentClass']},
        configSchema: {component['configSchema']},
        progressSchema: {component['progressSchema']},
        typeName: '{component['typeName']}'
    }}"""
        registrations.append(registration)

    imports_code = "\n".join(imports) if imports else "// No components discovered yet"
    registrations_code = ",\n".join(registrations) if registrations else ""

    component_type_entries = []
    for comp in components:
        entry = f'    ["{comp["typeName"]}", {comp["componentClass"]}]'
        component_type_entries.append(entry)
    component_type_content = ",\n".join(component_type_entries) if component_type_entries else ""

    config_schema_entries = []
    for comp in components:
        entry = f'    ["{comp["typeName"]}", {comp["configSchema"]}]'
        config_schema_entries.append(entry)
    config_schema_content = ",\n".join(config_schema_entries) if config_schema_entries else ""

    progress_schema_entries = []
    for comp in components:
        entry = f'    ["{comp["typeName"]}", {comp["progressSchema"]}]'
        progress_schema_entries.append(entry)
    progress_schema_content = ",\n".join(progress_schema_entries) if progress_schema_entries else ""

    # NEW: Generate validator function map
    validator_entries = []
    for comp in components:
        if 'validatorFunction' in comp:
            entry = f'    ["{comp["typeName"]}", {comp["validatorFunction"]}]'
            validator_entries.append(entry)
    validator_content = ",\n".join(validator_entries) if validator_entries else ""

    # NEW: Generate initializer function map
    initializer_entries = []
    for comp in components:
        if 'initializerFunction' in comp:
            entry = f'    ["{comp["typeName"]}", {comp["initializerFunction"]}]'
            initializer_entries.append(entry)
    initializer_content = ",\n".join(initializer_entries) if initializer_entries else ""

    entity_metrics_entries = []
    for entity in entities:
        entry = f'    [{entity["id"]}, {{ pageCount: {entity["pageCount"]}, componentCount: {entity["componentCount"]}, title: "{entity["title"]}", difficulty: "{entity.get("difficulty", "beginner")}" }}]'
        entity_metrics_entries.append(entry)
    entity_metrics_content = ",\n".join(entity_metrics_entries) if entity_metrics_entries else ""

    domain_lesson_entries = []
    for domain_id, lesson_list in domain_lesson_map.items():
        entry = f"    [{domain_id}, {json.dumps(lesson_list)}]"
        domain_lesson_entries.append(entry)
    domain_lesson_content = ",\n".join(domain_lesson_entries) if domain_lesson_entries else ""

    # NEW: Generate MAPPING 8 - Component ID to Type
    component_id_to_type_entries = []
    for comp_id, comp_type in sorted(component_id_to_type.items()):
        entry = f'    [{comp_id}, "{comp_type}"]'
        component_id_to_type_entries.append(entry)
    component_id_to_type_content = ",\n".join(component_id_to_type_entries) if component_id_to_type_entries else ""

    # NEW: Generate MAPPING 8.5 - Component ID to Lesson ID
    component_to_lesson_entries = []
    for comp_id, lesson_id in sorted(component_to_lesson_map.items()):
        entry = f'    [{comp_id}, {lesson_id}]'
        component_to_lesson_entries.append(entry)
    component_to_lesson_content = ",\n".join(component_to_lesson_entries) if component_to_lesson_entries else ""

    entity_ids_array = json.dumps(sorted(list(entity_ids)))
    component_ids_array = json.dumps(sorted(list(component_ids)))

    return f"""/*
 * Auto-generated Complete Registry for TypeScript Bundling
 * Generated on: {datetime.now().isoformat()}
 * 
 * This file contains ALL 11 mappings and parsed YAML data.
 * Gets bundled into mera-app.js via TypeScript compilation.
 * 
 * This file is automatically generated by dev/py/registry_builder.py
 * Do not edit manually - your changes will be overwritten
 */

import {{ z }} from 'zod';
import type {{ BaseComponentProgressManager }} from '../components/cores/baseComponentCore.js';

{imports_code}

export interface ComponentRegistration {{
    componentClass: any;
    configSchema: z.ZodType<any>;
    progressSchema: z.ZodType<any>;
    typeName: string;
}}

export interface LessonMetrics {{
    pageCount: number;
    componentCount: number;
    title: string;
    difficulty: string;
}}

/**
 * MAPPING 1: Component Registrations
 * Array of all component registrations with classes and schemas
 */
export const componentRegistrations: ComponentRegistration[] = [
{registrations_code}
];

/**
 * MAPPING 2: Component Type Map
 * Maps component type string to component class
 */
export const componentTypeMap = new Map<string, any>([
{component_type_content}
]);

/**
 * MAPPING 3: Config Schema Map
 * Maps component type string to config schema
 */
export const configSchemaMap = new Map<string, z.ZodType<any>>([
{config_schema_content}
]);

/**
 * MAPPING 4: Progress Schema Map
 * Maps component type string to progress schema
 */
export const progressSchemaMap = new Map<string, z.ZodType<any>>([
{progress_schema_content}
]);

/**
 * MAPPING 4.5: Component Validator Map
 * Maps component type string to validator function
 * Used by progressIntegrity to validate component progress against config
 */
export const componentValidatorMap = new Map<string, any>([
{validator_content}
]);

/**
 * MAPPING 4.6: Component Initializer Map
 * Maps component type string to createInitialProgress function
 * Used by progressIntegrity to initialize missing/new components with defaults
 */
export const componentInitializerMap = new Map<string, () => any>([
{initializer_content}
]);

/**
 * MAPPING 5: All Entity IDs
 * Set of all valid entity IDs in the system (lessons and menus)
 */
export const allLessonIds = {entity_ids_array};

/**
 * MAPPING 6: All Component IDs
 * Set of all component IDs used across all entities
 */
export const allComponentIds = {component_ids_array};

/**
 * MAPPING 7: Entity Metrics Map
 * Maps entity ID to metrics (page count, component count, etc.)
 */
export const lessonMetrics = new Map<number, LessonMetrics>([
{entity_metrics_content}
]);

/**
 * MAPPING 8: Component ID to Type Map
 * Maps component ID (number) to component type string
 * Critical for progress migration - allows validation against correct schema
 */
export const componentIdToTypeMap = new Map<number, string>([
{component_id_to_type_content}
]);

/**
 * MAPPING 8.5: Component ID to Lesson ID Map
 * Maps component ID (number) to the lesson ID that contains it
 * Used by progressIntegrity to find lesson configs for component validation
 */
export const componentToLessonMap = new Map<number, number>([
{component_to_lesson_content}
]);

/**
 * MAPPING 9: Domain-Lesson Map
 * Maps domain ID to array of lesson IDs in that domain
 */
export const domainLessonMap = new Map<number, number[]>([
{domain_lesson_content}
]);

/**
 * MAPPING 10: Curriculum Data
 * Complete parsed curriculum structure
 */
const curriculumDataRaw = {json.dumps(curriculum, indent=2) if curriculum else 'null'};

/**
 * Curriculum Registry - provides methods for querying curriculum data
 */
export class CurriculumRegistry {{
    constructor(
        private curriculum: any,
        private lessonIds: Set<number>,
        private domainMap: Map<number, number[]>,
        private componentIdToType: Map<number, string>,
        private componentToLesson: Map<number, number>
    ) {{}}
    
    hasEntity(entityId: number): boolean {{
        return this.lessonIds.has(entityId);
    }}

    hasLesson(lessonId: number): boolean {{
        const metadata = lessonMetadata.find(l => l.id === lessonId);
        return metadata?.entityType === "lesson" || false;
    }}

    hasMenu(menuId: number): boolean {{
        const metadata = lessonMetadata.find(l => l.id === menuId);
        return metadata?.entityType === "menu" || false;
    }}

    hasDomain(domainId: number): boolean {{
        return this.domainMap.has(domainId);
    }}

    getEntityPageCount(entityId: number): number {{
        const metrics = lessonMetrics.get(entityId);
        if (!metrics) {{
            throw new Error(
                `Entity ${{entityId}} not found in registry. Cannot determine page count.`
            );
        }}
        return metrics.pageCount;
    }}

    hasComponent(componentId: number): boolean {{
        return this.componentIdToType.has(componentId);
    }}

    getComponentType(componentId: number): string | undefined {{
        return this.componentIdToType.get(componentId);
    }}

    getAllComponentIds(): number[] {{
        return Array.from(this.componentIdToType.keys());
    }}

    getLessonIdForComponent(componentId: number): number | undefined {{
        return this.componentToLesson.get(componentId);
    }}
}}

export const curriculumData = new CurriculumRegistry(
    curriculumDataRaw,
    new Set(allLessonIds),
    domainLessonMap,
    componentIdToTypeMap,
    componentToLessonMap
);

/**
 * MAPPING 11: Domain Data
 * Array of all domain definitions
 */
export const domainData = {json.dumps(domains, indent=2)};

/**
 * MAPPING 12: Entity Metadata
 * Complete metadata for all entities (lessons and menus)
 */
export const lessonMetadata = {json.dumps(entities, indent=2)};

console.log(`Mera Registry loaded with all 12 mappings:`);
console.log(`  - ${{componentRegistrations.length}} component types`);
console.log(`  - ${{allLessonIds.length}} entities (lessons + menus)`);
console.log(`  - ${{allComponentIds.length}} component IDs`);
console.log(`  - ${{componentIdToTypeMap.size}} component ID->type mappings`);
console.log(`  - ${{domainLessonMap.size}} domains`);
"""


def write_registry_files(yaml_content: str, component_content: str) -> bool:
    """Write both registry files."""
    yaml_path = Path(YAML_REGISTRY_FILE)
    yaml_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        with open(yaml_path, "w", encoding="utf-8") as f:
            f.write(yaml_content)
        print(f"✅ YAML registry written to: {yaml_path}")
    except Exception as e:
        print(f"❌ Failed to write YAML registry: {e}")
        return False

    component_path = Path(COMPONENT_REGISTRY_FILE)
    component_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        with open(component_path, "w", encoding="utf-8") as f:
            f.write(component_content)
        print(f"✅ Component registry written to: {component_path}")
    except Exception as e:
        print(f"❌ Failed to write component registry: {e}")
        return False

    return True


def main():
    """Main execution function."""
    print("🚀 Generating Mera platform registries...")

    print("\n📦 Phase 1: Component Discovery")
    components = discover_components()

    print("\n📂 Phase 2: YAML File Discovery")
    yaml_files = scan_all_yaml_files()

    print("\n📚 Phase 3: YAML Content Parsing")
    entities, entity_ids, component_ids, domain_lesson_map, component_id_to_type, component_to_lesson_map = parse_all_entities()
    curriculum = parse_curriculum()
    domains = parse_domains()

    print("\n🗃️ Generating registry files...")
    yaml_registry = generate_yaml_registry(yaml_files)
    component_registry = generate_component_registry(
        components,
        entities,
        entity_ids,
        component_ids,
        domain_lesson_map,
        component_id_to_type,
        component_to_lesson_map,  # NEW: Pass the reverse index!
        curriculum,
        domains,
    )

    success = write_registry_files(yaml_registry, component_registry)

    if success:
        lesson_count = sum(1 for e in entities if e.get("entityType") == "lesson")
        menu_count = sum(1 for e in entities if e.get("entityType") == "menu")
        
        print(f"\n✅ Registry generation complete!")
        print(f"📁 YAML File Registry: {YAML_REGISTRY_FILE}")
        print(f"   - {sum(len(files) for files in yaml_files.values())} YAML files for runtime loading")
        print(f"📁 Complete Registry: {COMPONENT_REGISTRY_FILE}")
        print(f"   - All 12 mappings included (added MAPPING 8: componentIdToTypeMap)")
        print(f"📊 Content Summary:")
        print(f"  • {len(components)} component types")
        print(f"  • {lesson_count} lessons")
        print(f"  • {menu_count} menus")
        print(f"  • {len(entity_ids)} total entities")
        print(f"  • {len(component_ids)} component IDs")
        print(f"  • {len(component_id_to_type)} component ID->type mappings")
        print(f"  • {len(domain_lesson_map)} domains")
    else:
        print("\n❌ Registry generation failed")

    return success


if __name__ == "__main__":
    main()