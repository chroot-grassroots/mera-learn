// src/ts/web/customSolidHandler.ts
function handleCustomConnect(event) {
  const providerInput = document.getElementById("custom-provider");
  const providerUrl = providerInput?.value.trim();
  if (providerUrl) {
    const redirectUrl = `/solid/?provider=${encodeURIComponent(providerUrl)}`;
    window.location.href = redirectUrl;
  } else {
    console.log("Please enter a provider URL");
  }
}
document.addEventListener("DOMContentLoaded", () => {
  const customBtn = document.getElementById("custom-connect-btn");
  if (customBtn) {
    customBtn.addEventListener("click", handleCustomConnect);
  }
});
