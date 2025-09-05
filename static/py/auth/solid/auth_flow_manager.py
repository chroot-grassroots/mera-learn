"""
Authentication flow manager - orchestrates Solid Pod authentication.
Simplified after extracting OAuth logic to solid_connection_handler.py.
"""
import asyncio
from js import document, window, console, URL
import js

# STANDARDIZED STORAGE KEY for solid session backup - Use this consistently across all files
SOLID_SESSION_BACKUP_KEY = 'mera_solid_session_backup'


def setup_retry_button():
    """Set up retry button functionality for error recovery."""
    retry_button = document.getElementById('retry-button')
    if retry_button:
        # Remove any existing event listeners by cloning the node
        new_retry_button = retry_button.cloneNode(True)
        retry_button.parentNode.replaceChild(new_retry_button, retry_button)
        
        # Add new event listener
        def handle_retry(event):
            """Handle retry button click."""
            print("🔄 Retry button clicked")
            # Create new task for retry
            asyncio.create_task(handle_solid_connection())
        
        new_retry_button.addEventListener('click', handle_retry)
        print("✅ Retry button functionality set up")


def initialize_solid_page():
    """
    Initialize the solid OAuth page with comprehensive error handling.
    """
    print("🔗 Solid OAuth page initializing...")
    try:
        # Set up retry button functionality
        setup_retry_button()
        
        # Start the main authentication flow
        asyncio.create_task(handle_solid_connection())
        
        print("✅ Solid OAuth page initialized successfully")
    except Exception as e:
        error_msg = f"Failed to initialize solid OAuth page: {e}"
        print(f"❌ {error_msg}")
        show_error(error_msg)


# === INITIALIZATION ===
# Auto-initialize when module loads - follows established pattern from existing codebase
initialize_solid_page()