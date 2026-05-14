// Settings panel rendered inside #settingsPanel in popup.html.
// Manages API endpoint, key, model, and experimental multi-click options.
// Supports Export/Import to persist settings across extension reinstalls.

class SettingsPanel {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.isVisible = false;
  }

  // Inject the settings form HTML and bind events.
  render() {
    this.container.innerHTML = `
      <div class="settings-panel">
        <h3>Settings</h3>
        <form id="settingsForm">
          <div class="form-group">
            <label for="apiUrl">API Endpoint URL</label>
            <input type="text" id="apiUrl" placeholder="https://api.openai.com/v1" />
          </div>
          <div class="form-group">
            <label for="apiKey">API Key</label>
            <input type="password" id="apiKey" placeholder="Enter your API key" />
          </div>
          <div class="form-group">
            <label for="modelSelect">Model</label>
            <select id="modelSelect">
              <optgroup label="OpenAI">
                <option value="gpt-5.5">GPT-5.5</option>
                <option value="gpt-5.5-pro">GPT-5.5 Pro</option>
                <option value="gpt-5.4">GPT-5.4</option>
                <option value="gpt-5.4-pro">GPT-5.4 Pro</option>
                <option value="gpt-5.4-mini">GPT-5.4 Mini</option>
                <option value="gpt-5.4-nano">GPT-5.4 Nano</option>
                <option value="gpt-5-mini">GPT-5 Mini</option>
                <option value="gpt-5-nano">GPT-5 Nano</option>
                <option value="chat-latest">ChatGPT Latest</option>
              </optgroup>
              <optgroup label="MiniMax">
                <option value="MiniMax-M2.7">MiniMax M2.7</option>
                <option value="MiniMax-M2.5">MiniMax M2.5</option>
                <option value="MiniMax-M2.5-lightning">MiniMax M2.5 Lightning</option>
                <option value="MiniMax-M2.1">MiniMax M2.1</option>
                <option value="MiniMax-M2.1-lightning">MiniMax M2.1 Lightning</option>
              </optgroup>
              <optgroup label="DeepSeek">
                <option value="deepseek-v4-pro">DeepSeek V4 Pro</option>
                <option value="deepseek-v4-flash">DeepSeek V4 Flash</option>
                <option value="deepseek-chat">DeepSeek Chat (legacy)</option>
                <option value="deepseek-reasoner">DeepSeek Reasoner (legacy)</option>
                <option value="deepseek-r1">DeepSeek R1</option>
                <option value="deepseek-coder">DeepSeek Coder</option>
              </optgroup>
            </select>
          </div>
          <div class="settings-section">
            <h4>Experimental</h4>
            <div class="form-group checkbox-group">
              <label>
                <input type="checkbox" id="multiClickEnabled" />
                Enable multi-click navigation
              </label>
              <p class="help-text">Automatically click through links to find information (max N clicks)</p>
            </div>
            <div class="form-group">
              <label for="maxClicks">Max Clicks</label>
              <input type="number" id="maxClicks" min="1" max="10" value="5" />
            </div>
          </div>
          <button type="submit" class="save-btn">Save Settings</button>
        </form>
        <div class="settings-actions">
          <button id="exportBtn" class="action-btn">Export</button>
          <button id="importBtn" class="action-btn">Import</button>
          <input type="file" id="importFile" accept=".json" style="display:none" />
        </div>
      </div>
    `;

    document.getElementById('settingsForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveSettings();
    });

    document.getElementById('exportBtn').addEventListener('click', () => this.exportSettings());
    document.getElementById('importBtn').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', (e) => this.importSettings(e));

    // Populate form fields from saved config.
    this.loadSettings();
  }

  // On popup open: load saved values from chrome.storage into the form.
  async loadSettings() {
    await Config.loadConfig();
    document.getElementById('apiUrl').value = Config.apiUrl || '';
    document.getElementById('apiKey').value = Config.apiKey || '';
    document.getElementById('modelSelect').value = Config.model || 'gpt-5.5';
    document.getElementById('multiClickEnabled').checked = Config.multiClickEnabled || false;
    document.getElementById('maxClicks').value = Config.maxClicks || 5;
  }

  // Persist form values to Config object and chrome.storage.
  async saveSettings() {
    const apiUrl = document.getElementById('apiUrl').value.trim();
    const apiKey = document.getElementById('apiKey').value.trim();

    if (!apiUrl) { alert('API Endpoint URL is required'); return; }
    if (!apiKey) { alert('API Key is required'); return; }

    const model = document.getElementById('modelSelect').value;
    const multiClickEnabled = document.getElementById('multiClickEnabled').checked;
    const maxClicks = parseInt(document.getElementById('maxClicks').value, 10) || 5;

    Config.apiUrl = apiUrl;
    Config.apiKey = apiKey;
    Config.model = model;
    Config.multiClickEnabled = multiClickEnabled;
    Config.maxClicks = maxClicks;
    await Config.saveConfig();
    alert('Settings saved successfully');
  }

  // Download current settings as a JSON file.
  exportSettings() {
    const data = {
      apiUrl: Config.apiUrl,
      apiKey: Config.apiKey,
      model: Config.model,
      timeout: Config.timeout,
      multiClickEnabled: Config.multiClickEnabled,
      maxClicks: Config.maxClicks
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lazy-bro-settings.json';
    a.click();
    URL.revokeObjectURL(url);
    alert('Settings exported to lazy-bro-settings.json');
  }

  // Restore settings from a previously exported JSON file.
  importSettings(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        Config.apiUrl = data.apiUrl || Config.apiUrl;
        Config.apiKey = data.apiKey || Config.apiKey;
        Config.model = data.model || Config.model;
        Config.timeout = data.timeout || Config.timeout;
        Config.multiClickEnabled = data.multiClickEnabled || false;
        Config.maxClicks = data.maxClicks || 5;
        await Config.saveConfig();
        document.getElementById('apiUrl').value = Config.apiUrl;
        document.getElementById('apiKey').value = Config.apiKey;
        document.getElementById('modelSelect').value = Config.model;
        document.getElementById('multiClickEnabled').checked = Config.multiClickEnabled;
        document.getElementById('maxClicks').value = Config.maxClicks;
        alert('Settings imported successfully');
      } catch (err) {
        alert('Invalid settings file: ' + err.message);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  show() {
    if (this.container) { this.container.style.display = 'block'; this.isVisible = true; }
  }

  hide() {
    if (this.container) { this.container.style.display = 'none'; this.isVisible = false; }
  }

  toggle() {
    this.isVisible ? this.hide() : this.show();
  }
}