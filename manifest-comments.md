# manifest.json — Field Reference

Pure JSON (no comments). This file documents each key.

## Top-level

| Key | Value | Notes |
|---|---|---|
| `manifest_version` | `3` | Chrome Extension Manifest V3 |
| `name` | `"Lazy Browser"` | Display name in chrome://extensions |
| `version` | `"1.0.0"` | Semantic versioning |
| `description` | `"Lazy Browser — AI-powered web assistant that analyzes pages and automates clicks"` | Short description shown in the Web Store / extensions page |

## Permissions

| Permission | Why needed |
|---|---|
| `activeTab` | Access the current tab on user interaction (popup click) |
| `storage` | Persist settings and chat history via `chrome.storage.local` |
| `scripting` | Programmatically inject scripts into pages via `chrome.scripting.executeScript` |
| `sidePanel` | (Reserved) Originally for Chrome side panel support — may be removed |

## Host Permissions

| Host | Why needed |
|---|---|
| `<all_urls>` | Content script and `executeScript` must work on every page the user visits. Also required for `fetch()` calls to arbitrary LLM API endpoints from the popup. |

## Action (Toolbar)

| Key | Value | Notes |
|---|---|---|
| `default_popup` | `"popup.html"` | The page opened when the user clicks the extension icon |
| `default_icon.16` | `"icons/icon16.png"` | 16px toolbar icon |
| `default_icon.48` | `"icons/icon48.png"` | 48px icon for chrome://extensions |

## Background (Service Worker)

| Key | Value | Notes |
|---|---|---|
| `service_worker` | `"background.js"` | Long-lived background script that handles LLM calls, multi-click navigation, and DOM actions. Persists after the popup is dismissed. |

## Content Scripts

| Key | Value | Notes |
|---|---|---|
| `matches` | `["<all_urls>"]` | Inject on every page |
| `js` | `["content-script.js"]` | Script file to inject |
| `run_at` | `"document_idle"` | Run after the page DOM is fully loaded |

> **Note:** `content-script.js` is currently **deprecated / legacy** — the extension uses `chrome.scripting.executeScript({ world:'MAIN' })` from the service worker directly. The content script is kept for potential future sandboxing.

## Icons

| Key | Value | Notes |
|---|---|---|
| `16` | `"icons/icon16.png"` | Toolbar favicon size |
| `48` | `"icons/icon48.png"` | Extensions management page |
| `128` | `"icons/icon128.png"` | Web Store / install prompt |

## Adding or Removing Permissions

When adding new permissions, update this document and ensure the corresponding `permissions` array in `manifest.json` is kept in sync. After changing permissions, the extension must be reloaded in `chrome://extensions`.
