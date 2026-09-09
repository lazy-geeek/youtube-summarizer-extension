(function () {
  const PANEL_ID = "yts-panel";
  const BUTTON_ID = "yts-button";

  let currentVideoId = null;

  function getVideoIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("v");
  }

  function findTargetContainer() {
    return document.querySelector("#secondary") || document.querySelector("#related");
  }

  function createPanel() {
    const container = document.createElement("div");
    container.id = PANEL_ID;
    container.className = "yts-container";

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.className = "yts-button";
    button.type = "button";
    button.textContent = "Zusammenfassung erstellen";
    button.addEventListener("click", onSummarizeClick);

    const content = document.createElement("div");
    content.className = "yts-content";
    content.style.display = "none";

    container.appendChild(button);
    container.appendChild(content);

    return container;
  }

  function getPanelParts() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) {
      return null;
    }
    return {
      panel,
      button: panel.querySelector(".yts-button"),
      content: panel.querySelector(".yts-content")
    };
  }

  function setLoadingState() {
    const parts = getPanelParts();
    if (!parts) return;
    parts.button.style.display = "none";
    parts.content.style.display = "block";
    parts.content.innerHTML = '<div class="yts-loading">Zusammenfassung wird erstellt …</div>';
  }

  function setSummaryState(summaryText) {
    const parts = getPanelParts();
    if (!parts) return;
    parts.button.style.display = "none";
    parts.content.style.display = "block";
    const textEl = document.createElement("div");
    textEl.className = "yts-summary-text";
    textEl.textContent = summaryText;
    parts.content.innerHTML = "";
    parts.content.appendChild(textEl);
  }

  function setErrorState(message, showOptionsLink) {
    const parts = getPanelParts();
    if (!parts) return;
    parts.button.style.display = "none";
    parts.content.style.display = "block";
    parts.content.innerHTML = "";

    const errorEl = document.createElement("div");
    errorEl.className = "yts-error";
    errorEl.textContent = message;
    parts.content.appendChild(errorEl);

    if (showOptionsLink) {
      const link = document.createElement("a");
      link.className = "yts-options-link";
      link.href = "#";
      link.textContent = "Zu den Einstellungen";
      link.addEventListener("click", (event) => {
        event.preventDefault();
        chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
      });
      parts.content.appendChild(link);
    }
  }

  function resetToButtonState() {
    const parts = getPanelParts();
    if (!parts) return;
    parts.button.style.display = "block";
    parts.content.style.display = "none";
    parts.content.innerHTML = "";
  }

  function extractPlayerResponse() {
    if (window.ytInitialPlayerResponse) {
      return window.ytInitialPlayerResponse;
    }
    const scripts = document.querySelectorAll("script");
    for (const script of scripts) {
      const text = script.textContent;
      if (!text || !text.includes("ytInitialPlayerResponse")) {
        continue;
      }
      const match = text.match(/var ytInitialPlayerResponse\s*=\s*(\{.*?\});/s);
      if (match) {
        try {
          return JSON.parse(match[1]);
        } catch (error) {
          continue;
        }
      }
    }
    return null;
  }

  function pickCaptionTrack(captionTracks) {
    if (!captionTracks || captionTracks.length === 0) {
      return null;
    }
    const german = captionTracks.find((track) => track.languageCode && track.languageCode.startsWith("de"));
    if (german) return german;
    const english = captionTracks.find((track) => track.languageCode && track.languageCode.startsWith("en"));
    if (english) return english;
    return captionTracks[0];
  }

  async function fetchTranscriptText() {
    const playerResponse = extractPlayerResponse();
    const captionTracks =
      playerResponse &&
      playerResponse.captions &&
      playerResponse.captions.playerCaptionsTracklistRenderer &&
      playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;

    const track = pickCaptionTrack(captionTracks);
    if (!track || !track.baseUrl) {
      return null;
    }

    const response = await fetch(track.baseUrl + "&fmt=json3");
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    if (!data.events) {
      return null;
    }

    const segments = [];
    for (const event of data.events) {
      if (!event.segs) continue;
      for (const seg of event.segs) {
        if (seg.utf8) {
          segments.push(seg.utf8);
        }
      }
    }

    const text = segments.join("").replace(/\s+/g, " ").trim();
    return text.length > 0 ? text : null;
  }

  function getVideoTitle() {
    const titleEl = document.querySelector("h1.ytd-watch-metadata yt-formatted-string");
    if (titleEl && titleEl.textContent) {
      return titleEl.textContent.trim();
    }
    return document.title.replace(/\s*-\s*YouTube\s*$/, "").trim();
  }

  async function onSummarizeClick() {
    setLoadingState();

    let transcript;
    try {
      transcript = await fetchTranscriptText();
    } catch (error) {
      transcript = null;
    }

    if (!transcript) {
      setErrorState("Für dieses Video ist kein Transkript verfügbar.", false);
      return;
    }

    const title = getVideoTitle();

    chrome.runtime.sendMessage(
      { type: "SUMMARIZE", title, transcript },
      (response) => {
        if (chrome.runtime.lastError) {
          setErrorState("Fehler bei der Kommunikation mit der Erweiterung.", false);
          return;
        }
        if (!response) {
          setErrorState("Es wurde keine Antwort erhalten.", false);
          return;
        }
        if (response.error === "NO_API_KEY") {
          setErrorState("Kein API-Key konfiguriert.", true);
          return;
        }
        if (response.error) {
          setErrorState(response.error, false);
          return;
        }
        setSummaryState(response.summary);
      }
    );
  }

  function injectPanel() {
    const container = findTargetContainer();
    if (!container) {
      return;
    }
    if (document.getElementById(PANEL_ID)) {
      return;
    }
    const panel = createPanel();
    container.insertBefore(panel, container.firstChild);
  }

  function removePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) {
      panel.remove();
    }
  }

  function handleNavigation() {
    const videoId = getVideoIdFromUrl();
    if (videoId !== currentVideoId) {
      currentVideoId = videoId;
      removePanel();
      injectPanel();
    } else {
      injectPanel();
    }
  }

  currentVideoId = getVideoIdFromUrl();
  injectPanel();

  document.addEventListener("yt-navigate-finish", handleNavigation);

  const observerTarget = document.body;
  const observer = new MutationObserver(() => {
    if (!document.getElementById(PANEL_ID)) {
      injectPanel();
    }
  });
  observer.observe(observerTarget, { childList: true, subtree: true });
})();
