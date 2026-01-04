// timelineContainer.ts - TypeScript version of timeline_container.py
// Spatial layout manager for lesson components

export type ComponentStatus = 'active' | 'completed' | 'locked';

/**
 * Manages the spatial layout of lesson components in a timeline structure
 * Handles visual timeline structure but NOT component logic/lifecycle
 */
export class TimelineContainer {
    private containerId: string;
    private timelineId: string;
    private errorSlotId: string;

    constructor(containerId: string = 'lesson-container') {
        this.containerId = containerId;
        this.timelineId = `${containerId}-timeline`;
        this.errorSlotId = `${containerId}-error-slot`;
        this.setupTimelineStructure();
    }

    /**
     * Create the basic timeline DOM structure
     */
    private setupTimelineStructure(): void {
        const container = document.getElementById(this.containerId);
        if (!container) {
            throw new Error(`Container ${this.containerId} not found`);
        }

        // Clear any existing content
        container.innerHTML = '';

        // Create timeline wrapper - matches learn.html styling
        const timelineHtml = `
            <div class="timeline-wrapper max-w-4xl mx-auto">
                <!-- Error slot (hidden by default) -->
                <div id="${this.errorSlotId}" class="hidden mb-6"></div>
                
                <!-- Main timeline -->
                <div id="${this.timelineId}" class="timeline-track relative">
                    <!-- Timeline line -->
                    <div class="timeline-line absolute left-8 top-0 bottom-0 w-0.5 bg-gray-300"></div>
                    
                    <!-- Component slots will be added here -->
                </div>
            </div>
        `;
        
        container.innerHTML = timelineHtml;
        console.log(`✅ Timeline structure created for ${this.containerId}`);
    }

