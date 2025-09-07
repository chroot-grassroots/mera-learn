"""
PyScript Global Scope Type Definitions

This file provides type hints for functions that exist in PyScript's shared global namespace.
Used only for static type checking - never imported at runtime.
"""

# === UI Functions (from auth_ui.py or similar) ===
def show_error(message: str) -> None:
    """Show error message to user."""
    ...

def show_loading() -> None:
    """Show loading state to user."""
    ...

def show_success() -> None:
    """Show success state to user."""
    ...

# === Authentication Functions ===
async def handle_solid_connection() -> None:
    """Handle Solid OAuth connection flow."""
    ...

# === Solid Client Wrapper ===
class SolidClientWrapper:
    """Solid Pod client wrapper class."""
    def __init__(self, debug_callback=None): ...
    def check_session(self) -> bool: ...
    async def logout(self) -> None: ...
    # Add other methods as you encounter them

async def load_solid_client_wrapper() -> bool:
    """Load SolidClientWrapper dynamically."""
    ...

# === Session Management ===
async def check_authentication() -> None:
    """Check if user is authenticated."""
    ...

# === Retry/Button Functions ===
def setup_retry_button() -> None:
    """Set up retry button functionality."""
    ...

# === Constants that might be shared ===
SOLID_SESSION_BACKUP_KEY: str
STORAGE_KEY: str

# === Any other cross-module functions you discover ===
# Just add them here as you find PyLance complaints