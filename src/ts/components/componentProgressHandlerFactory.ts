import { BasicTaskProgressMessageHandler } from './cores/basicTaskCore.js';
import type { BaseComponentProgressManager } from './cores/baseComponentCore.js';
import type { ComponentProgressMessage } from '../core/coreTypes.js';

/**
 * Interface all component progress handlers must implement.
 */
export interface IComponentProgressMessageHandler {
  handleMessage(message: ComponentProgressMessage): void;
  getComponentType(): string;
}

/**
 * Create all component progress message handlers.
 * 
 * Returns a map of component type string -> handler instance.
 * Each handler validates and routes messages to the appropriate manager methods.
 * 
 * @param componentManagers - Map of all component progress managers
 * @returns Map of component type to handler
 */
export function createComponentProgressHandlers(
  componentManagers: Map<number, BaseComponentProgressManager<any, any>>
): Map<string, IComponentProgressMessageHandler> {
  
  const handlers = new Map<string, IComponentProgressMessageHandler>();
  
  // Create handler for each component type
  const basicTaskHandler = new BasicTaskProgressMessageHandler(componentManagers);
  handlers.set('basic_task', basicTaskHandler);
  
  // Future component types will be added here:
  // const quizHandler = new QuizProgressMessageHandler(componentManagers);
  // handlers.set('quiz', quizHandler);
  
  return handlers;
}