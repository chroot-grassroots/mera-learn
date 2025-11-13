// errorDisplay.ts - TypeScript version of error_display.py
// Unified error handling UI that integrates with TimelineContainer

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
 * Manages error display UI that appears in the timeline container's error slot
 */
export class ErrorDisplay {
    protected timelineContainer: TimelineContainer | null;
    protected activeErrors: Map<string, ErrorInfo> = new Map();

    constructor(timelineContainer: TimelineContainer | null = null) {
        this.timelineContainer = timelineContainer;
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
     * Remove a specific error
     */
    clearError(errorId: string): void {
        if (this.activeErrors.has(errorId)) {
            const errorElement = document.getElementById(`error-${errorId}`);
            if (errorElement) {
                errorElement.remove();
            }
            this.activeErrors.delete(errorId);
            console.log(`🧹 Cleared error: ${errorId}`);
        }

        // Hide error slot if no errors remain
        if (this.activeErrors.size === 0) {
            this._hideErrorSlot();
        }
    }

    /**
     * Clear all active errors
     */
    clearAllErrors(): void {
        const errorIds = Array.from(this.activeErrors.keys());
        for (const errorId of errorIds) {
            this.clearError(errorId);
        }
        console.log('🧹 All errors cleared');
    }

    /**
     * Internal method to display an error in the timeline's error slot
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

        // Get error slot from timeline container
        const errorSlot = this._getErrorSlot();
        if (!errorSlot) {
            // Fallback: create floating error if no timeline container
            this._createFloatingError(errorId, title, message, actions);
            return;
        }

        // Build error HTML
        const errorHtml = this._buildErrorHtml(errorId, title, message, context, details, actions);

        // Show error slot and add this error
        errorSlot.className = errorSlot.className.replace('hidden', 'block');
        errorSlot.insertAdjacentHTML('beforeend', errorHtml);

        console.log(`❌ Displayed error: ${errorId} (${errorType})`);
    }

    /**
     * Build the HTML for an error display
     */
    protected _buildErrorHtml(errorId: string, title: string, message: string, context: string, details: string, actions: ActionType[]): string {
        const contextHtml = context ? `<p class="text-sm text-red-600 mt-1"><strong>Context:</strong> ${context}</p>` : '';
        const detailsHtml = details ? `<details class="mt-2 text-xs text-red-500"><summary>Technical Details</summary><pre>${details}</pre></details>` : '';
        const actionsHtml = this._buildActionButtons(errorId, actions);

        return `
            <div id="error-${errorId}" class="error-item bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <div class="flex items-start">
                    <div class="flex-shrink-0">
                        <svg class="w-5 h-5 text-red-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                    </div>
                    <div class="ml-3 flex-1">
                        <h3 class="text-sm font-medium text-red-800">${title}</h3>
                        <p class="text-sm text-red-700 mt-1">${message}</p>
                        ${contextHtml}
                        ${detailsHtml}
                        <div class="mt-3 flex space-x-2">
                            ${actionsHtml}
                            <button onclick="window.errorDisplay?.clearError('${errorId}')" 
                                    class="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700">
                                Dismiss
                            </button>
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
                                class="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700">
                            Refresh Page
                        </button>
                    `);
                    break;
                case 'retry':
                    buttons.push(`
                        <button onclick="window.errorDisplay?._retryAction('${errorId}')" 
                                class="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">
                            Retry
                        </button>
                    `);
                    break;
                case 'email_support':
                    buttons.push(`
                        <button onclick="window.open('mailto:support@meralearn.org?subject=Mera%20Learning%20Error')" 
                                class="text-xs bg-gray-600 text-white px-2 py-1 rounded hover:bg-gray-700">
                            Email Support
                        </button>
                    `);
                    break;
                case 'skip_component':
                    buttons.push(`
                        <button onclick="window.errorDisplay?._skipComponent('${errorId}')" 
                                class="text-xs bg-yellow-600 text-white px-2 py-1 rounded hover:bg-yellow-700">
                            Skip Component
                        </button>
                    `);
                    break;
            }
        }

        return buttons.join(' ');
    }

    /**
     * Get the error slot from the timeline container
     */
    protected _getErrorSlot(): HTMLElement | null {
        if (this.timelineContainer) {
            return this.timelineContainer.getErrorSlot();
        } else {
            // Try to find error slot by ID if no timeline container reference
            return document.getElementById('lesson-container-error-slot');
        }
    }

    /**
     * Hide the error slot when no errors are active
     */
    protected _hideErrorSlot(): void {
        const errorSlot = this._getErrorSlot();
        if (errorSlot) {
            errorSlot.className = errorSlot.className.replace('block', 'hidden');
            errorSlot.innerHTML = '';
            console.log('👻 Error slot hidden');
        }
    }

    /**
     * Fallback: create a floating error if no timeline container is available
     */
    protected _createFloatingError(errorId: string, title: string, message: string, actions: ActionType[]): void {
        let floatingContainer = document.getElementById('floating-errors');
        if (!floatingContainer) {
            floatingContainer = document.createElement('div');
            floatingContainer.id = 'floating-errors';
            floatingContainer.className = 'fixed top-4 right-4 z-50 max-w-md';
            document.body.appendChild(floatingContainer);
        }

        const errorHtml = `
            <div id="error-${errorId}" class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-4 border">
                <div class="text-center">
                    <div class="flex items-center justify-center space-x-2 text-red-600 mb-2">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <span class="font-semibold">${title}</span>
                    </div>
                    <p class="text-red-500 text-sm mb-4">${message}</p>
                    <div class="flex justify-center space-x-2">
                        ${this._buildActionButtons(errorId, actions)}
                        <button onclick="window.errorDisplay?.clearError('${errorId}')" 
                                class="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors">
                            Dismiss
                        </button>
                    </div>
                </div>
            </div>
        `;
        floatingContainer.insertAdjacentHTML('beforeend', errorHtml);
        console.log(`💫 Created floating error: ${errorId}`);
    }

    /**
     * Handle retry action - to be implemented by core or overridden
     */
    _retryAction(errorId: string): void {
        console.log(`🔄 Retry requested for error: ${errorId}`);
        // Core would implement the actual retry logic
        // For now, just clear the error
        this.clearError(errorId);
    }

    /**
     * Handle skip component action - to be implemented by core or overridden
     */
    _skipComponent(errorId: string): void {
        console.log(`⏭️ Skip component requested for error: ${errorId}`);
        // Core would implement the actual skip logic
        // For now, just clear the error
        this.clearError(errorId);
    }
}

