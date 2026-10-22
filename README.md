# YouTube-Zusammenfassung

A Chrome extension (Manifest V3) that uses AI to create a summary of the current YouTube video. Summaries are requested from OpenRouter.

## Installation

The repository contains no build step or package manifest. Load the repository directory as an unpacked extension in Chrome (`chrome://extensions`, with developer mode enabled).

## Usage

The content script runs on `www.youtube.com` pages (`content.js`, `content.css`). The toolbar popup (`popup.html`) shows whether an API key is configured and opens the settings page.

## Configuration

Open the settings page (`options.html`) and enter:

- **OpenRouter API-Key** – required.
- **Modellname** – the OpenRouter model to use; defaults to `anthropic/claude-sonnet-4.5`.

Both values are stored in `chrome.storage.sync`.

## Project structure

- `manifest.json` – extension manifest
- `background.js` – service worker
- `content.js`, `content.css` – content script and styles for YouTube pages
- `popup.html`, `popup.js` – toolbar popup
- `options.html`, `options.js` – settings page
- `icons/` – extension icons
- `tests/` – tests for `background.js`

## Development

Run the tests for `background.js` with `node tests/background.test.js`.
