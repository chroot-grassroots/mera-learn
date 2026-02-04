/**
 * @fileoverview Component Coordinator - Lifecycle Orchestration
 * @module components/componentCoordinator
 *
 * Singleton that orchestrates component interface loading and activation.
 * Runs asynchronously in parallel to Main Core's polling cycle.
 *
 * Responsibilities:
 * - Coordinate async asset loading across all components
 * - Poll components for readiness (asset loading complete)
 * - Activate components when ready (render to DOM, enable operations)
 * - Provide page completion status for navigation components
 * - Handle timeouts and per-component failures gracefully
 *
 * Architecture:
 * - Receives cloned map of cores (defensive against destruction)
 * - Polls every 50ms with 15-second timeout
 * - Components return empty messages until activated
 * - Fire-and-forget pattern (caller doesn't await)
 * - Main Core continues polling during coordination
 */

import { getTimelineInstance } from "../ui/timelineContainer.js";
import type { BaseComponentCore } from "./cores/baseComponentCore.js";

/**
 * Component Coordinator singleton class.
 * 
 * Manages the async lifecycle of component interfaces from creation
 * through asset loading to final activation.
 */
class ComponentCoordinator {
  // Current page's components being coordinated (cloned map for safety)
  private currentPageCores: Map<number, BaseComponentCore<any, any>> | null = null;
  
  // Whether a page load is currently in progress
  private loadingInProgress: boolean = false;

  /**
   * Clear current page state in preparation for new page.
   * 
   * Called by runCore before destroying old components.
   * Resets coordinator state for the next page load.
   */
  clearPage(): void {
    console.log('📄 ComponentCoordinator: Clearing page state');
    
    this.currentPageCores = null;
    this.loadingInProgress = false;
  }

  /**
   * Begin coordinating a new page load.
   * 
   * Orchestrates the async loading and activation of all components:
   * 1. Store cloned map of cores (defensive against external changes)
   * 2. Poll components for readiness (assets loaded)
   * 3. Activate all components when ready (or on timeout)
   * 
   * This method is async but called fire-and-forget. Main Core continues
   * polling normally while this runs in parallel. Components return empty
   * message arrays until activated.
   * 
   * @param cores - Map of component cores to coordinate (componentId -> core)
   * @returns Promise that resolves when page load complete (or times out)
   */
  async beginPageLoad(
    cores: Map<number, BaseComponentCore<any, any>>
  ): Promise<void> {
    
    getTimelineInstance().clearTimeline();
    
    console.log(
      `🎬 ComponentCoordinator: Beginning page load with ${cores.size} components`
    );

    // Store cloned map (defensive - runCore might destroy during our async work)
    this.currentPageCores = new Map(cores);
    this.loadingInProgress = true;

    try {
      // Wait for all components to report ready (with timeout)
      await this.waitForAllReady();

      // Activate all components (render + enable operations)
      this.activateAllComponents();

      console.log('✅ ComponentCoordinator: Page load complete');
    } catch (error) {
      console.error('❌ ComponentCoordinator: Page load failed:', error);
      
      // Even on failure, try to activate what we can
      this.activateAllComponents();
    } finally {
      // Clean up regardless of success/failure
      this.loadingInProgress = false;
    }
  }

