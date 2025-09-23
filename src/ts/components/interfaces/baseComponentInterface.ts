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

export abstract class BaseComponentInterface<
  TConfig extends BaseComponentConfig,
  TComponentProgress extends BaseComponentProgress,
  TInternal extends BaseComponentInterfaceInternalState
> {
  protected internal: TInternal;

  constructor(
    protected componentCore: BaseComponentCore<TConfig, TComponentProgress>,
    protected timelineContainer: TimelineContainer
  ) {
    this.internal = this.createInternalState();
    this.initializeComponent();
  }

  // Abstract methods for concrete interfaces to implement
  protected abstract createInternalState(): TInternal;
  abstract render(): void;
  abstract destroy(): void;

  // Initialize component in timeline
  private initializeComponent(): void {
    this.timelineContainer.addComponentSlot(this.componentCore.config.id.toString());
    this.render();
  }
}
