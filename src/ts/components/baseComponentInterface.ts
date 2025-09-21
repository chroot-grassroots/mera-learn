import { TimelineContainer } from "../ui/timelineContainer.js";
import {
  BaseComponentConfig,
  BaseComponentCore,
  BaseComponentProgress,
} from "./baseComponentCore.js";

/**
 * Base internal state interface - never serialized or shared with core
 */
export interface BaseComponentInternal {
  rendered: boolean;
  [key: string]: any;
}

export abstract class BaseComponentInterface<
  TConfig extends BaseComponentConfig,
  TComponentProgress extends BaseComponentProgress,
  TInternal extends BaseComponentInternal
> {
  protected internal: TInternal;

  constructor(
    protected component_core: BaseComponentCore<TConfig, TComponentProgress>,
    protected timeline_container: TimelineContainer
  ) {
    this.internal = this.createInternalModel();
    this.initializeComponent();
  }

  // Abstract methods for concrete interfaces to implement
  protected abstract createInternalModel(): TInternal;
  abstract render(): void;
  abstract destroy(): void;

  // Initialize component in timeline
  private initializeComponent(): void {
    this.timeline_container.addComponentSlot(this.component_core.config.id.toString());
    this.render();
  }
}
