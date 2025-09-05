"""
Authentication flow manager - orchestrates Solid Pod authentication.
Simplified after extracting OAuth logic to solid_connection_handler.py.
"""
import asyncio
from js import document, window, console, URL
import js

# PyScript shared global scope - for type checking only
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from pyscript_globals import (
        handle_solid_connection,
        show_error,
        show_loading,
        show_success,
        SolidClientWrapper,
        load_solid_client_wrapper,
        check_authentication,
        setup_retry_button,
        SOLID_SESSION_BACKUP_KEY,
        STORAGE_KEY
    )
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


async def wait_for_dependencies():
    """Wait for all required functions to be available."""
    max_attempts = 50  # 5 seconds total
    for attempt in range(max_attempts):
        if 'handle_solid_connection' in globals():
            return True
        await asyncio.sleep(0.1)
    return False

async def initialize_solid_page():
    """Initialize the solid OAuth page after waiting for dependencies."""
    print("🔗 Solid OAuth page initializing...")
    
    # Wait for dependencies to load
    if not await wait_for_dependencies():
        print("❌ Required dependencies not available")
        show_error("Failed to load authentication modules")
        return
    
    try:
        setup_retry_button()
        asyncio.create_task(handle_solid_connection())
        print("✅ Solid OAuth page initialized successfully")
    except Exception as e:
        error_msg = f"Failed to initialize solid OAuth page: {e}"
        print(f"❌ {error_msg}")
        show_error(error_msg)

# === INITIALIZATION ===
# Auto-initialize with dependency checking
asyncio.create_task(initialize_solid_page())