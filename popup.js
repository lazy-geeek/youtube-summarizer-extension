const statusEl = document.getElementById("status");
const openOptionsButton = document.getElementById("openOptions");

chrome.storage.sync.get(["apiKey"], (stored) => {
  const configured = Boolean(stored.apiKey);
  statusEl.textContent = `API-Key konfiguriert: ${configured ? "ja" : "nein"}`;
});

openOptionsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
