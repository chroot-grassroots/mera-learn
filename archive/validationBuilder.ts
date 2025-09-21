// validationBuilder.ts - TypeScript version of validation_builder.py
// Component discovery and validation system builder

import { z } from 'zod';
import type { 
    BaseComponent, 
    BaseComponentConfig, 
    BaseComponentProgress,
    ComponentRegistry,
    SchemaRegistry 
} from '../components/baseComponentCore.js';

// Import all component types for discovery
import { 
    BasicTaskComponent, 
    BasicTaskComponentConfigSchema, 
    BasicTaskComponentProgressSchema,
    type BasicTaskComponentConfig,
    type BasicTaskComponentProgress
} from '../components/basicTask.js';

/**
 * Component class types for registry
 */
type ComponentClass = new (...args: any[]) => BaseComponent<any, any, any>;

/**
 * Component registration entry
 */
interface ComponentRegistration {
    componentClass: ComponentClass;
    configSchema: z.ZodSchema<any>;
    progressSchema: z.ZodSchema<any>;
    typeName: string;
}

/**
 * Global registries - equivalent to your Python validation system
 */
const componentRegistry: ComponentRegistry = new Map();
const schemaRegistry: SchemaRegistry = new Map();
const componentRegistrations: ComponentRegistration[] = [];

/**
 * Discover all component classes - TypeScript version of discover_component_classes()
 */
function discoverComponentClasses(): {
    componentClasses: ComponentClass[];
    componentConfigs: z.ZodSchema<any>[];
    componentProgresses: z.ZodSchema<any>[];
} {
    console.log('🔍 Discovering component classes...');
    
    // Manual registration - TypeScript doesn't have runtime reflection like Python
    // This replaces the Python file system scanning approach
    const discoveries = [
        {
            componentClass: BasicTaskComponent,
            configSchema: BasicTaskComponentConfigSchema,
            progressSchema: BasicTaskComponentProgressSchema,
            typeName: 'basic_task'
        },
        // Add more components here as you create them:
        // {
        //     componentClass: QuizComponent,
        //     configSchema: QuizComponentConfigSchema,
        //     progressSchema: QuizComponentProgressSchema,
        //     typeName: 'quiz'
        // },
    ];
    
    // Store registrations for other functions
    componentRegistrations.push(...discoveries);
    
    const componentClasses = discoveries.map(d => d.componentClass);
    const componentConfigs = discoveries.map(d => d.configSchema);
    const componentProgresses = discoveries.map(d => d.progressSchema);
    
    console.log(`✅ Discovered ${componentClasses.length} component classes`);
    console.log('Component Classes:', componentClasses.map(c => c.name));
    
    return {
        componentClasses,
        componentConfigs,
        componentProgresses
    };
}

/**
 * Build config type registry - maps component type strings to schemas
 */
function buildConfigTypeRegistry(): Map<string, z.ZodSchema<any>> {
    console.log('🏗️ Building config type registry...');
    
    const registry = new Map<string, z.ZodSchema<any>>();
    
    for (const registration of componentRegistrations) {
        registry.set(registration.typeName, registration.configSchema);
        console.log(`📝 Registered config schema for type: ${registration.typeName}`);
    }
    
    return registry;
}

/**
 * Build progress type registry - maps component type strings to progress schemas  
 */
function buildProgressTypeRegistry(): Map<string, z.ZodSchema<any>> {
    console.log('🏗️ Building progress type registry...');
    
    const registry = new Map<string, z.ZodSchema<any>>();
    
    for (const registration of componentRegistrations) {
        registry.set(registration.typeName, registration.progressSchema);
        console.log(`📊 Registered progress schema for type: ${registration.typeName}`);
    }
    
    return registry;
}

/**
 * Build component class registry - maps type strings to component classes
 */
function buildComponentClassRegistry(): ComponentRegistry {
    console.log('🏗️ Building component class registry...');
    
    const registry: ComponentRegistry = new Map();
    
    for (const registration of componentRegistrations) {
        registry.set(registration.typeName, registration.componentClass);
        console.log(`🎯 Registered component class for type: ${registration.typeName}`);
    }
    
    return registry;
}

/**
 * Validate all YAML files - equivalent to validate_all_yamls()
 */
