// Chat message history persisted in chrome.storage.local.
// Each message has { role, content, timestamp }.
class MessageHistory {
  constructor(maxMessages = 50) {
    this.maxMessages = maxMessages;       // Max messages to keep in memory
    this.storageKey = 'messageHistory';  // Key used in chrome.storage.local
  }

  // Retrieve the full message history array from storage.
  async getHistory() {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.storageKey], (result) => {
        const history = result[this.storageKey] || [];
        resolve(history);
      });
    });
  }

  // Append a new message (role + content) and trim if over maxMessages.
  async saveMessage(role, content) {
    const history = await this.getHistory();
    const message = {
      role,
      content,
      timestamp: new Date().toISOString()
    };
    history.push(message);

    // Drop oldest messages if we exceed the cap.
    if (history.length > this.maxMessages) {
      history.shift();
    }

    return new Promise((resolve) => {
      chrome.storage.local.set({ [this.storageKey]: history }, resolve);
    });
  }

  // Wipe all stored history.
  async clearHistory() {
    return new Promise((resolve) => {
      chrome.storage.local.remove([this.storageKey], resolve);
    });
  }
}

// Singleton instance shared across popup scripts.
const messageHistory = new MessageHistory();
