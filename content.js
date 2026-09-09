(function () {
  const PANEL_ID = "yts-panel";
  const BUTTON_ID = "yts-button";

  let currentVideoId = null;

  function getVideoIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("v");
  }

  function findTargetContainer() {
    return document.querySelector("#secondary");
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

  function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderInlineMarkdown(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/_(.+?)_/g, "<em>$1</em>");
  }

  function renderMarkdownToHtml(markdown) {
    const escaped = escapeHtml(markdown);
    const lines = escaped.split("\n");
    const htmlParts = [];
    let listItems = null;
    let paragraphLines = null;

    function flushList() {
      if (listItems) {
        htmlParts.push(`<ul>${listItems.join("")}</ul>`);
        listItems = null;
      }
    }

    function flushParagraph() {
      if (paragraphLines) {
        htmlParts.push(`<p>${paragraphLines.map(renderInlineMarkdown).join("<br>")}</p>`);
        paragraphLines = null;
      }
    }

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (line === "") {
        flushList();
        flushParagraph();
        continue;
      }

      const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
      if (headingMatch) {
        flushList();
        flushParagraph();
        const level = headingMatch[1].length;
        htmlParts.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
        continue;
      }

      const listMatch = line.match(/^[-*]\s+(.*)$/);
      if (listMatch) {
        flushParagraph();
        if (!listItems) listItems = [];
        listItems.push(`<li>${renderInlineMarkdown(listMatch[1])}</li>`);
        continue;
      }

      flushList();
      if (!paragraphLines) paragraphLines = [];
      paragraphLines.push(line);
    }

    flushList();
    flushParagraph();

    return htmlParts.join("");
  }

  function setSummaryState(summaryText) {
    const parts = getPanelParts();
    if (!parts) return;
    parts.button.style.display = "none";
    parts.content.style.display = "block";
    const textEl = document.createElement("div");
    textEl.className = "yts-summary-text";
    textEl.innerHTML = renderMarkdownToHtml(summaryText);
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

  function queryAllDeep(root, predicate) {
    const found = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;
    while (node) {
      if (predicate(node)) found.push(node);
      if (node.shadowRoot) found.push(...queryAllDeep(node.shadowRoot, predicate));
      node = walker.nextNode();
    }
    return found;
  }

  function waitForTranscriptSegments(timeoutMs) {
    return new Promise((resolve) => {
      const start = Date.now();
      const poll = () => {
        const segments = queryAllDeep(document.body, (n) => n.tagName === "TRANSCRIPT-SEGMENT-VIEW-MODEL" || n.tagName === "YTD-TRANSCRIPT-SEGMENT-RENDERER");
        if (segments.length > 0) {
          resolve(segments);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          resolve([]);
          return;
        }
        setTimeout(poll, 200);
      };
      poll();
    });
  }

  async function fetchTranscriptText() {
    const transcriptButton = document.querySelector("ytd-video-description-transcript-section-renderer button");
    if (!transcriptButton) {
      return null;
    }

    transcriptButton.click();
    try {
      const segments = await waitForTranscriptSegments(10000);
      if (segments.length === 0) {
        return null;
      }

      const texts = [];
      for (const segment of segments) {
        let textEl = null;
        if (segment.tagName === "YTD-TRANSCRIPT-SEGMENT-RENDERER") {
          textEl = segment.querySelector(".segment-text");
        } else {
          textEl = segment.querySelector("span");
        }
        if (textEl && textEl.textContent) {
          texts.push(textEl.textContent.trim());
        }
      }

      const text = texts.join(" ").replace(/\s+/g, " ").trim();
      return text.length > 0 ? text : null;
    } finally {
      const engagementPanel = Array.from(
        document.querySelectorAll(
          'ytd-engagement-panel-section-list-renderer[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]'
        )
      ).find((el) => {
        const targetId = el.getAttribute("target-id") || "";
        return targetId.toLowerCase().includes("transcript");
      });
      const closeButton = engagementPanel
        ? queryAllDeep(
            engagementPanel,
            (n) => n.tagName === "BUTTON" && (n.getAttribute("aria-label") === "Schließen" || n.getAttribute("aria-label") === "Transkript schließen")
          )[0]
        : null;
      if (closeButton) {
        closeButton.click();
      } else {
        transcriptButton.click();
      }
    }
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
    const existingPanel = document.getElementById(PANEL_ID);
    if (existingPanel) {
      if (existingPanel.parentElement === container) {
        return;
      }
      existingPanel.remove();
    }
    const panel = createPanel();
    const relatedEl = document.getElementById("related");
    const referenceNode = (relatedEl && relatedEl.parentElement === container) ? relatedEl : container.firstChild;
    container.insertBefore(panel, referenceNode);
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
    const container = findTargetContainer();
    const panel = document.getElementById(PANEL_ID);
    if (!panel || (container && panel.parentElement !== container)) {
      injectPanel();
    }
  });
  observer.observe(observerTarget, { childList: true, subtree: true });
})();