function validateAllYamls(): Map<number, string> {
    console.log('📋 Validating YAML files...');
    
    const idToTypeMapping = new Map<number, string>();
    
    // Check if YAML loading is complete
    const yamlStatus = (window as any).getInitializationStatus?.();
    if (!yamlStatus?.yamlsComplete) {
        console.warn('⚠️ YAML loading not complete, skipping validation');
        return idToTypeMapping;
    }
    
    // Access loaded YAML content from initialization.js
    const lessonRegistry = (window as any).lessonRegistry || {};
    const yamlErrors = (window as any).yamlLoadingErrors || [];
    
    if (yamlErrors.length > 0) {
        console.warn(`⚠️ ${yamlErrors.length} YAML loading errors detected:`, yamlErrors);
    }
    
    // Validate each loaded lesson
    for (const [lessonId, yamlContent] of Object.entries(lessonRegistry)) {
        try {
            // Parse YAML content (you'll need a YAML parser)
            // For now, assume it's already parsed or use JSON
            console.log(`🔍 Validating lesson: ${lessonId}`);
            
            // TODO: Add actual YAML parsing and component validation
            // This would check that each component in the YAML:
            // 1. Has a valid 'type' field
            // 2. The type exists in the component registry
            // 3. The configuration validates against the component's config schema
            
        } catch (error) {
            console.error(`❌ YAML validation failed for ${lessonId}:`, error);
        }
    }
    
    console.log(`✅ YAML validation complete. Found ${idToTypeMapping.size} valid components`);
    return idToTypeMapping;
}

/**
 * Get registry for external access
 */
export function getComponentRegistry(): ComponentRegistry {
    return componentRegistry;
}

export function getSchemaRegistry(): SchemaRegistry {
    return schemaRegistry;
}

/**
 * Validate a single component configuration
 */
export function validateComponentConfig(type: string, config: any): { valid: boolean; error?: string } {
    const configSchema = schemaRegistry.get(type)?.config;
    if (!configSchema) {
        return { valid: false, error: `Unknown component type: ${type}` };
    }
    
    try {
        configSchema.parse(config);
        return { valid: true };
    } catch (error) {
        return { valid: false, error: error instanceof Error ? error.message : 'Validation failed' };
    }
}

/**
 * Helper function to register new component types at runtime
 */
export function registerComponent(
    typeName: string,
    componentClass: ComponentClass,
    configSchema: z.ZodSchema<any>,
    progressSchema: z.ZodSchema<any>
): void {
    componentRegistrations.push({
        componentClass,
        configSchema,
        progressSchema,
        typeName
    });
    
    console.log(`📝 Registered component type: ${typeName}`);
}

/**
 * Main builder - creates all validation registries
 * This is called by bootstrap after UI setup and Solid connection is verified
 */

export async function buildValidationSystem(): Promise<void> {
    console.log('🔧 Building validation system...');
    
    try {
        // Step 1: Discover all component classes
        const discovery = discoverComponentClasses();
        
        // Step 2: Build type registries
        const configRegistry = buildConfigTypeRegistry();
        const progressRegistry = buildProgressTypeRegistry();
        const classRegistry = buildComponentClassRegistry();
        
        // Step 3: Populate global registries
        componentRegistry.clear();
        for (const [type, componentClass] of classRegistry) {
            componentRegistry.set(type, componentClass);
        }
        
        schemaRegistry.clear();
        for (const registration of componentRegistrations) {
            schemaRegistry.set(registration.typeName, {
                config: registration.configSchema,
                progress: registration.progressSchema
            });
        }
        
        // Step 4: Validate YAML files
        const yamlValidation = validateAllYamls();
        
        // Step 5: Log results
        console.log('📊 Validation System Summary:');
        console.log(`   • Component types: ${componentRegistry.size}`);
        console.log(`   • Schema pairs: ${schemaRegistry.size}`);
        console.log(`   • Validated components: ${yamlValidation.size}`);
        
        // Make registries available globally for debugging
        (window as any).meraValidation = {
            componentRegistry,
            schemaRegistry,
            validateComponentConfig
        };
        
        console.log('✅ Validation system build complete');
        
    } catch (error) {
        console.error('❌ Validation system build failed:', error);
        throw error;
    }
}