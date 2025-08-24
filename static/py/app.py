from pyscript import document, when
import js
from solid_auth import SolidAuth

def update_debug(message):
    debug_output = document.querySelector("#debug-output")
    if debug_output:
        current = debug_output.innerHTML
        debug_output.innerHTML = current + f"<p>{message}</p>"
    print(message)

# Initialize auth system
solid_auth = SolidAuth(debug_callback=update_debug)

@when("click", "#test-js")
def test_js_access(event):
    update_debug("Testing library access...")
    
    try:
        has_auth = hasattr(js, 'solidClientAuthentication')
        has_client = hasattr(js, 'solidClient')
        
        update_debug(f"solidClientAuthentication: {has_auth}")
        update_debug(f"solidClient: {has_client}")
        
        if has_auth and has_client:
            update_debug("🎉 Both Solid libraries are working!")
        
    except Exception as e:
        update_debug(f"Error: {e}")

@when("click", "#login-solidcommunity")
async def login_solidcommunity(event):
    update_debug("🌐 Connecting to SolidCommunity.net...")
    is_logged_in = solid_auth.check_session()
    if not is_logged_in:
        await solid_auth.login("https://solidcommunity.net")
    else:
        update_debug("Already connected!")

@when("click", "#login-custom")
async def login_custom(event):
    custom_url = document.querySelector("#custom-provider").value
    if custom_url:
        update_debug(f"🔧 Connecting to {custom_url}...")
        await solid_auth.login(custom_url)
    else:
        update_debug("Please enter a pod provider URL")

update_debug("🔒 Solid Pod authentication ready!")