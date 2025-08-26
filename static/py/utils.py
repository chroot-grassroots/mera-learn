"""
Utility functions for the Jura learning platform.
"""

def update_debug(message):
    """Update the debug output with a message."""
    from pyscript import document # type: ignore
    
    debug_output = document.querySelector("#debug-output")
    if debug_output:
        current = debug_output.innerHTML
        debug_output.innerHTML = current + f"<p class='text-sm text-gray-700 mb-1'>{message}</p>"
    print(message)

def test_imports():
    """Test function to verify imports work."""
    return "✅ Import system is working!"