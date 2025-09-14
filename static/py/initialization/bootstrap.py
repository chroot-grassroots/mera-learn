import js
import asyncio
from ui.error_display import ErrorDisplay
from ui.timeline_container import TimelineContainer

MAX_ATTEMPTS = 50

# DEBUG: Add these lines at the very top
print("BOOTSTRAP: Module is executing!")
js.console.log("BOOTSTRAP: Module is executing!")

# Initialize UI components
timeline = None
error_display = None

def setup_ui():
    """Initialize timeline and error display components"""
    global timeline, error_display
    
    # Hide auth-status loading screen
    auth_status = js.document.getElementById('auth-status')
    if auth_status:
        auth_status.classList.add('hidden')
    
    # Show lesson-container for timeline
    lesson_container = js.document.getElementById('lesson-container')
    if lesson_container:
        lesson_container.classList.remove('hidden')
    
    # Initialize timeline and EXTENDED error display
    timeline = TimelineContainer("lesson-container")
    error_display = SolidConnectionErrorDisplay(timeline)

class SolidConnectionErrorDisplay(ErrorDisplay):
    """Extended ErrorDisplay with Solid-specific error handling"""
    
    def show_solid_connection_error(self):
        """Display Solid Pod connection failure with retry option"""
        self._show_error(
            error_id="solid-connection",
            error_type="solid",
            title="Solid Pod Connection Failed",
            message="Solid pod connection failed. Please try connecting to Solid pod again. If issues persist, please email support@meralearn.org.",
            context="Authentication with your Solid Pod provider was unsuccessful",
            actions=["retry_solid", "email_support"]
        )
    
    def _build_action_buttons(self, error_id, actions):
        """Override to add Solid-specific actions"""
        buttons = []
        
        for action in actions:
            if action == "retry_solid":
                # Use the solid page URL from your project
                buttons.append('''
                <button onclick="window.location.href = window.CONNECT_URL || '/pages/connect/'" 
                        class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors">
                    Try Connecting Again
                </button>
                ''')
            elif action == "email_support":
                buttons.append('''
                <button onclick="window.open('mailto:support@meralearn.org?subject=Solid%20Pod%20Connection%20Issue')" 
                        class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors">
                    Email Support
                </button>
                ''')
            else:
                # Handle any other actions with parent class method
                parent_buttons = super()._build_action_buttons(error_id, [action])
                buttons.append(parent_buttons)
        
        return ' '.join(buttons)

# Global bootstrap instance for JavaScript callbacks
class BootstrapManager:
    def __init__(self):
        self.timeline = None
        self.error_display = None
    
    async def retry_solid_connection(self):
        """Retry Solid Pod connection"""
        if self.error_display:
            self.error_display.clear_error("solid-connection")
        # Restart the bootstrap process
        await start_bootstrap()

bootstrap_instance = BootstrapManager()

# Make bootstrap instance available to JavaScript
js.window.bootstrap_instance = bootstrap_instance

# Initialization if Solid IS connected
async def initialize_state_solid():
    setup_ui()
    print("Solid Pod connected - initializing with cloud sync")
    # Your state initialization code here
    pass

# NO initialization if Solid is NOT connected
async def no_solid_connection():
    """Display error and require Solid Pod connection"""
    setup_ui()
    
    # Show Solid connection error - authentication required
    error_display.show_solid_connection_error()

# This checks to make sure solid is connected and mera-bridge is ready.
# This is the starting point launched by learn.html
async def start_bootstrap():
    print("BOOTSTRAP: start_bootstrap() function called!")
    js.console.log("BOOTSTRAP: start_bootstrap() function called!")

    solid_session_ready = False 
    
    for attempt in range(MAX_ATTEMPTS):
        try:
            # Check if bridge exists and is ready
            if hasattr(js.window, 'meraBridge') and await js.window.meraBridge.check():
                solid_session_ready = True
                break
            else:
                print(f"BOOTSTRAP: Attempt {attempt + 1}/{MAX_ATTEMPTS} - Bridge not ready")
                # Wait before next attempt
                await asyncio.sleep(0.1)
                
        except Exception as e:
            print(f"BOOTSTRAP: Attempt {attempt + 1}/{MAX_ATTEMPTS} - Error: {e}")
             # Wait before next attempt
            await asyncio.sleep(0.1)
            
    if solid_session_ready:
        await initialize_state_solid()
    else:
        print("Solid pod not connected. Authentication required.")
        await no_solid_connection()

# Store references for JavaScript access
bootstrap_instance.timeline = timeline
bootstrap_instance.error_display = error_display

# Auto-start bootstrap when module loads
asyncio.create_task(start_bootstrap())