alert('sidebar.js loaded');

let isActive = false;
let settingsPanel;
let isWaitingForResponse = false;
const toggleBtn = document.getElementById('toggleBtn');
alert('toggleBtn found: ' + toggleBtn);
const sendBtn = document.getElementById('sendBtn');
const userInput = document.getElementById('userInput');
const chatContainer = document.getElementById('chatContainer');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanelContainer = document.getElementById('settingsPanel');
const clearChatBtn = document.getElementById('clearChatBtn');

function formatTimestamp(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderMarkdown(text) {
  let html = text
    .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code class="$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return html;
}

function toggleActive() {
  isActive = !isActive;
  if (toggleBtn) {
    toggleBtn.textContent = isActive ? 'Active' : 'Inactive';
    toggleBtn.className = isActive ? 'toggle-btn active' : 'toggle-btn inactive';
  }
  chrome.storage.local.set({ isActive });
}

function showTypingIndicator() {
  const indicator = document.createElement('div');
  indicator.id = 'typingIndicator';
  indicator.className = 'message assistant-message typing-indicator';
  indicator.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  chatContainer.appendChild(indicator);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function hideTypingIndicator() {
  const indicator = document.getElementById('typingIndicator');
  if (indicator) {
    indicator.remove();
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('.copy-btn.copied');
    if (btn) {
      btn.textContent = 'Copied!';
      setTimeout(() => {
        btn.textContent = 'Copy';
        btn.classList.remove('copied');
      }, 1500);
    }
  });
}

function displayMessage(role, content, timestamp = null) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}-message`;

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.innerHTML = renderMarkdown(content);

  messageDiv.appendChild(contentDiv);

  if (timestamp) {
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-timestamp';
    timeDiv.textContent = formatTimestamp(timestamp);
    messageDiv.appendChild(timeDiv);
  }

  if (role === 'assistant') {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => copyToClipboard(content));
    messageDiv.appendChild(copyBtn);
  }

  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function showError(message, retryCallback) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'message assistant-message error-message';
  errorDiv.innerHTML = `
    <div class="error-content">${message}</div>
    <button class="retry-btn">Retry</button>
  `;
  errorDiv.querySelector('.retry-btn').addEventListener('click', () => {
    errorDiv.remove();
    retryCallback();
  });
  chatContainer.appendChild(errorDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function showSettings() {
  if (settingsPanel) {
    settingsPanel.show();
  }
}

function hideSettings() {
  if (settingsPanel) {
    settingsPanel.hide();
  }
}

async function getPageHTML() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.scripting.executeScript(
          { target: { tabId: tabs[0].id }, func: () => document.documentElement.outerHTML },
          (results) => {
            resolve(results[0]?.result || '');
          }
        );
      } else {
        resolve('');
      }
    });
  });
}

async function getSelectedText() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.scripting.executeScript(
          { target: { tabId: tabs[0].id }, func: () => window.getSelection().toString() },
          (results) => {
            resolve(results[0]?.result || '');
          }
        );
      } else {
        resolve('');
      }
    });
  });
}

async function sendMessage(retries = 2) {
  const input = userInput.value.trim();
  if (!input) return;

  displayMessage('user', input, new Date().toISOString());
  await messageHistory.saveMessage('user', input);
  userInput.value = '';

  showTypingIndicator();
  isWaitingForResponse = true;
  sendBtn.disabled = true;

  const pageContent = await getPageHTML();
  const selectedText = await getSelectedText();

  const fullContent = `Page Content:\n${pageContent}\n\nSelected Text: ${selectedText}\n\nUser Input: ${input}`;

  const sendRequest = () => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'chat', content: fullContent }, (response) => {
        if (response) {
          resolve(response);
        } else {
          reject(new Error('No response from background script'));
        }
      });
    });
  };

  try {
    const response = await sendRequest();
    hideTypingIndicator();
    isWaitingForResponse = false;
    sendBtn.disabled = false;

    const content = response.summary || JSON.stringify(response, null, 2);
    displayMessage('assistant', content, new Date().toISOString());
    await messageHistory.saveMessage('assistant', content);
  } catch (error) {
    hideTypingIndicator();
    isWaitingForResponse = false;
    sendBtn.disabled = false;

    if (retries > 0) {
      showError(`Error: ${error.message}. Retrying...`, () => sendMessage(retries - 1));
    } else {
      showError(`Error: ${error.message}. Please try again.`, () => sendMessage(2));
    }
  }
}

async function loadHistory() {
  const history = await messageHistory.getHistory();
  for (const msg of history) {
    displayMessage(msg.role, msg.content, msg.timestamp);
  }
}

async function clearChat() {
  await messageHistory.clearHistory();
  chatContainer.innerHTML = '';
}

toggleBtn?.addEventListener('click', toggleActive);
sendBtn?.addEventListener('click', () => sendMessage(2));
clearChatBtn?.addEventListener('click', clearChat);
userInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.ctrlKey) {
    e.preventDefault();
    sendMessage(2);
  }
  if (e.key === 'Escape') {
    chrome.sidePanel.close();
  }
});

settingsBtn?.addEventListener('click', () => {
  if (settingsPanel) {
    settingsPanel.toggle();
  }
});

settingsPanel = new SettingsPanel('settingsPanel');
alert('SettingsPanel created');
settingsPanel.render();
alert('SettingsPanel rendered');

loadHistory();
alert('loadHistory completed');

chrome.storage.local.get(['isActive'], (result) => {
  if (result.isActive) {
    isActive = true;
    if (toggleBtn) {
      toggleBtn.textContent = 'Active';
      toggleBtn.className = 'toggle-btn active';
    }
  }
});