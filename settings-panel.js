// Settings panel rendered inside #settingsPanel in popup.html / sidebar.html.
// Workflow: enter API URL → Connect → fetch model list → select model → save.
// API key is optional. Model dropdown is hidden until models are fetched.

class SettingsPanel {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.isVisible = false;
    this.fetchedModels = [];
  }

  // Inject the settings form HTML and bind events.
  render() {
    this.container.innerHTML = `
      <div class="settings-panel">
        <h3>Settings</h3>
        <form id="settingsForm">
          <div class="form-group">
            <label for="apiUrl">API Endpoint URL <span class="required">*</span></label>
            <div class="url-row">
              <input type="text" id="apiUrl" placeholder="https://api.openai.com/v1" />
              <button type="button" id="fetchModelsBtn" class="fetch-btn">Connect</button>
            </div>
            <p class="help-text">Enter your OpenAI-compatible API base URL, then click Connect to retrieve available models.</p>
          </div>

          <div class="form-group">
            <label for="apiKey">API Key <span class="optional">(optional)</span></label>
            <input type="password" id="apiKey" placeholder="Enter your API key (optional)" />
          </div>

          <div id="modelSection" class="form-group model-section" style="display:none">
            <label for="modelSelect">Model</label>
            <select id="modelSelect"></select>
            <div class="custom-model-row">
              <input type="text" id="customModel" placeholder="Or type a custom model name..." />
            </div>
          </div>

          <div id="modelStatus" class="model-status" style="display:none"></div>

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
          <p class="help-text">Your API key is included in the export file as plaintext. Keep the exported JSON secure.</p>
        </div>
      </div>
    `;

    document.getElementById('settingsForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveSettings();
    });

    document.getElementById('fetchModelsBtn').addEventListener('click', () => this.fetchAndPopulateModels());

    document.getElementById('exportBtn').addEventListener('click', () => this.exportSettings());
    document.getElementById('importBtn').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', (e) => this.importSettings(e));

    // Allow choosing between dropdown and custom input.
    const modelSelect = document.getElementById('modelSelect');
    const customModel = document.getElementById('customModel');
    if (modelSelect && customModel) {
      modelSelect.addEventListener('change', () => {
        if (modelSelect.value !== '__custom__') customModel.value = '';
      });
      customModel.addEventListener('input', () => {
        if (customModel.value.trim()) modelSelect.value = '__custom__';
      });
    }

    // Populate form fields from saved config.
    this.loadSettings();
  }

  // Fetch models from the OpenAI-compatible /models endpoint via background service worker.
  async fetchAndPopulateModels() {
    const apiUrl = document.getElementById('apiUrl').value.trim();
    const apiKey = document.getElementById('apiKey').value.trim();

    if (!apiUrl) {
      alert('Please enter an API Endpoint URL first.');
      return;
    }

    const fetchBtn = document.getElementById('fetchModelsBtn');
    const modelSection = document.getElementById('modelSection');
    const modelStatus = document.getElementById('modelStatus');
    const modelSelect = document.getElementById('modelSelect');

    fetchBtn.disabled = true;
    fetchBtn.textContent = '...';
    modelStatus.style.display = 'block';
    modelStatus.className = 'model-status model-status-loading';
    modelStatus.textContent = 'Fetching models...';

    try {
      const result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'fetchModels', apiUrl, apiKey }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        });
      });

      if (result.success) {
        this.fetchedModels = result.models;
        modelSelect.innerHTML = '';
        for (const m of this.fetchedModels) {
          const option = document.createElement('option');
          option.value = m;
          option.textContent = m;
          modelSelect.appendChild(option);
        }
        const customOption = document.createElement('option');
        customOption.value = '__custom__';
        customOption.textContent = 'Custom model...';
        modelSelect.appendChild(customOption);

        // Restore previously saved model if it's in the list.
        if (Config.model && this.fetchedModels.includes(Config.model)) {
          modelSelect.value = Config.model;
        } else if (Config.model) {
          modelSelect.value = '__custom__';
          document.getElementById('customModel').value = Config.model;
        }

        modelSection.style.display = 'block';
        modelStatus.style.display = 'none';
      } else {
        modelStatus.className = 'model-status model-status-error';
        modelStatus.textContent = `Failed to fetch models: ${result.error}. You can still type a custom model name below.`;
        // Show model section with custom input only.
        modelSelect.innerHTML = '<option value="__custom__">Custom model...</option>';
        if (Config.model) document.getElementById('customModel').value = Config.model;
        modelSection.style.display = 'block';
      }
    } catch (e) {
      modelStatus.className = 'model-status model-status-error';
      modelStatus.textContent = `Connection error: ${e.message}. You can still type a custom model name.`;
      modelSelect.innerHTML = '<option value="__custom__">Custom model...</option>';
      if (Config.model) document.getElementById('customModel').value = Config.model;
      modelSection.style.display = 'block';
    } finally {
      fetchBtn.disabled = false;
      fetchBtn.textContent = 'Connect';
    }
  }

  // On popup open: load saved values from chrome.storage into the form.
  async loadSettings() {
    await Config.loadConfig();
    document.getElementById('apiUrl').value = Config.apiUrl || '';
    document.getElementById('apiKey').value = Config.apiKey || '';

    const modelSection = document.getElementById('modelSection');
    const modelSelect = document.getElementById('modelSelect');
    const customModel = document.getElementById('customModel');

    // If a model was previously saved and an API URL is set, show the model section with custom input.
    if (Config.apiUrl) {
      modelSelect.innerHTML = '<option value="__custom__">Custom model...</option>';
      if (Config.model) {
        customModel.value = Config.model;
      }
      modelSection.style.display = 'block';
    }

    document.getElementById('multiClickEnabled').checked = Config.multiClickEnabled || false;
    document.getElementById('maxClicks').value = Config.maxClicks || 5;
  }

  // Persist form values to Config object and chrome.storage.
  async saveSettings() {
    const apiUrl = document.getElementById('apiUrl').value.trim();
    const apiKey = document.getElementById('apiKey').value.trim();

    if (!apiUrl) { alert('API Endpoint URL is required'); return; }

    const modelSelect = document.getElementById('modelSelect');
    const customModel = document.getElementById('customModel');

    let model = '';
    if (modelSelect && modelSelect.value === '__custom__') {
      model = (customModel && customModel.value.trim()) || '';
    } else if (modelSelect) {
      model = modelSelect.value;
    }

    if (!model) { alert('Please select or enter a model'); return; }

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
    if (!confirm('Warning: Your API key will be saved in plaintext inside the exported JSON file. Keep this file secure and delete it after importing. Continue?')) {
      return;
    }
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
        document.getElementById('multiClickEnabled').checked = Config.multiClickEnabled;
        document.getElementById('maxClicks').value = Config.maxClicks;

        // Show model section with imported model.
        const modelSection = document.getElementById('modelSection');
        const modelSelect = document.getElementById('modelSelect');
        const customModel = document.getElementById('customModel');
        if (Config.model) {
          modelSelect.innerHTML = '<option value="__custom__">Custom model...</option>';
          customModel.value = Config.model;
          modelSection.style.display = 'block';
        }

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
