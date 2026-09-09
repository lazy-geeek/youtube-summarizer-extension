const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

async function summarize(title, transcript) {
  const stored = await chrome.storage.sync.get(["apiKey", "model"]);
  if (!stored.apiKey) {
    return { error: "NO_API_KEY" };
  }

  const model = stored.model || DEFAULT_MODEL;

  const prompt =
    `Fasse die wesentlichen Aspekte des folgenden YouTube-Videos auf Deutsch zusammen.\n\n` +
    `Titel: ${title}\n\n` +
    `Transkript:\n${transcript}`;

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${stored.apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        reasoning: { effort: "low" },
        max_tokens: 4096
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return { error: `OpenRouter-Fehler (${response.status}): ${errorBody}` };
    }

    const data = await response.json();
    const summary = data?.choices?.[0]?.message?.content;
    if (!summary) {
      return { error: "Es wurde keine Zusammenfassung zurückgegeben." };
    }

    return { summary };
  } catch (error) {
    return { error: `Netzwerkfehler: ${error.message}` };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SUMMARIZE") {
    summarize(message.title, message.transcript).then(sendResponse);
    return true;
  }
  if (message.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    return false;
  }
  return false;
});
