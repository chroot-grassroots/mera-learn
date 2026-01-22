/**
 * meraBridge.ts - Storage Bridge for Mera Platform
 *
 * Provides unified interface for dual storage:
 * - Local: Browser localStorage for offline capability
 * - Remote: Solid Pod for data sovereignty and sync
 *
 * Uses @inrupt/solid-client for robust Pod operations
 * Uses @inrupt/solid-client-authn-browser for authentication
 *
 * Design principles:
 * - Singleton pattern for global access
 * - Consistent BridgeResult interface
 * - String-based persistence (Core handles JSON serialization)
 * - Trust Solid Client's built-in session persistence
 * - Breaking change isolation from Inrupt library updates
 *
 * Architecture:
 * - Auto-initialization at module load (fire-and-forget)
 * - Bootstrap polls check() method to wait for completion
 * - Persistence layer is "dumb byte storage" - just saves/loads strings
 */

import {
  overwriteFile,
  getFile,
  deleteFile,
  getSolidDataset,
  getContainedResourceUrlAll,
  createContainerAt,
} from "@inrupt/solid-client";
import { getDefaultSession, Session } from "@inrupt/solid-client-authn-browser";

// ============================================================================
// Type Definitions
// ============================================================================

export enum BridgeErrorType {
  Authentication = "authentication",
  Network = "network",
  NotFound = "not_found",
  Storage = "storage",
  Validation = "validation",
}

export interface BridgeResult<T = any> {
  success: boolean;
  data?: T;
  error?: string | null;
  errorType?: BridgeErrorType;
}

// ============================================================================
// MeraBridge Class
// ============================================================================

export class MeraBridge {
  private static instance: MeraBridge | null = null;

  private session: Session | null = null;
  private podUrl: string | null = null;
  private initialized: boolean = false;
  private initializationPromise: Promise<boolean> | null = null;

  private constructor() {
    // Private constructor enforces singleton
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): MeraBridge {
    if (!MeraBridge.instance) {
      MeraBridge.instance = new MeraBridge();
    }
    return MeraBridge.instance;
  }

  // ==========================================================================
  // Initialization & Session Management
  // ==========================================================================