/**
 * Extended ErrorDisplay with Solid-specific error handling
 */
export class SolidConnectionErrorDisplay extends ErrorDisplay {
    
    /**
     * Display Solid Pod connection failure with retry option
     */
    showSolidConnectionError(): void {
        this._showError({
            errorId: 'solid-connection',
            errorType: 'solid',
            title: 'Solid Pod Connection Failed',
            message: 'Solid pod connection failed. Please try connecting to Solid pod again. If issues persist, please email support@meralearn.org.',
            context: 'Authentication with your Solid Pod provider was unsuccessful',
            actions: ['retry_solid', 'email_support']
        });
    }

    /**
     * Override to add Solid-specific actions
     */
    protected _buildActionButtons(errorId: string, actions: ActionType[]): string {
        const buttons: string[] = [];

        for (const action of actions) {
            if (action === 'retry_solid') {
                // Use the connect page URL from your Django project
                buttons.push(`
                    <button onclick="window.location.href = window.CONNECT_URL || '/pages/connect/'" 
                            class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors">
                        Try Connecting Again
                    </button>
                `);
            } else if (action === 'email_support') {
                buttons.push(`
                    <button onclick="window.open('mailto:support@meralearn.org?subject=Solid%20Pod%20Connection%20Issue')" 
                            class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors">
                        Email Support
                    </button>
                `);
            } else {
                // Handle any other actions with parent class method
                const parentButtons = super._buildActionButtons(errorId, [action]);
                if (parentButtons) {
                    buttons.push(parentButtons);
                }
            }
        }

        return buttons.join(' ');
    }
}

// Global instance - will be initialized by bootstrap
let globalErrorDisplay: ErrorDisplay | null = null;

/**
 * Set the global error display instance
 */
export function setGlobalErrorDisplay(errorDisplay: ErrorDisplay): void {
    globalErrorDisplay = errorDisplay;
    // Make available globally for onclick handlers
    (window as any).errorDisplay = errorDisplay;
}

/**
 * Get the global error display instance
 */
export function getGlobalErrorDisplay(): ErrorDisplay | null {
    return globalErrorDisplay;
}

// Make the classes available globally for debugging
declare global {
    interface Window {
        ErrorDisplay: typeof ErrorDisplay;
        SolidConnectionErrorDisplay: typeof SolidConnectionErrorDisplay;
        errorDisplay?: ErrorDisplay;
    }
}

window.ErrorDisplay = ErrorDisplay;
window.SolidConnectionErrorDisplay = SolidConnectionErrorDisplay;

export function showCriticalError(options: CriticalErrorOptions): void {
  console.error(`🚨 ${options.title}:`, options.message);
  if (options.technicalDetails) {
    console.error('Technical details:', options.technicalDetails);
  }
  
  const shouldReload = confirm(
    `${options.title}\n\n${options.message}\n\nReload page now?`
  );
  
  if (shouldReload) {
    window.location.reload();
  }
}