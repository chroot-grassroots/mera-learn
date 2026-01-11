import { TimelineContainer } from "../../ui/timelineContainer.js";
import {
  BaseComponentConfig,
  BaseComponentCore,
  BaseComponentProgress,
} from "../cores/baseComponentCore.js";

/**
 * Base internal state interface - never serialized or shared with core
 */
export interface BaseComponentInterfaceInternalState {
  rendered: boolean;
  [key: string]: any;
}

/**
 * Asset loading state - tracks network resource status
 * 
 * - loading: Assets currently loading
 * - ready: All assets loaded successfully
 * - partial_failure: Some assets failed, component can still function (degraded mode)
 * - complete_failure: Critical assets failed, component unusable
 * - slow_connection: Loading but connection stalled/very slow (for UX feedback)
 */
type AssetLoadingState = 
  | 'loading'
  | 'ready'
  | 'partial_failure'
  | 'complete_failure'
  | 'slow_connection';

/**
 * Component lifecycle state - tracks DOM render status
 * 
 * - not_displayed: Not yet rendered to DOM (waiting for coordinator)
 * - displayed: Rendered to DOM, visible to user
 */
type ComponentLifecycleState = 
  | 'not_displayed'
  | 'displayed';

/**
 * Base class for all component interfaces.
 * 
 * Manages two separate concerns:
 * 1. Asset Loading: Network resource status (loading, ready, failures, slow connection)
 * 2. Lifecycle: DOM render status (not_displayed, displayed)
 * 
 * Responsibilities:
 * - Load component-specific assets (images, videos, etc.)
 * - Track asset loading state (for coordinator decisions)
 * - Render component to timeline when coordinator permits
 * - Handle user interactions and DOM events
 * 
 * Lifecycle coordination:
 * 1. Constructor: Creates interface and starts async asset loading
 * 2. Coordinator polls isReady() until assets ready (or acceptable failure state)
 * 3. Coordinator calls renderToDOM(): Creates timeline slot and renders content
 * 
 * Concrete interfaces must implement:
 * - createInternalState(): Initialize interface-specific state
 * - loadComponentSpecificAssets(): Load any required assets, set assetLoadingState
 * - render(): Create and attach DOM elements
 * - destroy(): Clean up event listeners and DOM
 */
export abstract class BaseComponentInterface<
  TConfig extends BaseComponentConfig,
  TComponentProgress extends BaseComponentProgress,
  TInternal extends BaseComponentInterfaceInternalState
> {
  protected internal: TInternal;
  private assetLoadingState: AssetLoadingState = 'loading';
  private lifecycleState: ComponentLifecycleState = 'not_displayed';

  /**
   * Construct interface and start loading assets.
   * 
   * Asset loading begins immediately in background.
   * NO DOM WORK in constructor - rendering managed by coordinator.
   * 
   * Initial states:
   * - assetLoadingState: 'loading'
   * - lifecycleState: 'not_displayed'
   */
  constructor(
    protected componentCore: BaseComponentCore<TConfig, TComponentProgress>,
    protected timelineContainer: TimelineContainer
  ) {
    this.internal = this.createInternalState();
    
    // Start loading immediately (fire-and-forget)
    this.loadComponentSpecificAssets().then(() => {
      // Subclass should set assetLoadingState, but default to ready if not set
      if (this.assetLoadingState === 'loading') {
        this.assetLoadingState = 'ready';
      }
    }).catch((error) => {
      console.error('Asset loading failed:', error);
      // Default to complete failure if subclass didn't set state
      if (this.assetLoadingState === 'loading') {
        this.assetLoadingState = 'complete_failure';
      }
    });
  }

  /**
   * Load component-specific assets.
   * 
   * Abstract - concrete interfaces implement to load their required assets.
   * Called automatically during construction.
   * 
   * Subclasses should use setAssetLoadingState() to communicate status:
   * - this.setAssetLoadingState('ready') - All loaded successfully
   * - this.setAssetLoadingState('partial_failure') - Some failed, can still function
   * - this.setAssetLoadingState('complete_failure') - Critical failure
   * - this.setAssetLoadingState('slow_connection') - Stalled/very slow
   * 
   * Examples:
   * - BasicTask: No assets, immediately set 'ready'
   * - VideoComponent: Fetch video, detect slow connection, handle failures
   * - ImageComponent: Preload image with fallback to placeholder
   * 
   * @returns Promise that resolves when component-specific loading complete
   */
  protected abstract loadComponentSpecificAssets(): Promise<void>;

  /**
   * Set asset loading state.
   * 
   * Protected - only subclasses can update state during asset loading.
   * Allows components to communicate loading status to coordinator.
   * 
   * @param state New asset loading state
   */
  protected setAssetLoadingState(state: AssetLoadingState): void {
    this.assetLoadingState = state;
  }

  /**
   * Check if interface is ready to render.
   * 
   * Called by coordinator to determine when component can be displayed.
   * Returns true for states where rendering makes sense:
   * - ready: All assets loaded successfully
   * - partial_failure: Some assets failed, but component can function in degraded mode
   * - slow_connection: Still loading but slow, can render with loading indicator
   * 
   * Returns false for:
   * - loading: Normal loading in progress
   * - complete_failure: Critical failure, component cannot function
   * 
   * @returns true if component can be rendered
   */
  isReady(): boolean {
    return this.assetLoadingState === 'ready' 
        || this.assetLoadingState === 'partial_failure'
        || this.assetLoadingState === 'slow_connection';
  }

  /**
   * Get current asset loading state.
   * 
   * Allows coordinator to make informed decisions:
   * - Show different loading UI for slow_connection
   * - Warn user about partial_failure components
   * - Skip complete_failure components
   * 
   * @returns Current asset loading state
   */
  getAssetLoadingState(): AssetLoadingState {
    return this.assetLoadingState;
  }

  /**
   * Get progress information for assets being loaded.
   * 
   * Optional - components that support progress tracking override this.
   * Default implementation returns null (no progress info available).
   * 
   * Used by coordinator to show "10 MB of 50 MB" type progress.
   * 
   * @returns Progress info or null if not supported
   */
  getLoadingProgress(): { loaded: number; total: number } | null {
    return null;
  }

  /**
   * Render component to DOM.
   * 
   * Called by coordinator after isReady() returns true.
   * Creates timeline slot and delegates to concrete render() implementation.
   * Updates lifecycle state: not_displayed → displayed
   */
  renderToDOM(): void {
    this.timelineContainer.addComponentSlot(
      this.componentCore.config.id
    );
    this.render();
    this.lifecycleState = 'displayed';
  }

  // Abstract methods for concrete interfaces to implement
  protected abstract createInternalState(): TInternal;
  abstract render(): void;
  abstract destroy(): void;
}