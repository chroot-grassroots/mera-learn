import { PodStorageBundle } from "./podStorageSchema";
import { orchestrateSave } from "./saveOrchestrator";

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
    if (
      !this.saveInProgress &&
      (this.saveHasChanged ||
        !(this.lastSaveResult == SaveResult.BothSucceeded))
    ) {
      this.saveInProgress = true;
      this.saveHasChanged = false;
      orchestrateSave(this.queuedSave).then((result: SaveResult) => {
        this.lastSaveResult = result;
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
