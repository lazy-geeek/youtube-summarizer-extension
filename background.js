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

const SUMMARIES_KEY = "summaries";
const MAX_SUMMARIES = 100;

function pruneSummaries(summaries, max) {
  const entries = Object.entries(summaries)
    .sort((a, b) => b[1].createdAt - a[1].createdAt)
    .slice(0, max);
  return Object.fromEntries(entries);
}

let saveChain = Promise.resolve();

function saveSummary(videoId, title, summary) {
  const run = saveChain.then(async () => {
    const stored = await chrome.storage.local.get(SUMMARIES_KEY);
    const summaries = stored[SUMMARIES_KEY] || {};
    summaries[videoId] = { summary, title, createdAt: Date.now() };
    await chrome.storage.local.set({ [SUMMARIES_KEY]: pruneSummaries(summaries, MAX_SUMMARIES) });
  });
  saveChain = run.catch(() => {});
  return run;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SUMMARIZE") {
    summarize(message.title, message.transcript).then(async (result) => {
      if (result.summary && message.videoId) {
        try { await saveSummary(message.videoId, message.title, result.summary); }
        catch (error) { console.warn("Saving summary failed", error); }
      }
      sendResponse(result);
    });
    return true;
  }
  if (message.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    return false;
  }
  return false;
});
