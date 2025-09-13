import js
import asyncio

MAX_ATTEMPTS_SOLID_DELAY = 50

# NO initialization if Solid is NOT connected
async def no_solid_connection():
    # TO DO: Code to display error and option to try reconnecting to user
    pass

# Initialization if Solid IS connected
async def initialize_state_solid():
   # Code to load JSONs here
   build_validation_system() # type: ignore

# This checks to make sure solid is connected and mera-bridge is ready. 
async def start_bootstrap():
    solid_session_ready = False 
    
    for attempt in range(MAX_ATTEMPTS_SOLID_DELAY):
        if await js.window.meraBridge.check():
            solid_session_ready = True
            break
        else:
            await asyncio.sleep(0.1)
    
    if solid_session_ready:
        await initialize_state_solid()
    else:
        print("Solid pod is not connected.")
        await no_solid_connection()