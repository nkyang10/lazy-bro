# Lazy Browser

> free your mind, free your click, lazy browsing

AI-powered Chrome extension that reads web pages, clicks through links, and finds answers — so you don't have to.

## Features

- **AI chat interface** via the extension popup — ask questions and get answers powered by LLMs
- **Multi-click navigation** — the LLM analyzes the page DOM and clicks through links to find answers, handling complex multi-page research automatically. Failed clicks fall back to direct URL navigation after a 2000ms timeout.
- **Customizable API** — works with OpenAI, DeepSeek, MiniMax, and any compatible API endpoint; bring your own endpoint, model, and API key
- **Settings export/import** — back up your configuration or share it across devices with JSON export/import
- **Chat history persistence** — conversations are saved locally and persist across browser sessions
- **Reasoning/chain-of-thought display** — see the LLM's reasoning behind each action in real time
- **Markdown rendering** — responses render with syntax-highlighted code blocks and rich formatting

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/nkyang10/lazy-bro.git
   ```
2. Open `chrome://extensions` in Chrome
3. Enable **"Developer mode"** (toggle in the top-right corner)
4. Click **"Load unpacked"** and select the project folder
5. Click the extension icon in the toolbar, open **Settings**, and enter your API endpoint, API key, and model

## Build

To package the extension for distribution or Chrome Web Store submission:

```bash
npm install
npm run build
```

This produces `dist/lazy-bro.zip` — ready for Chrome Web Store upload or sideloading. The build script uses [`archiver`](https://www.npmjs.com/package/archiver) to package only the necessary extension files, excluding development artifacts and node_modules.

## Project Structure

```
├── manifest.json          # Chrome Extension manifest (Manifest V3)
├── background.js          # Service worker — handles LLM API calls, click actions, and navigation fallback
├── popup.html             # Extension popup UI
├── popup.js               # Popup logic and chat interaction
├── config.js              # Central settings and defaults management
├── settings-panel.js      # Settings form UI and persistence
├── history.js             # Chat history storage and retrieval
├── api-service.js         # API client for OpenAI-compatible endpoints
├── content-script.js      # DOM content extraction and page inspection
├── system-prompt.js       # Dynamic system prompt loader
├── system-prompt.md       # Editable LLM behavior definition
├── build.js               # Packaging script (npm run build)
├── package.json           # Node.js dependencies and scripts
└── icons/                 # Extension icons (16px, 48px, 128px)
```

## Customize the LLM

The file `system-prompt.md` defines how the LLM behaves — including action priorities, response formats, and decision-making rules. Edit it directly to change the assistant's personality, what types of actions it prefers, and how it structures its responses. The extension loads this file dynamically at runtime, so changes take effect on the next query.

## License

MIT License — see the [LICENSE](LICENSE) file for details.

## A Note from the Author

Thank you for checking out **Lazy Browser**! This project was built to make browsing a little lazier — and hopefully a little smarter too.

I won't be actively maintaining this project going forward, but you're more than welcome to clone it, fork it, modify it, and make it your own. I truly hope everyone gets their own lazy helper tailored just for them.

If this project has been useful to you, consider buying me a coffee — it's always appreciated.

---

<p align="center">
  <sub>Available on the Chrome Web Store</sub><br>
  <a href="https://chromewebstore.google.com"><img src="https://img.shields.io/badge/Chrome%20Web%20Store-available-blue?logo=googlechrome&logoColor=white" alt="Chrome Web Store"></a>
  <br><br>
  <a href="https://github.com/nkyang10"><img src="https://img.shields.io/badge/GitHub-nkyang10-181717?logo=github&logoColor=white" alt="GitHub"></a>
  <a href="https://buymeacoffee.com/markyang"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-markyang-ffdd00?logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>
  <br>
  <img src="https://img.shields.io/badge/made%20with-love-red" alt="Made with love">
</p>
