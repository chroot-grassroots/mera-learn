"""
Error Display - Unified error handling UI that integrates with TimelineContainer
Appears at the top of the timeline when errors occur
"""

from pyscript import document # type: ignore

class ErrorDisplay:
    """Manages error display UI that appears in the timeline container's error slot"""
    
    def __init__(self, timeline_container=None):
        self.timeline_container = timeline_container
        self.active_errors = {}  # Track multiple errors by ID
    
    def show_system_error(self, error_id="system", context="", details=""):
        """Display a system error (YAML loading, PyScript issues, etc.)"""
        self._show_error(
            error_id=error_id,
            error_type="system",
            title="System Error", 
            message="We're having trouble loading lesson content.",
            context=context,
            details=details,
            actions=["check_connection", "refresh", "email_support"]
        )
    
    def show_network_error(self, error_id="network", context=""):
        """Display a network connectivity error"""
        self._show_error(
            error_id=error_id,
            error_type="network",
            title="Connection Issue",
            message="Unable to reach the server.",
            context=context,
            actions=["check_connection", "retry", "email_support"]
        )
    
    def show_component_error(self, component_id, error_message):
        """Display an error specific to a component"""
        self._show_error(
            error_id=f"component-{component_id}",
            error_type="component",
            title="Component Error",
            message=f"Component {component_id} encountered an issue.",
            context=error_message,
            actions=["refresh", "skip_component", "email_support"]
        )
    
    def clear_error(self, error_id):
        """Remove a specific error"""
        if error_id in self.active_errors:
            error_element = document.getElementById(f"error-{error_id}")
            if error_element:
                error_element.remove()
            del self.active_errors[error_id]
        
        # Hide error slot if no errors remain
        if not self.active_errors:
            self._hide_error_slot()
    
    def clear_all_errors(self):
        """Clear all active errors"""
        for error_id in list(self.active_errors.keys()):
            self.clear_error(error_id)
    
    def _show_error(self, error_id, error_type, title, message, context="", details="", actions=None):
        """Internal method to display an error in the timeline's error slot"""
        if actions is None:
            actions = ["refresh", "email_support"]
        
        # Store error info
        self.active_errors[error_id] = {
            "type": error_type,
            "title": title,
            "message": message,
            "context": context
        }
        
        # Get error slot from timeline container
        error_slot = self._get_error_slot()
        if not error_slot:
            # Fallback: create floating error if no timeline container
            self._create_floating_error(error_id, title, message, actions)
            return
        
        # Build error HTML
        error_html = self._build_error_html(error_id, title, message, context, details, actions)
        
        # Show error slot and add this error
        error_slot.className = error_slot.className.replace('hidden', 'block')
        error_slot.insertAdjacentHTML('beforeend', error_html)
    
    def _build_error_html(self, error_id, title, message, context, details, actions):
        """Build the HTML for an error display"""
        context_html = f"<p class='text-sm text-red-600 mt-1'><strong>Context:</strong> {context}</p>" if context else ""
        details_html = f"<details class='mt-2 text-xs text-red-500'><summary>Technical Details</summary><pre>{details}</pre></details>" if details else ""
        
        actions_html = self._build_action_buttons(error_id, actions)
        
        return f'''
        <div id="error-{error_id}" class="error-item bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <div class="flex items-start">
                <div class="flex-shrink-0">
                    <svg class="w-5 h-5 text-red-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                </div>
                <div class="ml-3 flex-1">
                    <h3 class="text-sm font-medium text-red-800">{title}</h3>
                    <p class="text-sm text-red-700 mt-1">{message}</p>
                    {context_html}
                    {details_html}
                    <div class="mt-3 flex space-x-2">
                        {actions_html}
                        <button onclick="error_display.clear_error('{error_id}')" 
                                class="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700">
                            Dismiss
                        </button>
                    </div>
                </div>
            </div>
        </div>
        '''
    
    def _build_action_buttons(self, error_id, actions):
        """Build action buttons based on the provided actions list"""
        buttons = []
        
        for action in actions:
            if action == "refresh":
                buttons.append('''
                <button onclick="location.reload()" 
                        class="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700">
                    Refresh Page
                </button>
                ''')
            elif action == "retry":
                buttons.append(f'''
                <button onclick="error_display._retry_action('{error_id}')" 
                        class="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">
                    Retry
                </button>
                ''')
            elif action == "check_connection":
                # This could trigger a connectivity test
                pass
            elif action == "email_support":
                buttons.append('''
                <button onclick="window.open('mailto:support@mera.example?subject=Mera%20Learning%20Error')" 
                        class="text-xs bg-gray-600 text-white px-2 py-1 rounded hover:bg-gray-700">
                    Email Support
                </button>
                ''')
            elif action == "skip_component":
                buttons.append(f'''
                <button onclick="error_display._skip_component('{error_id}')" 
                        class="text-xs bg-yellow-600 text-white px-2 py-1 rounded hover:bg-yellow-700">
                    Skip Component
                </button>
                ''')
        
        return ' '.join(buttons)
    
    def _get_error_slot(self):
        """Get the error slot from the timeline container"""
        if self.timeline_container:
            return self.timeline_container.get_error_slot()
        else:
            # Try to find error slot by ID if no timeline container reference
            return document.getElementById("lesson-container-error-slot")
    
    def _hide_error_slot(self):
        """Hide the error slot when no errors are active"""
        error_slot = self._get_error_slot()
        if error_slot:
            error_slot.className = error_slot.className.replace('block', 'hidden')
            error_slot.innerHTML = ""
    
    def _create_floating_error(self, error_id, title, message, actions):
        """Fallback: create a floating error if no timeline container is available - matches learn.html styling"""
        floating_container = document.getElementById("floating-errors")
        if not floating_container:
            floating_container = document.createElement("div")
            floating_container.id = "floating-errors"
            floating_container.className = "fixed top-4 right-4 z-50 max-w-md"
            document.body.appendChild(floating_container)
        
        error_html = f'''
        <div id="error-{error_id}" class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-4 border">
            <div class="text-center">
                <div class="flex items-center justify-center space-x-2 text-red-600 mb-2">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <span class="font-semibold">{title}</span>
                </div>
                <p class="text-red-500 text-sm mb-4">{message}</p>
                <div class="flex justify-center space-x-2">
                    {self._build_action_buttons(error_id, actions)}
                    <button onclick="error_display.clear_error('{error_id}')" 
                            class="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors">
                        Dismiss
                    </button>
                </div>
            </div>
        </div>
        '''
        floating_container.insertAdjacentHTML('beforeend', error_html)
    
    def _retry_action(self, error_id):
        """Handle retry action - this would be implemented by core"""
        print(f"Retry requested for error: {error_id}")
        # Core would implement the actual retry logic
        # For now, just clear the error
        self.clear_error(error_id)
    
    def _skip_component(self, error_id):
        """Handle skip component action - this would be implemented by core"""
        print(f"Skip component requested for error: {error_id}")
        # Core would implement the actual skip logic
        # For now, just clear the error  
        self.clear_error(error_id)

# Global instance (will be initialized by core)
error_display = None