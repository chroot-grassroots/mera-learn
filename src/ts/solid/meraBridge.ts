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
 * - Trust Solid Client's built-in session persistence
 * - Breaking change isolation from Inrupt library updates
 */

import {
  overwriteFile,
  getFile,
  deleteFile,
  getSolidDataset,
  getContainedResourceUrlAll,
  createContainerAt,
} from '@inrupt/solid-client';
import {
  getDefaultSession,
  Session,
} from '@inrupt/solid-client-authn-browser';

// ============================================================================
// Type Definitions
// ============================================================================

export enum BridgeErrorType {
  Authentication = 'authentication',
  Network = 'network',
  NotFound = 'not_found',
  Storage = 'storage',
  Validation = 'validation',
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
   * Trusts Solid Client's built-in persistence:
   * - getDefaultSession() auto-restores from localStorage
   * - handleIncomingRedirect() handles both OAuth callbacks AND restoration
   * - No manual timestamp tracking needed
   */
  public async initialize(): Promise<boolean> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._doInitialize();
    return this.initializationPromise;
  }

  private async _doInitialize(): Promise<boolean> {
    console.log('🌉 Mera Bridge initializing...');

    try {
      // Step 1: Get session
      this.session = getDefaultSession();
      console.log('📍 Step 1: Initial session check:', {
        sessionId: this.session.info.sessionId,
        isLoggedIn: this.session.info.isLoggedIn,
        webId: this.session.info.webId,
      });

      // Step 2: Call handleIncomingRedirect with restorePreviousSession option
      // This handles BOTH:
      // - OAuth callbacks (when URL has ?code=...)
      // - Session restoration from localStorage (when restorePreviousSession: true)
      console.log('📍 Step 2: Calling handleIncomingRedirect...');
      await this.session.handleIncomingRedirect({
        url: window.location.href,
        restorePreviousSession: true,  // CRITICAL: tells Solid to check localStorage
      });
      console.log('📍 Step 3: handleIncomingRedirect completed');

      // Step 3: Get fresh session after handleIncomingRedirect
      this.session = getDefaultSession();
      console.log('📍 Step 4: Session after handleIncomingRedirect:', {
        sessionId: this.session.info.sessionId,
        isLoggedIn: this.session.info.isLoggedIn,
        webId: this.session.info.webId,
      });

      // Step 4: Check if logged in
      if (this.session.info.isLoggedIn) {
        console.log('✅ User authenticated');
        await this._extractPodUrl();
        this.initialized = true;
        return true;
      } else {
        console.log('⚠️ User not authenticated');
        this.initialized = false;
        return false;
      }
    } catch (error) {
      console.error('❌ Bridge initialization failed:', error);
      this.initialized = false;
      return false;
    }
  }

  /**
   * Extract Pod URL from authenticated session
   */
  private async _extractPodUrl(): Promise<void> {
    if (!this.session?.info.isLoggedIn) {
      throw new Error('Cannot extract Pod URL - not authenticated');
    }

    const webId = this.session.info.webId;
    if (!webId) {
      throw new Error('No WebID in authenticated session');
    }

    try {
      // Extract Pod root from WebID
      // Example: https://alice.solidcommunity.net/profile/card#me
      //       -> https://alice.solidcommunity.net/
      const url = new URL(webId);
      this.podUrl = `${url.protocol}//${url.host}/`;
      console.log('📦 Pod URL extracted:', this.podUrl);
    } catch (error) {
      throw new Error(`Failed to parse WebID URL: ${webId}`);
    }
  }

  /**
   * Check if bridge is initialized and user is logged in
   * 
   * Lightweight check - returns cached status without triggering initialization.
   * Bootstrap polls this method waiting for initialization to complete.
   */
  public check(): boolean {
    return this.initialized && this.session?.info.isLoggedIn === true;
  }

  /**
   * Get authenticated user's WebID
   * Returns null if not authenticated
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
      console.log('🚪 Logged out');
    }
  }

  // ==========================================================================
  // Pod Storage Operations
  // ==========================================================================

  /**
   * Save JSON data to Solid Pod
   */
  public async solidSave(filename: string, data: any): Promise<BridgeResult<string>> {
    if (!this.podUrl) {
      return {
        success: false,
        error: 'Not authenticated - no Pod URL available',
        errorType: BridgeErrorType.Authentication,
      };
    }

    try {
      const fileUrl = `${this.podUrl}mera/${filename}`;
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });

      await overwriteFile(fileUrl, blob, {
        contentType: 'application/json',
        fetch: this.session!.fetch,
      });

      return {
        success: true,
        data: fileUrl,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during save',
        errorType: this._classifyError(error),
      };
    }
  }

  /**
   * Load JSON data from Solid Pod
   */
  public async solidLoad(filename: string): Promise<BridgeResult<any>> {
    if (!this.podUrl) {
      return {
        success: false,
        error: 'Not authenticated - no Pod URL available',
        errorType: BridgeErrorType.Authentication,
      };
    }

    try {
      const fileUrl = `${this.podUrl}mera/${filename}`;
      const file = await getFile(fileUrl, {
        fetch: this.session!.fetch,
      });

      const text = await file.text();
      const data = JSON.parse(text);

      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during load',
        errorType: this._classifyError(error),
      };
    }
  }

  /**
   * Delete file from Solid Pod
   */
  public async solidDelete(filename: string): Promise<BridgeResult<void>> {
    if (!this.podUrl) {
      return {
        success: false,
        error: 'Not authenticated - no Pod URL available',
        errorType: BridgeErrorType.Authentication,
      };
    }

    try {
      const fileUrl = `${this.podUrl}mera/${filename}`;
      await deleteFile(fileUrl, {
        fetch: this.session!.fetch,
      });

      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during delete',
        errorType: this._classifyError(error),
      };
    }
  }

  /**
   * List files in Solid Pod matching pattern
   * 
   * Pattern uses basic wildcards:
   * - * matches any characters
   * - Example: "mera.*.json" matches "mera.123.json", "mera.backup.json"
   */
  public async solidList(pattern: string): Promise<BridgeResult<string[]>> {
    if (!this.podUrl) {
      return {
        success: false,
        error: 'Not authenticated - no Pod URL available',
        errorType: BridgeErrorType.Authentication,
      };
    }

    try {
      const containerUrl = `${this.podUrl}mera/`;
      
      // Ensure container exists
      try {
        await createContainerAt(containerUrl, {
          fetch: this.session!.fetch,
        });
      } catch (error) {
        // Container might already exist - that's fine
      }

      const dataset = await getSolidDataset(containerUrl, {
        fetch: this.session!.fetch,
      });

      const allUrls = getContainedResourceUrlAll(dataset);
      const filenames = allUrls
        .map((url) => url.split('/').pop())
        .filter((filename): filename is string => !!filename);

      const matched = filenames.filter((filename) =>
        this._matchPattern(filename, pattern)
      );

      return {
        success: true,
        data: matched,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during list',
        errorType: this._classifyError(error),
      };
    }
  }

  // ==========================================================================
  // LocalStorage Operations
  // ==========================================================================

  /**
   * Save JSON data to localStorage
   */
  public async localSave(filename: string, data: any): Promise<BridgeResult<string>> {
    try {
      const key = `mera:${filename}`;
      const json = JSON.stringify(data);
      localStorage.setItem(key, json);

      return {
        success: true,
        data: key,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during local save',
        errorType: BridgeErrorType.Storage,
      };
    }
  }

  /**
   * Load JSON data from localStorage
   */
  public async localLoad(filename: string): Promise<BridgeResult<any>> {
    try {
      const key = `mera:${filename}`;
      const json = localStorage.getItem(key);

      if (json === null) {
        return {
          success: false,
          error: `File not found: ${filename}`,
          errorType: BridgeErrorType.NotFound,
        };
      }

      const data = JSON.parse(json);

      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during local load',
        errorType: BridgeErrorType.Storage,
      };
    }
  }

  /**
   * Delete file from localStorage
   */
  public async localDelete(filename: string): Promise<BridgeResult<void>> {
    try {
      const key = `mera:${filename}`;
      localStorage.removeItem(key);

      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during local delete',
        errorType: BridgeErrorType.Storage,
      };
    }
  }

  /**
   * List files in localStorage matching pattern
   */
  public async localList(pattern: string): Promise<BridgeResult<string[]>> {
    try {
      const allKeys = Object.keys(localStorage);
      const meraKeys = allKeys.filter((key) => key.startsWith('mera:'));
      const filenames = meraKeys.map((key) => key.replace('mera:', ''));

      const matched = filenames.filter((filename) =>
        this._matchPattern(filename, pattern)
      );

      return {
        success: true,
        data: matched,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during local list',
        errorType: BridgeErrorType.Storage,
      };
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Match filename against pattern with wildcards
   * - * matches any characters
   */
  private _matchPattern(filename: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape regex special chars except *
      .replace(/\*/g, '.*');                    // Convert * to .*
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filename);
  }

  /**
   * Classify error into BridgeErrorType
   */
  private _classifyError(error: unknown): BridgeErrorType {
    if (!(error instanceof Error)) {
      return BridgeErrorType.Network;
    }

    const message = error.message.toLowerCase();

    if (message.includes('401') || message.includes('403') || message.includes('unauthorized')) {
      return BridgeErrorType.Authentication;
    }

    if (message.includes('404') || message.includes('not found')) {
      return BridgeErrorType.NotFound;
    }

    if (message.includes('quota') || message.includes('storage')) {
      return BridgeErrorType.Storage;
    }

    return BridgeErrorType.Network;
  }

  /**
   * Get debug information about bridge state
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
  console.error('❌ Bridge initialization failed:', err);
});

// Export for ES modules
export default bridgeInstance;