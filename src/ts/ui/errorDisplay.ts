// errorDisplay.ts - Modal overlay error handling system
// Displays errors as overlays on top of page content for maximum visibility

import { TimelineContainer } from './timelineContainer';

export type ErrorType = 'system' | 'network' | 'component' | 'authentication' | 'solid';
export type ActionType = 'check_connection' | 'refresh' | 'email_support' | 'retry' | 'skip_component' | 'retry_solid';

interface ErrorInfo {
    type: ErrorType;
    title: string;
    message: string;
    context: string;
}

export interface CriticalErrorOptions {
    title: string;
    message: string;
    technicalDetails?: string;
    errorCode?: string;
}

/**
 * Manages error display as modal overlays on top of page content.
 * 
 * Errors appear as centered modals with backdrop, ensuring user attention.
 * Queues multiple errors to show one at a time (no stacking).
 * 
 * Public API maintains backward compatibility - only internal implementation
 * changed from timeline slot to overlay approach.
 */
export class ErrorDisplay {
    protected activeErrors: Map<string, ErrorInfo> = new Map();
    protected errorQueue: string[] = []; // Queue of error IDs to display
    protected currentlyDisplayedError: string | null = null;

    /**
     * Constructor accepts optional timeline parameter for backward compatibility.
     * Parameter is ignored - overlay approach doesn't need timeline reference.
     */
    constructor(timelineContainer: TimelineContainer | null = null) {
        // timelineContainer parameter kept for backward compatibility but unused
        this.ensureOverlayExists();
    }

    /**
     * Ensure error overlay container exists in DOM.
     * Creates it if missing - idempotent, safe to call multiple times.
     */
    private ensureOverlayExists(): void {
        if (!document.getElementById('error-overlay')) {
            document.body.insertAdjacentHTML('beforeend', `
                <div id="error-overlay" class="hidden fixed inset-0 z-50">
                    <div class="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"></div>
                    <div class="relative min-h-screen flex items-center justify-center p-4">
                        <div id="error-container" class="w-full max-w-md">
                            <!-- Error cards render here -->
                        </div>
                    </div>
                </div>
            `);
        }
    }

    /**
     * Display a system error (YAML loading, TypeScript issues, etc.)
     */
    showSystemError(errorId: string = 'system', context: string = '', details: string = ''): void {
        this._showError({
            errorId,
            errorType: 'system',
            title: 'System Error',
            message: "We're having trouble loading lesson content.",
            context,
            details,
            actions: ['check_connection', 'refresh', 'email_support']
        });
    }

    /**
     * Display a network connectivity error
     */
    showNetworkError(errorId: string = 'network', context: string = ''): void {
        this._showError({
            errorId,
            errorType: 'network',
            title: 'Connection Issue',
            message: 'Unable to reach the server.',
            context,
            actions: ['check_connection', 'retry', 'email_support']
        });
    }

    /**
     * Display an error specific to a component
     */
    showComponentError(componentId: string, errorMessage: string): void {
        this._showError({
            errorId: `component-${componentId}`,
            errorType: 'component',
            title: 'Component Error',
            message: `Component ${componentId} encountered an issue.`,
            context: errorMessage,
            actions: ['refresh', 'skip_component', 'email_support']
        });
    }

    /**
     * Display an authentication error
     */
    showAuthError(errorId: string = 'auth', context: string = ''): void {
        this._showError({
            errorId,
            errorType: 'authentication',
            title: 'Authentication Required',
            message: 'Your session has expired or authentication failed.',
            context,
            actions: ['retry', 'refresh']
        });
    }

    /**
     * Display a Solid Pod specific error
     */
    showSolidError(errorId: string = 'solid', context: string = '', details: string = ''): void {
        this._showError({
            errorId,
            errorType: 'solid',
            title: 'Solid Pod Error',
            message: 'Unable to access your Solid Pod.',
            context,
            details,
            actions: ['retry_solid', 'check_connection', 'email_support']
        });
    }

    /**
     * Remove a specific error and show next in queue if any
     */
    clearError(errorId: string): void {
        if (this.activeErrors.has(errorId)) {
            this.activeErrors.delete(errorId);
            console.log(`🧹 Cleared error: ${errorId}`);

            // If this was the currently displayed error, show next in queue
            if (this.currentlyDisplayedError === errorId) {
                this.currentlyDisplayedError = null;
                this._hideOverlay();
                this._showNextInQueue();
            } else {
                // Remove from queue if it was waiting
                this.errorQueue = this.errorQueue.filter(id => id !== errorId);
            }
        }
    }

