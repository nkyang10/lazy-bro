// Central config store — persisted to chrome.storage.local.
// The popup's settings panel saves here; background.js loads at runtime.
// Export/Import buttons serialize this object to a JSON file.

const Config = {
  apiUrl: '',
  apiKey: '',
  model: '',
  timeout: 30000,
  multiClickEnabled: false,
  maxClicks: 5,

  // Load persisted values from chrome.storage.local, falling back to defaults.
  async loadConfig() {
    try {
      const result = await chrome.storage.local.get([
        'apiUrl', 'apiKey', 'model', 'timeout', 'multiClickEnabled', 'maxClicks'
      ]);
      console.log('Config loaded from storage:', result);
      if (result.apiUrl) this.apiUrl = result.apiUrl;
      if (result.apiKey) this.apiKey = result.apiKey;
      if (result.model) this.model = result.model;
      if (result.timeout) this.timeout = result.timeout;
      if (result.multiClickEnabled !== undefined) this.multiClickEnabled = result.multiClickEnabled;
      if (result.maxClicks !== undefined) this.maxClicks = result.maxClicks;
    } catch (e) {
      console.error('Failed to load config:', e);
    }
    return this;
  },

  // Persist current config values to chrome.storage.local.
  async saveConfig() {
    try {
      await chrome.storage.local.set({
        apiUrl: this.apiUrl,
        apiKey: this.apiKey,
        model: this.model,
        timeout: this.timeout,
        multiClickEnabled: this.multiClickEnabled,
        maxClicks: this.maxClicks
      });
      console.log('Config saved:', { apiUrl: this.apiUrl, model: this.model, multiClickEnabled: this.multiClickEnabled, maxClicks: this.maxClicks });
    } catch (e) {
      console.error('Failed to save config:', e);
      throw e;
    }
    return this;
  },

  // Build standard Authorization + Content-Type headers for LLM API calls.
  getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }
};