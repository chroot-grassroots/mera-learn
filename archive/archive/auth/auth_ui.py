"""
UI functions for Solid authentication flow.
Handles loading states, success messages, and error display.
"""
from js import document
import js


def show_loading():
    """Show loading state with professional UI."""
    status_div = document.getElementById('solid-status')
    if status_div:
        status_div.innerHTML = """
            <div class="flex items-center justify-center space-x-3">
                <svg class="animate-spin h-6 w-6 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span class="text-lg font-semibold text-gray-700">Connecting to Solid Pod...</span>
            </div>
            <p class="text-sm text-gray-600 mt-2">Please wait while we establish your connection</p>
        """


def show_success():
    """Show success state and redirect to learn page."""
    status_div = document.getElementById('solid-status')
    if status_div:
        status_div.innerHTML = """
            <div class="flex items-center justify-center space-x-3">
                <svg class="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span class="text-lg font-semibold text-green-600">Connection Successful!</span>
            </div>
            <p class="text-sm text-gray-600 mt-2">Redirecting to learning environment...</p>
        """
    
    # Use JavaScript to redirect instead of Python callback
    js.eval('''
        setTimeout(function() {
            window.location.href = "/learn/";
        }, 2000);
    ''')


def show_error(message):
    """Show error state with retry options."""
    status_div = document.getElementById('solid-status')
    error_section = document.getElementById('error-section')
    
    if status_div:
        status_div.classList.add('hidden')
    
    if error_section:
        error_section.classList.remove('hidden')
        error_msg_div = document.getElementById('error-message')
        if error_msg_div:
            error_msg_div.textContent = message