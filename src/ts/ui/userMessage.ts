/**
 * @fileoverview User message system for non-critical feedback
 * @module ui/userMessage
 * 
 * Provides blocking message dialogs for initialization flow and success notifications.
 * Used for progress recovery decisions, data loss warnings, and success confirmations.
 */

/**
 * Display a message to the user with one or two action buttons.
 * 
 * Blocks execution until user clicks a button. Creates full-page overlay
 * with centered message card. Removes itself from DOM after user action.
 * 
 * @param title - Message title/heading
 * @param message - Main message body (supports newlines)
 * @param primaryLabel - Label for primary action button
 * @param secondaryLabel - Optional label for secondary action button
 * @returns Promise resolving to 'primary' or 'secondary' based on user choice
 * 
 * @example
 * const choice = await showUserMessage(
 *   "Data Recovery Failed",
 *   "We found evidence of previous saves but couldn't recover any data.",
 *   "Start Fresh",
 *   "Stop Mera"
 * );
 * if (choice === 'primary') { startFresh(); }
 */
export async function showUserMessage(
  title: string,
  message: string,
  primaryLabel: string,
  secondaryLabel?: string
): Promise<'primary' | 'secondary'> {
  return new Promise((resolve) => {
    // Create overlay container
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50';
    overlay.id = 'user-message-overlay';
    
    // Create message card
    const card = document.createElement('div');
    card.className = 'bg-white rounded-lg shadow-2xl p-6 max-w-md mx-4 space-y-4';
    
    // Title
    const titleEl = document.createElement('h2');
    titleEl.className = 'text-xl font-semibold text-gray-900';
    titleEl.textContent = title;
    
    // Message (preserve line breaks)
    const messageEl = document.createElement('p');
    messageEl.className = 'text-gray-700 whitespace-pre-line';
    messageEl.textContent = message;
    
    // Button container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'flex gap-3 justify-end pt-2';
    
    // Primary button
    const primaryBtn = document.createElement('button');
    primaryBtn.className = 'px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded transition-colors';
    primaryBtn.textContent = primaryLabel;
    primaryBtn.onclick = () => {
      cleanup();
      resolve('primary');
    };
    
    // Secondary button (if provided)
    if (secondaryLabel) {
      const secondaryBtn = document.createElement('button');
      secondaryBtn.className = 'px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded transition-colors';
      secondaryBtn.textContent = secondaryLabel;
      secondaryBtn.onclick = () => {
        cleanup();
        resolve('secondary');
      };
      buttonContainer.appendChild(secondaryBtn);
    }
    
    buttonContainer.appendChild(primaryBtn);
    
    // Assemble card
    card.appendChild(titleEl);
    card.appendChild(messageEl);
    card.appendChild(buttonContainer);
    overlay.appendChild(card);
    
    // Add to DOM
    document.body.appendChild(overlay);
    
    // Focus primary button for keyboard accessibility
    primaryBtn.focus();
    
    // Cleanup function
    function cleanup() {
      overlay.remove();
    }
  });
}

/**
 * Display a brief success message that auto-dismisses.
 * 
 * Shows centered message overlay that automatically disappears after
 * specified duration. Non-blocking - returns immediately after display.
 * 
 * @param message - Success message to display
 * @param durationMs - How long to show message before auto-dismiss (default: 2000ms)
 * @returns Promise that resolves after message is dismissed
 * 
 * @example
 * await flashSuccess("Progress loaded ✓");
 * // Continues after 2 seconds
 */
export async function flashSuccess(
  message: string,
  durationMs: number = 2000
): Promise<void> {
  return new Promise((resolve) => {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50';
    overlay.id = 'success-flash-overlay';
    
    // Create success card
    const card = document.createElement('div');
    card.className = 'bg-white rounded-lg shadow-2xl p-6 max-w-sm mx-4';
    
    // Message
    const messageEl = document.createElement('p');
    messageEl.className = 'text-lg font-medium text-green-700 text-center';
    messageEl.textContent = message;
    
    card.appendChild(messageEl);
    overlay.appendChild(card);
    
    // Add to DOM
    document.body.appendChild(overlay);
    
    // Auto-dismiss after duration
    setTimeout(() => {
      overlay.remove();
      resolve();
    }, durationMs);
  });
}