    /**
     * Add a spatial slot for a component - matches learn.html card styling
     * @param componentId Unique identifier for the component
     * @param position Where to add the slot ('bottom' or 'top')
     * @returns Success status
     */
    addComponentSlot(componentId: string, position: 'bottom' | 'top' = 'bottom'): boolean {
        const timeline = document.getElementById(this.timelineId);
        if (!timeline) {
            console.error(`Timeline ${this.timelineId} not found`);
            return false;
        }

        const slotHtml = `
            <div id="slot-${componentId}" class="timeline-item relative flex items-start">
                <!-- Timeline dot -->
                <div class="timeline-dot relative z-10 flex items-center justify-center w-4 h-4 bg-white dark:bg-gray-800 border-2 border-blue-500 rounded-full mt-6">
                    <div class="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                </div>
                
                <!-- Component content area - matches learn.html card styling -->
                <div id="component-${componentId}" class="component-content ml-6 flex-1 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
                    <!-- Core will inject component here -->
                    <div class="loading-placeholder text-center py-4">
                        <div class="flex items-center justify-center space-x-2 text-blue-600 dark:text-blue-400">
                            <svg class="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span class="text-sm font-medium">Loading component...</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (position === 'bottom') {
            timeline.insertAdjacentHTML('beforeend', slotHtml);
        } else {
            timeline.insertAdjacentHTML('afterbegin', slotHtml);
        }

        console.log(`✅ Added component slot for ${componentId}`);
        return true;
    }

    /**
     * Get the DOM element where core should inject the component
     * @param componentId Component identifier
     * @returns DOM element or null if not found
     */
    getComponentArea(componentId: string): HTMLElement | null {
        return document.getElementById(`component-${componentId}`);
    }

    /**
     * Remove a component slot from the timeline
     * @param componentId Component identifier
     * @returns Success status
     */
    removeComponentSlot(componentId: string): boolean {
        const slot = document.getElementById(`slot-${componentId}`);
        if (slot) {
            slot.remove();
            console.log(`✅ Removed component slot for ${componentId}`);
            return true;
        }
        console.warn(`⚠️ Component slot ${componentId} not found for removal`);
        return false;
    }

    /**
     * Update visual state of a component slot (completed, active, locked)
     * @param componentId Component identifier
     * @param status New status to apply
     * @returns Success status
     */
    updateComponentStatus(componentId: string, status: ComponentStatus = 'active'): boolean {
        const slot = document.getElementById(`slot-${componentId}`);
        if (!slot) {
            console.warn(`⚠️ Component slot ${componentId} not found for status update`);
            return false;
        }

        const dot = slot.querySelector('.timeline-dot div') as HTMLElement;
        const dotContainer = slot.querySelector('.timeline-dot') as HTMLElement;
        
        if (!dot || !dotContainer) {
            console.warn(`⚠️ Timeline dot elements not found for ${componentId}`);
            return false;
        }

        // Reset classes
        dot.className = 'w-2 h-2 rounded-full';
        
        // Apply status styling
        switch (status) {
            case 'completed':
                dot.classList.add('bg-green-500');
                dotContainer.className = dotContainer.className.replace(/border-(blue|gray)-\d+/, 'border-green-500');
                break;
            case 'active':
                dot.classList.add('bg-blue-500');
                dotContainer.className = dotContainer.className.replace(/border-(green|gray)-\d+/, 'border-blue-500');
                break;
            case 'locked':
                dot.classList.add('bg-gray-400');
                dotContainer.className = dotContainer.className.replace(/border-(blue|green)-\d+/, 'border-gray-400');
                break;
        }

        console.log(`✅ Updated component ${componentId} status to ${status}`);
        return true;
    }

    /**
     * Get the error display area for the error handler
     * @returns Error slot DOM element or null
     */
    getErrorSlot(): HTMLElement | null {
        return document.getElementById(this.errorSlotId);
    }

    /**
     * Remove all component slots from the timeline
     */
    clearTimeline(): void {
        const timeline = document.getElementById(this.timelineId);
        if (timeline) {
            // Keep the timeline line, remove component slots
            const slots = timeline.querySelectorAll('.timeline-item');
            slots.forEach(slot => slot.remove());
            console.log('🧹 Timeline cleared of all component slots');
        }
    }

    /**
     * Update the timeline line to show overall progress
     * @param completedCount Number of completed components
     * @param totalCount Total number of components
     */
    setTimelineProgress(completedCount: number, totalCount: number): void {
        if (totalCount === 0) {
            console.warn('⚠️ Cannot set progress: total count is 0');
            return;
        }

        const progressPercent = (completedCount / totalCount) * 100;
        const timeline = document.getElementById(this.timelineId);
        
        if (!timeline) {
            console.warn('⚠️ Timeline not found for progress update');
            return;
        }

        // Update timeline line with progress indicator
        const timelineLine = timeline.querySelector('.timeline-line') as HTMLElement;
        if (timelineLine) {
            timelineLine.innerHTML = `
                <div class="progress-fill absolute top-0 left-0 w-full bg-green-400" 
                     style="height: ${progressPercent}%; transition: height 0.3s ease;"></div>
            `;
            console.log(`📊 Timeline progress updated: ${completedCount}/${totalCount} (${progressPercent.toFixed(1)}%)`);
        }
    }

    /**
     * Get basic timeline statistics
     * @returns Object with timeline metrics
     */
    getTimelineStats(): { totalSlots: number; containerId: string; timelineId: string } {
        const timeline = document.getElementById(this.timelineId);
        const totalSlots = timeline ? timeline.querySelectorAll('.timeline-item').length : 0;
        
        return {
            totalSlots,
            containerId: this.containerId,
            timelineId: this.timelineId
        };
    }
}

/**
 * Singleton instance - created once and shared across application
 * Bootstrap initializes this before starting core
 */
let timelineInstance: TimelineContainer | null = null;

/**
 * Initialize the singleton timeline instance
 * Called once by bootstrap during initialization
 */
export function initializeTimeline(containerId: string = 'lesson-container'): TimelineContainer {
  if (timelineInstance) {
    console.warn('⚠️ Timeline already initialized, returning existing instance');
    return timelineInstance;
  }
  
  timelineInstance = new TimelineContainer(containerId);
  console.log('✅ Timeline singleton initialized');
  return timelineInstance;
}

/**
 * Get the singleton timeline instance
 * @throws Error if timeline not yet initialized
 */
export function getTimelineInstance(): TimelineContainer {
  if (!timelineInstance) {
    throw new Error(
      'Timeline not initialized. Call initializeTimeline() in bootstrap first.'
    );
  }
  return timelineInstance;
}