  /**
   * Wait for all components to report ready.
   * 
   * Polls every 50ms, checking if all components have finished loading assets.
   * 
   * Uses progress-based timeout: Times out only if NO progress detected for
   * 30 seconds. This allows slow connections to take as long as needed, while 
   * still timing out on truly stalled connections.
   * 
   * Progress is tracked via component.interface.getLoadingProgress() which
   * returns {loaded, total} for components that support it. If any component
   * shows increasing 'loaded' bytes, the timeout clock resets.
   * 
   * Each component check is wrapped in try-catch to handle destroyed/broken
   * components gracefully. A broken component doesn't block page load.
   * 
   * @returns Promise that resolves when all ready or stall timeout reached
   */
  private async waitForAllReady(): Promise<void> {
    const POLL_INTERVAL_MS = 50;
    const STALL_TIMEOUT_MS = 30000; // 30 seconds with NO progress = stalled
    
    let lastProgressTime = Date.now();
    let lastProgressSnapshot = this.captureProgressSnapshot();
    let iterationCount = 0;

    while (true) {
      if (this.allComponentsReady()) {
        console.log(
          `✅ All components ready after ${iterationCount * POLL_INTERVAL_MS}ms`
        );
        return; // Success - all ready!
      }

      // Check if any component is making progress
      const currentSnapshot = this.captureProgressSnapshot();
      if (this.hasProgressChanged(lastProgressSnapshot, currentSnapshot)) {
        // Progress detected! Reset timeout clock
        lastProgressTime = Date.now();
        lastProgressSnapshot = currentSnapshot;
      }

      // Check for stall (no progress for 30 seconds)
      const timeSinceProgress = Date.now() - lastProgressTime;
      if (timeSinceProgress > STALL_TIMEOUT_MS) {
        console.warn(
          `⚠️ ComponentCoordinator: No progress for ${STALL_TIMEOUT_MS}ms - connection stalled, proceeding anyway`
        );
        return; // Timeout - activate what we have
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      iterationCount++;
    }
  }

  /**
   * Capture current loading progress for all components.
   * 
   * Returns a snapshot of how many bytes each component has loaded.
   * Used to detect whether progress is being made on slow connections.
   * 
   * Components that don't support progress tracking (like BasicTask with
   * no assets) won't appear in the snapshot - that's fine, we just track
   * the ones that do report progress.
   * 
   * @returns Map of componentId → bytes loaded
   */
  private captureProgressSnapshot(): Map<number, number> {
    const snapshot = new Map<number, number>();
    
    if (!this.currentPageCores) return snapshot;
    
    for (const [componentId, core] of this.currentPageCores) {
      try {
        const progress = core.interface.getLoadingProgress();
        if (progress) {
          snapshot.set(componentId, progress.loaded);
        }
      } catch (error) {
        // Component destroyed or broken - ignore for progress tracking
      }
    }
    
    return snapshot;
  }

  /**
   * Check if any component has loaded more bytes.
   * 
   * Compares two progress snapshots to detect forward progress.
   * Even 1 byte of progress resets the stall timeout.
   * 
   * @param oldSnapshot - Previous progress snapshot
   * @param newSnapshot - Current progress snapshot
   * @returns true if any component loaded more data
   */
  private hasProgressChanged(
    oldSnapshot: Map<number, number>,
    newSnapshot: Map<number, number>
  ): boolean {
    // Check if any component loaded more bytes
    for (const [componentId, newBytes] of newSnapshot) {
      const oldBytes = oldSnapshot.get(componentId) || 0;
      if (newBytes > oldBytes) {
        return true; // Progress detected!
      }
    }
    
    return false; // No progress
  }

  /**
   * Check if all components report ready.
   * 
   * Defensive implementation - each component check wrapped in try-catch.
   * Broken/destroyed components are treated as "ready" (don't block page).
   * 
   * @returns true if all components ready (or no components exist)
   */
  private allComponentsReady(): boolean {
    if (!this.currentPageCores || this.currentPageCores.size === 0) {
      return true; // No components = ready
    }

    for (const [componentId, core] of this.currentPageCores) {
      try {
        if (!core.isInterfaceReady()) {
          return false; // At least one not ready
        }
      } catch (error) {
        // Component destroyed or broken - log but don't block
        console.warn(
          `⚠️ Component ${componentId} readiness check failed, treating as ready:`,
          error
        );
        // Continue checking others
      }
    }

    return true; // All ready (or all broken - either way, proceed)
  }

  /**
   * Activate all components.
   * 
   * Calls displayInterface() on each component, which:
   * 1. Renders component to DOM (creates timeline slot, displays content)
   * 2. Enables operations (_operationsEnabled = true)
   * 
   * After this, components can produce messages and interact with users.
   * 
   * Each activation is wrapped in try-catch. One broken component doesn't
   * prevent others from activating.
   */
  private activateAllComponents(): void {
    if (!this.currentPageCores) {
      return; // No components to activate
    }

    console.log(
      `🚀 ComponentCoordinator: Activating ${this.currentPageCores.size} components`
    );

    for (const [componentId, core] of this.currentPageCores) {
      try {
        core.displayInterface();
      } catch (error) {
        console.error(
          `❌ Component ${componentId} activation failed:`,
          error
        );
        // Continue activating others
      }
    }
  }

  /**
   * Check if all components on current page are complete.
   * 
   * Called synchronously by navigation components to determine if user
   * can proceed to next page (e.g., "Next" button should be enabled).
   * 
   * Defensive implementation - broken components treated as complete
   * (don't block navigation due to component bugs).
   * 
   * Race condition acceptable: If user clicks during the 50ms window
   * where a component becomes incomplete, navigation may still succeed.
   * This is an acceptable UX trade-off vs. complex locking.
   * 
   * @returns true if all components complete (or no components exist)
   */
  areAllComplete(): boolean {
    if (!this.currentPageCores || this.currentPageCores.size === 0) {
      return true; // No components = can navigate
    }

    for (const [componentId, core] of this.currentPageCores) {
      try {
        if (!core.isComplete()) {
          return false; // At least one incomplete
        }
      } catch (error) {
        // Component destroyed or broken - treat as complete
        console.warn(
          `⚠️ Component ${componentId} completion check failed, treating as complete:`,
          error
        );
        // Continue checking others
      }
    }

    return true; // All complete (or all broken)
  }

  /**
   * Check if page load is currently in progress.
   * 
   * Can be used by UI to show loading indicators, though not currently
   * required by the architecture.
   * 
   * @returns true if beginPageLoad() is running
   */
  isLoadingInProgress(): boolean {
    return this.loadingInProgress;
  }
}

/**
 * Singleton instance - module-level export.
 * 
 * Created on first import, shared across entire application.
 * No explicit initialization needed since coordinator has no dependencies.
 */
export const componentCoordinator = new ComponentCoordinator();