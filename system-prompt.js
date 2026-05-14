// Loads the LLM system prompt from an external system-prompt.md file.
// Caches after first load — edit the .md file to tune LLM behaviour.
// Works in both popup context (via chrome.runtime.getURL) and service worker.

const SystemPrompt = {
  base: '',
  loaded: false,

  async load() {
    if (this.loaded) return this.base;
    try {
      const url = chrome.runtime.getURL('system-prompt.md');
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Failed to load prompt: ${resp.status}`);
      this.base = await resp.text();
      this.loaded = true;
      console.log('System prompt loaded from system-prompt.md');
    } catch (e) {
      console.error('Failed to load system prompt, using fallback:', e);
      this.base = 'You are a helpful AI assistant.';
      this.loaded = true;
    }
    return this.base;
  }
};