    /**
     * Clear all active errors and hide overlay
     */
    clearAllErrors(): void {
        const errorIds = Array.from(this.activeErrors.keys());
        this.activeErrors.clear();
        this.errorQueue = [];
        this.currentlyDisplayedError = null;
        this._hideOverlay();
        console.log('🧹 All errors cleared');
    }

    /**
     * Internal method to display an error as modal overlay.
     * Queues errors if one is already being displayed.
     */
    protected _showError(params: {
        errorId: string;
        errorType: ErrorType;
        title: string;
        message: string;
        context?: string;
        details?: string;
        actions?: ActionType[];
    }): void {
        const { errorId, errorType, title, message, context = '', details = '', actions = ['refresh', 'email_support'] } = params;

        // Store error info
        this.activeErrors.set(errorId, {
            type: errorType,
            title,
            message,
            context
        });

        // If no error currently displayed, show this one immediately
        if (this.currentlyDisplayedError === null) {
            this._displayError(errorId, title, message, context, details, actions);
        } else {
            // Queue it for later
            if (!this.errorQueue.includes(errorId)) {
                this.errorQueue.push(errorId);
                console.log(`⏳ Queued error: ${errorId} (${this.errorQueue.length} in queue)`);
            }
        }
    }

    /**
     * Actually display an error in the overlay
     */
    protected _displayError(
        errorId: string,
        title: string,
        message: string,
        context: string,
        details: string,
        actions: ActionType[]
    ): void {
        this.currentlyDisplayedError = errorId;

        const overlay = document.getElementById('error-overlay');
        const container = document.getElementById('error-container');
        
        if (!overlay || !container) {
            console.error('❌ Error overlay not found');
            return;
        }

        // Build error modal HTML
        const errorHtml = this._buildErrorModal(errorId, title, message, context, details, actions);
        
        // Display in overlay
        container.innerHTML = errorHtml;
        overlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Prevent background scroll

        console.log(`❌ Displayed error: ${errorId}`);
    }

    /**
     * Show next error in queue, if any
     */
    protected _showNextInQueue(): void {
        if (this.errorQueue.length > 0) {
            const nextErrorId = this.errorQueue.shift()!;
            const errorInfo = this.activeErrors.get(nextErrorId);
            
            if (errorInfo) {
                // Reconstruct display parameters from stored info
                this._displayError(
                    nextErrorId,
                    errorInfo.title,
                    errorInfo.message,
                    errorInfo.context,
                    '', // details not stored, would need to expand ErrorInfo if needed
                    ['refresh', 'email_support'] // default actions
                );
            }
        }
    }

    /**
     * Hide the error overlay and re-enable scroll
     */
    protected _hideOverlay(): void {
        const overlay = document.getElementById('error-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
            document.body.style.overflow = ''; // Re-enable scroll
        }
    }

