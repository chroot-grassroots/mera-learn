from js import document, window

def handle_custom_connect(event):
    """Handle custom provider connection."""
    provider_input = document.getElementById('custom-provider')
    provider_url = provider_input.value.strip()
    
    if provider_url:
        # Redirect to /solid with provider parameter
        redirect_url = "{% url 'pages:solid' %}?provider=" + provider_url
        window.location.href = redirect_url
    else:
        # Could add user feedback here later
        print("Please enter a provider URL")

# Attach event listener
custom_btn = document.getElementById('custom-connect-btn')
if custom_btn:
    custom_btn.addEventListener('click', handle_custom_connect)