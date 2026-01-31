// timelineContainer.ts - Simplified vertical timeline for component flow
// Just manages spatial layout - components render in order with consistent spacing

/**
 * Manages the spatial layout of lesson components in a simple vertical flow.
 * No decorative timeline elements - just provides slots for components to render into.
 *
 * Responsibilities:
 * - Create component slots in order
 * - Provide render areas for component interfaces
 * - Clear all slots on page navigation
 *
 * Does NOT handle:
 * - Component lifecycle (that's componentCoordinator)
 * - Visual state/status (components handle their own appearance)
 * - Progress tracking (that's in the data layer)
 */
export class TimelineContainer {
  private containerId: string;
  private timelineId: string;

  constructor(containerId: string = "lesson-container") {
    this.containerId = containerId;
    this.timelineId = `${containerId}-timeline`;
    this.setupTimelineStructure();
  }

  /**
   * Create the basic timeline DOM structure - just a centered container
   */
  private setupTimelineStructure(): void {
    const container = document.getElementById(this.containerId);
    if (!container) {
      throw new Error(`Container ${this.containerId} not found`);
    }

    // Simple centered container for vertical component flow
    container.innerHTML = `
        <div class="max-w-4xl lg:max-w-6xl mx-auto py-8 px-4">
            <div id="${this.timelineId}" class="space-y-8">
              <!-- Component slots will be added here -->
             </div>
        </div>
    `;

    console.log("✅ Timeline container initialized");
  }

  /**
   * Add a slot for a component to render into.
   * Creates a simple wrapper div with consistent spacing.
   *
   * @param componentId - Unique identifier for the component
   */
  addComponentSlot(componentId: number): void {
    const timeline = document.getElementById(this.timelineId);
    if (!timeline) {
      console.error("❌ Timeline not found, cannot add slot");
      return;
    }

    const slotHtml = `
            <div id="slot-${componentId}" class="component-slot">
                <div id="component-area-${componentId}" class="component-content">
                    <!-- Component interface renders here -->
                </div>
            </div>
        `;

    timeline.insertAdjacentHTML("beforeend", slotHtml);
    console.log(`📍 Added slot for component ${componentId}`);
  }

  /**
   * Get the DOM element where a component should render its content.
   * Component interfaces use this to know where to attach their UI.
   *
   * @param componentId - Component identifier
   * @returns The render area element, or null if not found
   */
  getComponentArea(componentId: number): HTMLElement | null {
    const area = document.getElementById(`component-area-${componentId}`);
    if (!area) {
      console.warn(`⚠️ Component area ${componentId} not found`);
    }
    return area;
  }

  /**
   * Remove all component slots from the timeline.
   * Called when navigating to a new page - clears everything for fresh start.
   */
  clearTimeline(): void {
    const timeline = document.getElementById(this.timelineId);
    if (timeline) {
      timeline.innerHTML = "";
      console.log("🧹 Timeline cleared of all component slots");
    }
  }

  /**
   * Get basic timeline statistics for debugging.
   *
   * @returns Object with timeline metrics
   */
  getTimelineStats(): {
    totalSlots: number;
    containerId: string;
    timelineId: string;
  } {
    const timeline = document.getElementById(this.timelineId);
    const totalSlots = timeline
      ? timeline.querySelectorAll(".component-slot").length
      : 0;

    return {
      totalSlots,
      containerId: this.containerId,
      timelineId: this.timelineId,
    };
  }
}

/**
 * Singleton instance - created once and shared across application.
 * Bootstrap initializes this before starting core.
 */
let timelineInstance: TimelineContainer | null = null;

/**
 * Initialize the singleton timeline instance.
 * Called once by bootstrap during initialization.
 *
 * @param containerId - ID of the container element (default: 'lesson-container')
 * @returns The timeline instance
 */
export function initializeTimeline(
  containerId: string = "lesson-container",
): TimelineContainer {
  if (timelineInstance) {
    console.warn(
      "⚠️ Timeline already initialized, returning existing instance",
    );
    return timelineInstance;
  }

  timelineInstance = new TimelineContainer(containerId);
  console.log("✅ Timeline singleton initialized");
  return timelineInstance;
}

/**
 * Get the singleton timeline instance.
 *
 * @throws Error if timeline not yet initialized
 * @returns The timeline instance
 */
export function getTimelineInstance(): TimelineContainer {
  if (!timelineInstance) {
    throw new Error(
      "Timeline not initialized. Call initializeTimeline() in bootstrap first.",
    );
  }
  return timelineInstance;
}