    /**
     * Build the HTML for an error modal
     */
    protected _buildErrorModal(
        errorId: string,
        title: string,
        message: string,
        context: string,
        details: string,
        actions: ActionType[]
    ): string {
        const contextHtml = context 
            ? `<p class="text-sm text-red-700 mt-2"><strong>Context:</strong> ${this._escapeHtml(context)}</p>` 
            : '';
        
        const detailsHtml = details 
            ? `<details class="mt-3 text-xs text-gray-600">
                 <summary class="cursor-pointer hover:text-gray-900">Technical Details</summary>
                 <pre class="mt-2 p-2 bg-gray-100 rounded overflow-x-auto">${this._escapeHtml(details)}</pre>
               </details>` 
            : '';
        
        const actionsHtml = this._buildActionButtons(errorId, actions);

        return `
            <div id="error-modal-${errorId}" 
                 class="bg-white rounded-lg shadow-2xl p-6 animate-fadeIn">
                <div class="flex items-start">
                    <div class="flex-shrink-0">
                        <svg class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z">
                            </path>
                        </svg>
                    </div>
                    <div class="ml-3 flex-1">
                        <h3 class="text-lg font-semibold text-gray-900">${this._escapeHtml(title)}</h3>
                        <p class="text-sm text-gray-700 mt-2">${this._escapeHtml(message)}</p>
                        ${contextHtml}
                        ${detailsHtml}
                        <div class="mt-4 flex flex-wrap gap-2">
                            ${actionsHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Build action buttons based on the provided actions list
     */
    protected _buildActionButtons(errorId: string, actions: ActionType[]): string {
        const buttons: string[] = [];

        for (const action of actions) {
            switch (action) {
                case 'refresh':
                    buttons.push(`
                        <button onclick="location.reload()" 
                                class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                            Refresh Page
                        </button>
                    `);
                    break;
                case 'retry':
                    buttons.push(`
                        <button onclick="location.reload()" 
                                class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                            Retry
                        </button>
                    `);
                    break;
                case 'check_connection':
                    buttons.push(`
                        <button onclick="window.open('https://www.google.com', '_blank')" 
                                class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors">
                            Check Connection
                        </button>
                    `);
                    break;
                case 'email_support':
                    buttons.push(`
                        <button onclick="window.location.href='mailto:support@example.com?subject=Mera Error: ${errorId}'" 
                                class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors">
                            Contact Support
                        </button>
                    `);
                    break;
                case 'skip_component':
                    buttons.push(`
                        <button onclick="window.errorDisplay?.clearError('${errorId}')" 
                                class="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors">
                            Skip Component
                        </button>
                    `);
                    break;
                case 'retry_solid':
                    buttons.push(`
                        <button onclick="location.href='/solid'" 
                                class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                            Retry Connection
                        </button>
                    `);
                    break;
            }
        }

        // Always add dismiss button
        buttons.push(`
            <button onclick="window.errorDisplay?.clearError('${errorId}')" 
                    class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors">
                Dismiss
            </button>
        `);

        return buttons.join('');
    }

    /**
     * Escape HTML to prevent XSS
     */
    protected _escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

/**
 * Display a critical blocking error (bootstrap failures, etc.)
 * Creates a full-page error screen that can't be dismissed.
 */
export function showCriticalError(options: CriticalErrorOptions): void {
    const { title, message, technicalDetails, errorCode } = options;

    // Remove any existing content
    document.body.innerHTML = '';

    const detailsHtml = technicalDetails
        ? `<details class="mt-4 text-sm text-gray-300">
             <summary class="cursor-pointer hover:text-white">Technical Details</summary>
             <pre class="mt-2 p-3 bg-gray-900 rounded overflow-x-auto text-xs">${technicalDetails}</pre>
           </details>`
        : '';

    const errorCodeHtml = errorCode
        ? `<p class="text-sm text-gray-400 mt-2">Error Code: ${errorCode}</p>`
        : '';

    document.body.innerHTML = `
        <div class="min-h-screen bg-gray-800 flex items-center justify-center p-4">
            <div class="max-w-md w-full bg-gray-900 rounded-lg shadow-2xl p-6 border border-red-500">
                <div class="flex items-center mb-4">
                    <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z">
                        </path>
                    </svg>
                    <h1 class="ml-3 text-2xl font-bold text-white">${title}</h1>
                </div>
                <p class="text-gray-300 mb-4">${message}</p>
                ${errorCodeHtml}
                ${detailsHtml}
                <div class="mt-6 flex gap-3">
                    <button onclick="location.reload()" 
                            class="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors">
                        Reload Application
                    </button>
                    <button onclick="location.href='/'" 
                            class="flex-1 px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors">
                        Go Home
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Specialized error display for Solid connection issues.
 * Extends base ErrorDisplay with Solid-specific error handling.
 */
export class SolidConnectionErrorDisplay extends ErrorDisplay {
    /**
     * Display Solid Pod connection error
     */
    showConnectionError(context: string = ''): void {
        this.showSolidError('solid-connection', context);
    }

    /**
     * Display Solid authentication error
     */
    showAuthenticationError(context: string = ''): void {
        this.showAuthError('solid-auth', context);
    }

    /**
     * Display Solid permission error
     */
    showPermissionError(context: string = ''): void {
        this._showError({
            errorId: 'solid-permission',
            errorType: 'solid',
            title: 'Permission Denied',
            message: 'The application does not have permission to access your Solid Pod.',
            context,
            actions: ['retry_solid', 'email_support']
        });
    }
}