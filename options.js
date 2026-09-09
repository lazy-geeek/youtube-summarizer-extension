const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

const apiKeyInput = document.getElementById("apiKey");
const modelInput = document.getElementById("model");
const saveButton = document.getElementById("save");
const statusEl = document.getElementById("status");

function loadValues() {
  chrome.storage.sync.get(["apiKey", "model"], (stored) => {
    apiKeyInput.value = stored.apiKey || "";
    modelInput.value = stored.model || DEFAULT_MODEL;
  });
}

function saveValues() {
  const apiKey = apiKeyInput.value.trim();
  const model = modelInput.value.trim() || DEFAULT_MODEL;

  chrome.storage.sync.set({ apiKey, model }, () => {
    statusEl.textContent = "Gespeichert.";
    setTimeout(() => {
      statusEl.textContent = "";
    }, 2000);
  });
}

saveButton.addEventListener("click", saveValues);
document.addEventListener("DOMContentLoaded", loadValues);
