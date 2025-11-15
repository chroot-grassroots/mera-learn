// Custom Solid provider connection handler
function handleCustomConnect(event) {
    const providerInput = document.getElementById('custom-provider');
    const providerUrl = providerInput === null || providerInput === void 0 ? void 0 : providerInput.value.trim();
    if (providerUrl) {
        // Note: You'll need to update this URL template to use the actual Django URL
        const redirectUrl = `/solid/?provider=${encodeURIComponent(providerUrl)}`;
        window.location.href = redirectUrl;
    }
    else {
        console.log("Please enter a provider URL");
        // Could add user feedback here later
    }
}
// Attach event listener when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const customBtn = document.getElementById('custom-connect-btn');
    if (customBtn) {
        customBtn.addEventListener('click', handleCustomConnect);
    }
});