  /**
   * Initialize bridge - ensures session is ready and Pod URL is extracted
   *
   * Called automatically at module load (fire-and-forget pattern).
   *
   * Trusts Solid Client's built-in persistence:
   * - getDefaultSession() auto-restores from localStorage
   * - handleIncomingRedirect() handles both OAuth callbacks AND restoration
   * - No manual timestamp tracking needed
   *
   * @returns Promise<boolean> - true if authenticated, false otherwise
   */
  public async initialize(): Promise<boolean> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._doInitialize();
    return this.initializationPromise;
  }

  private async _doInitialize(): Promise<boolean> {
    console.log("🌉 Mera Bridge initializing...");

    try {
      // Step 1: Get session
      this.session = getDefaultSession();
      console.log("📍 Step 1: Initial session check:", {
        sessionId: this.session.info.sessionId,
        isLoggedIn: this.session.info.isLoggedIn,
        webId: this.session.info.webId,
      });

      // Step 1.5: Check what's in localStorage (diagnostic)
      const solidKeys = Object.keys(localStorage).filter(
        (k) =>
          k.includes("solid") || k.includes("session") || k.includes("oidc"),
      );
      console.log("📍 Step 1.5: localStorage investigation:", {
        hasCurrentSession:
          localStorage.getItem("solidClientAuthn:currentSession") !== null,
        solidKeyCount: solidKeys.length,
      });

      // Step 2: Call handleIncomingRedirect with restorePreviousSession option
      console.log("📍 Step 2: Calling handleIncomingRedirect...");
      console.log("📍 Step 2a: URL:", window.location.href);
      console.log(
        "📍 Step 2b: Has OAuth params:",
        window.location.href.includes("code="),
      );

      await this.session.handleIncomingRedirect({
        url: window.location.href,
        restorePreviousSession: true,
      });
      console.log("📍 Step 3: handleIncomingRedirect completed");

      // Step 3: Get fresh session after handleIncomingRedirect
      this.session = getDefaultSession();
      console.log("📍 Step 4: Session after handleIncomingRedirect:", {
        sessionId: this.session.info.sessionId,
        isLoggedIn: this.session.info.isLoggedIn,
        webId: this.session.info.webId,
      });

      // Step 4: Check if logged in
      if (this.session.info.isLoggedIn) {
        console.log("✅ User authenticated");

        // NEW: Ensure session marker is set for other pages to detect
        if (this.session.info.sessionId) {
          localStorage.setItem(
            "solidClientAuthn:currentSession",
            this.session.info.sessionId,
          );
          console.log("📝 Stored session marker for cross-page detection");
        }

        await this._extractPodUrl();
        this.initialized = true;
        return true;
      } else {
        console.log("⚠️ User not authenticated");

        // Check if we have orphaned Solid data (browser restart scenario)
        if (solidKeys.length > 0) {
          console.log(
            "🔄 Found Solid data without active session - triggering re-authentication",
          );
          console.log("🔄 This will redirect you to login...");

          // Auto-trigger login - user will be redirected away
          await this.session.login({
            oidcIssuer: "https://solidcommunity.net",
            redirectUrl: window.location.href,
            clientName: "Mera Digital Security Education",
          });

          // We never reach here - login() redirects away
          return new Promise(() => {}); // Pending forever (we've redirected)
        }

        // Truly new user - no Solid data at all
        console.log(
          "⚠️ No Solid data found - new user or need to authenticate",
        );
        this.initialized = false;
        return false;
      }
    } catch (error) {
      console.error("❌ Bridge initialization failed:", error);
      this.initialized = false;
      return false;
    }
  }

  /**
   * Extract Pod URL from authenticated session
   */
  private async _extractPodUrl(): Promise<void> {
    if (!this.session?.info.isLoggedIn) {
      throw new Error("Cannot extract Pod URL: not authenticated");
    }

    const webId = this.session.info.webId;
    if (!webId) {
      throw new Error("WebID not available in session");
    }

    // Extract Pod URL from WebID (typically WebID = Pod URL + /profile/card#me)
    const webIdUrl = new URL(webId);
    this.podUrl = `${webIdUrl.protocol}//${webIdUrl.host}`;

    console.log("📦 Pod URL extracted:", this.podUrl);
  }

  /**
   * Lightweight check for bridge readiness
   *
   * Bootstrap polls this method waiting for initialization to complete.
   * This is synchronous and just checks flags - doesn't trigger initialization.
   *
   * @returns boolean - true if initialized and authenticated
   */
  public check(): boolean {
    return this.initialized && this.session?.info.isLoggedIn === true;
  }

  /**
   * Get authenticated user's WebID
   * @returns WebID string or null if not authenticated
   */
  public getWebId(): string | null {
    return this.session?.info?.webId || null;
  }

  /**
   * Logout user
   * Solid Client handles clearing its own localStorage
   */
  public async logout(): Promise<void> {
    if (this.session) {
      await this.session.logout();
      this.initialized = false;
      console.log("🚪 Logged out");
    }
  }

  // ==========================================================================
  // LocalStorage Operations (String-Based)
  // ==========================================================================

  /**
   * Save pre-stringified JSON to localStorage
   *
   * Architecture: Core handles JSON.stringify, bridge just stores bytes.
   * This ensures single serialization point and trivial verification.
   *
   * @param filename - Storage key (will be prefixed with mera_)
   * @param data - Pre-stringified JSON string
   * @returns BridgeResult indicating success/failure
   */
  public async localSave(
    filename: string,
    data: string,
  ): Promise<BridgeResult> {
    try {
      const key = `mera_${filename}`;
      localStorage.setItem(key, data); // Store string directly

      console.log("💾 Saved to localStorage:", filename);
      return { success: true, error: null };
    } catch (error) {
      console.error("❌ localStorage save failed:", error);

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        errorType: BridgeErrorType.Storage,
      };
    }
  }

  /**
   * Load raw JSON string from localStorage
   *
   * Returns the string directly - caller is responsible for parsing.
   * This ensures bridge doesn't need to understand data structure.
   *
   * @param filename - Storage key (mera_ prefix added automatically)
   * @returns BridgeResult<string> with raw JSON string or error
   */
  public async localLoad(filename: string): Promise<BridgeResult<string>> {
    try {
      const key = `mera_${filename}`;
      const item = localStorage.getItem(key);

      if (!item) {
        return {
          success: false,
          error: "File not found",
          errorType: BridgeErrorType.NotFound,
        };
      }

      // Return string directly - let caller parse if needed
      console.log("📥 Loaded from localStorage:", filename);
      return { success: true, data: item, error: null };
    } catch (error) {
      console.error("❌ localStorage load failed:", error);

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        errorType: BridgeErrorType.Storage,
      };
    }
  }

  /**
   * Delete file from localStorage
   *
   * @param filename - Storage key (mera_ prefix added automatically)
   * @returns BridgeResult indicating success/failure
   */
  public async localDelete(filename: string): Promise<BridgeResult> {
    try {
      const key = `mera_${filename}`;
      localStorage.removeItem(key);

      console.log("🗑️ Deleted from localStorage:", filename);
      return { success: true, error: null };
    } catch (error) {
      console.error("❌ localStorage delete failed:", error);

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        errorType: BridgeErrorType.Storage,
      };
    }
  }

  /**
   * List files in localStorage with mera_ prefix
   *
   * @param pattern - Optional glob pattern (e.g., "mera.*.*.*.lofp.*.json")
   * @returns BridgeResult<string[]> with matching filenames
   */
  public async localList(pattern?: string): Promise<BridgeResult<string[]>> {
    try {
      // Get all localStorage keys
      const allKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          allKeys.push(key);
        }
      }

      // Filter to mera_ prefixed keys
      const meraKeys = allKeys.filter((key) => key.startsWith("mera_"));

      // Strip prefix to get filenames
      const filenames = meraKeys.map((key) => key.replace("mera_", ""));

      // Apply pattern filter if provided
      const matched = pattern
        ? filenames.filter((filename) =>
            this._matchesPattern(filename, pattern),
          )
        : filenames;

      console.log("📋 Listed localStorage files:", matched.length);
      return { success: true, data: matched, error: null };
    } catch (error) {
      console.error("❌ localStorage list failed:", error);

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        errorType: BridgeErrorType.Storage,
      };
    }
  }

  // ==========================================================================
  // Solid Pod Operations (String-Based)
  // ==========================================================================

  /**
   * Save pre-stringified JSON to Solid Pod
   *
   * Architecture: Core handles JSON.stringify, bridge just stores bytes.
   * This ensures single serialization point and trivial verification.
   *
   * Container path: /mera-learn/ (not /mera/ which is old path)
   *
   * @param filename - File name within mera-learn container
   * @param data - Pre-stringified JSON string
   * @returns BridgeResult indicating success/failure
   */
  public async solidSave(
    filename: string,
    data: string,
  ): Promise<BridgeResult> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      if (!this.session?.info.isLoggedIn) {
        return {
          success: false,
          error: "Not authenticated",
          errorType: BridgeErrorType.Authentication,
        };
      }

      if (!this.podUrl) {
        return {
          success: false,
          error: "Pod URL not available",
          errorType: BridgeErrorType.Authentication,
        };
      }

      // Ensure mera-learn container exists
      const containerUrl = `${this.podUrl}/mera-learn/`;
      try {
        await createContainerAt(containerUrl, { fetch: this.session.fetch });
      } catch {
        // Container might already exist, that's fine
      }

      // Save file - data is already a JSON string, don't stringify again
      const fileUrl = `${containerUrl}${filename}`;
      const blob = new Blob([data], { type: "application/json" });

      await overwriteFile(fileUrl, blob, {
        contentType: "application/json",
        fetch: this.session.fetch,
      });

      console.log("💾 Saved to Pod:", filename);
      return { success: true, error: null };
    } catch (error) {
      const errorType = this._classifyError(error);
      console.error("❌ Pod save failed:", error);

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        errorType,
      };
    }
  }

  /**
   * Load raw JSON string from Solid Pod
   *
   * Returns the string directly - caller is responsible for parsing.
   * This ensures bridge doesn't need to understand data structure.
   *
   * Container path: /mera-learn/ (not /mera/ which is old path)
   *
   * @param filename - File name within mera-learn container
   * @returns BridgeResult<string> with raw JSON string or error
   */
  public async solidLoad(filename: string): Promise<BridgeResult<string>> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      if (!this.session?.info.isLoggedIn) {
        return {
          success: false,
          error: "Not authenticated",
          errorType: BridgeErrorType.Authentication,
        };
      }

      if (!this.podUrl) {
        return {
          success: false,
          error: "Pod URL not available",
          errorType: BridgeErrorType.Authentication,
        };
      }

      const fileUrl = `${this.podUrl}/mera-learn/${filename}`;
      const file = await getFile(fileUrl, { fetch: this.session.fetch });
      const text = await file.text();
      // Return string directly - let caller parse if needed

      console.log("📥 Loaded from Pod:", filename);
      return { success: true, data: text, error: null };
    } catch (error) {
      const errorType = this._classifyError(error);
      console.error("❌ Pod load failed:", error);

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        errorType,
      };
    }
  }

  /**
   * Delete file from Solid Pod
   *
   * Container path: /mera-learn/ (not /mera/ which is old path)
   *
   * @param filename - File name within mera-learn container
   * @returns BridgeResult indicating success/failure
   */
  public async solidDelete(filename: string): Promise<BridgeResult> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      if (!this.session?.info.isLoggedIn) {
        return {
          success: false,
          error: "Not authenticated",
          errorType: BridgeErrorType.Authentication,
        };
      }

      if (!this.podUrl) {
        return {
          success: false,
          error: "Pod URL not available",
          errorType: BridgeErrorType.Authentication,
        };
      }

      const fileUrl = `${this.podUrl}/mera-learn/${filename}`;
      await deleteFile(fileUrl, { fetch: this.session.fetch });

      console.log("🗑️ Deleted from Pod:", filename);
      return { success: true, error: null };
    } catch (error) {
      const errorType = this._classifyError(error);
      console.error("❌ Pod delete failed:", error);

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        errorType,
      };
    }
  }

  /**
   * List files in Solid Pod mera-learn container
   *
   * Container path: /mera-learn/ (not /mera/ which is old path)
   *
   * @param pattern - Optional glob pattern (e.g., "mera.*.*.*.sp.*.json")
   * @returns BridgeResult<string[]> with matching filenames
   */
  public async solidList(pattern?: string): Promise<BridgeResult<string[]>> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      if (!this.session?.info.isLoggedIn) {
        return {
          success: false,
          error: "Not authenticated",
          errorType: BridgeErrorType.Authentication,
        };
      }

      if (!this.podUrl) {
        return {
          success: false,
          error: "Pod URL not available",
          errorType: BridgeErrorType.Authentication,
        };
      }

      const containerUrl = `${this.podUrl}/mera-learn/`;
      const dataset = await getSolidDataset(containerUrl, {
        fetch: this.session.fetch,
      });
      const fileUrls = getContainedResourceUrlAll(dataset);

      // Extract filenames from full URLs
      const filenames = fileUrls
        .map((url) => {
          const parts = url.split("/");
          return parts[parts.length - 1];
        })
        .filter((filename) => {
          // Apply pattern filter if provided
          if (pattern) {
            return this._matchesPattern(filename, pattern);
          }
          return true;
        });

      console.log("📋 Listed Pod files:", filenames.length);
      return { success: true, data: filenames, error: null };
    } catch (error) {
      const errorType = this._classifyError(error);
      console.error("❌ Pod list failed:", error);

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        errorType,
      };
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Simple glob pattern matcher
   *
   * Supports * wildcard for any characters.
   * Example: "mera.*.json" matches "mera.123.json", "mera.backup.json"
   *
   * @param filename - Filename to test
   * @param pattern - Glob pattern with * wildcards
   * @returns boolean - true if filename matches pattern
   */
  private _matchesPattern(filename: string, pattern: string): boolean {
    // Convert glob pattern to regex
    // Escape special regex chars except *
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // Escape special chars
      .replace(/\*/g, ".*"); // Convert * to .*

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filename);
  }

  /**
   * Classify error into BridgeErrorType
   *
   * Examines error message to categorize the type of failure.
   * This helps callers implement appropriate retry/fallback logic.
   *
   * @param error - Error object or unknown value
   * @returns BridgeErrorType - Categorized error type
   */
  private _classifyError(error: unknown): BridgeErrorType {
    if (!(error instanceof Error)) {
      return BridgeErrorType.Network;
    }

    const message = error.message.toLowerCase();

    if (
      message.includes("401") ||
      message.includes("403") ||
      message.includes("unauthorized")
    ) {
      return BridgeErrorType.Authentication;
    }

    if (message.includes("404") || message.includes("not found")) {
      return BridgeErrorType.NotFound;
    }

    if (message.includes("quota") || message.includes("storage")) {
      return BridgeErrorType.Storage;
    }

    return BridgeErrorType.Network;
  }

  /**
   * Get debug information about bridge state
   *
   * Useful for troubleshooting initialization and authentication issues.
   *
   * @returns Object with bridge status fields
   */
  public getDebugInfo(): {
    initialized: boolean;
    isLoggedIn: boolean;
    webId: string | null;
    sessionId: string | null;
    podUrl: string | null;
  } {
    return {
      initialized: this.initialized,
      isLoggedIn: this.session?.info?.isLoggedIn || false,
      webId: this.session?.info?.webId || null,
      sessionId: this.session?.info?.sessionId || null,
      podUrl: this.podUrl,
    };
  }
}

// ============================================================================
// Module Initialization
// ============================================================================

// Create singleton instance and expose globally
const bridgeInstance = MeraBridge.getInstance();

// Expose to window for non-module scripts
(window as any).meraBridge = bridgeInstance;
(window as any).MeraBridge = MeraBridge;

// Start initialization immediately (fire-and-forget)
// Bootstrap will poll check() to wait for completion
bridgeInstance.initialize().catch((err) => {
  console.error("❌ Bridge initialization failed:", err);
});

// Export for ES modules
export default bridgeInstance;
