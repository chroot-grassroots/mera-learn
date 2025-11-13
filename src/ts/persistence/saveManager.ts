import { PodStorageBundle } from "./podStorageSchema";
import { orchestrateSave } from "./saveOrchestrator";
import { showCriticalError } from "../ui/errorDisplay.js";

enum SaveResult {
  BothSucceeded,
  BothFailed,
  OnlyLocalSucceeded,
  OnlySolidSucceeded,
}

interface SaveStatus {
  inProgress: boolean;
  lastResult: SaveResult;
  lastSaveTime: number;
}

class SaveManager {
  private static instance: SaveManager;
  private saveInProgress: boolean = false;
  private lastSaveResult: SaveResult = SaveResult.BothSucceeded;
  private queuedSave: PodStorageBundle | null = null;
  private saveHasChanged: boolean = false;

  private constructor() {
    this.startPolling();
  }

  static getInstance(): SaveManager {
    if (!SaveManager.instance) {
      SaveManager.instance = new SaveManager();
    }
    return SaveManager.instance;
  }

  private startPolling(): void {
    setInterval(() => this.checkAndSave(), 50);
  }

  private checkAndSave() {
    // Don't save if queuedSave is null.
    if (this.queuedSave === null) {
      return;
    }
    // If no save result is in progress and either the save changed or the last pod save failed.
    if (
      !this.saveInProgress &&
      (this.saveHasChanged ||
        this.lastSaveResult == SaveResult.BothFailed ||
        this.lastSaveResult == SaveResult.OnlyLocalSucceeded)
    ) {
      // Then mark a save in progress
      this.saveInProgress = true;
      // Mark the save has changed false so it doesn't endlessly repeat
      this.saveHasChanged = false;
      // Start a save process
      orchestrateSave(this.queuedSave)
        .then((result: SaveResult) => {
          // Save the result
          this.lastSaveResult = result;
          // Mark save in progress false
          this.saveInProgress = false;

          // Log localStorage failures (rare edge case)
          if (result === SaveResult.OnlySolidSucceeded) {
            console.error(
              "⚠️ localStorage save failed - offline mode unavailable"
            );
          }
        })
        // This shouldn't happen. This error means a programming mistake.
        .catch((error: Error) => {
          showCriticalError({
            title: "Save System Failure",
            message: "Progress is not being saved.",
            technicalDetails: error.stack,
            errorCode: "save-system-failure",
          });
          this.lastSaveResult = SaveResult.BothFailed;
          this.saveInProgress = false;
        });
    }
  }

  queueSave(save: PodStorageBundle, hasChanged: boolean): void {
    this.queuedSave = save;
    this.saveHasChanged = hasChanged;
  }

  getOnlineStatus(): boolean {
    if (
      this.lastSaveResult == SaveResult.BothSucceeded ||
      this.lastSaveResult == SaveResult.OnlySolidSucceeded
    ) {
      return true;
    } else {
      return false;
    }
  }
}

export { SaveManager, SaveResult, SaveStatus };
