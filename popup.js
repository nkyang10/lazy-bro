// Popup UI layer — delegates all LLM/action work to background.js.
// Reads progress/results/errors from chrome.storage.local.
// Survives dismiss: on reopen, loadPendingResult() restores state.

let isActive = false;
let settingsPanel;
let isWaitingForResponse = false;
let lastDisplayedContent = '';
const toggleBtn = document.getElementById('toggleBtn');
const sendBtn = document.getElementById('sendBtn');
const userInput = document.getElementById('userInput');
const chatContainer = document.getElementById('chatContainer');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanelContainer = document.getElementById('settingsPanel');
const clearChatBtn = document.getElementById('clearChatBtn');

// Format an ISO timestamp to HH:MM.
function formatTimestamp(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Lightweight markdown → HTML for chat messages.
function renderMarkdown(text) {
  let html = text
    .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code class="$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return html;
}

// Toggle the extension active/inactive state (stored in chrome.storage).
function toggleActive() {
  isActive = !isActive;
  if (toggleBtn) {
    toggleBtn.textContent = isActive ? 'Active' : 'Inactive';
    toggleBtn.className = isActive ? 'toggle-btn active' : 'toggle-btn inactive';
  }
  chrome.storage.local.set({ isActive });
}

// Animated three-dot typing indicator.
function showTypingIndicator() {
  const indicator = document.createElement('div');
  indicator.id = 'typingIndicator';
  indicator.className = 'message assistant-message typing-indicator';
  indicator.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  chatContainer.appendChild(indicator);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function appendBeforeTyping(el) {
  const typing = document.getElementById('typingIndicator');
  if (typing) {
    chatContainer.insertBefore(el, typing);
  } else {
    chatContainer.appendChild(el);
  }
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function hideTypingIndicator() {
  const indicator = document.getElementById('typingIndicator');
  if (indicator) indicator.remove();
}

// Copy assistant message text to clipboard.
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('.copy-btn.copied');
    if (btn) {
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
    }
  });
}

// Add a chat bubble (user or assistant) to the scrollable container.
function displayMessage(role, content, timestamp = null) {
  if (!content) return;
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
  // Assistant messages get a copy button.
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

// Show a red error card with a Retry button.
function showError(message, retryCallback) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'message assistant-message error-message';
  errorDiv.innerHTML = `<div class="error-content">${message}</div><button class="retry-btn">Retry</button>`;
  errorDiv.querySelector('.retry-btn').addEventListener('click', () => {
    errorDiv.remove();
    retryCallback();
  });
  chatContainer.appendChild(errorDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Transient status indicator (e.g. "Click 2/5: navigating...").
function showStatus(text) {
  const existing = document.getElementById('statusIndicator');
  if (existing) existing.remove();
  const statusDiv = document.createElement('div');
  statusDiv.id = 'statusIndicator';
  statusDiv.className = 'message assistant-message';
  statusDiv.style.cssText = 'font-size:11px;color:#888;align-self:center;padding:6px 12px;border-radius:16px;';
  statusDiv.textContent = text;
  appendBeforeTyping(statusDiv);
}

function hideStatus() {
  const existing = document.getElementById('statusIndicator');
  if (existing) existing.remove();
}

// Small italic note showing the LLM's decision reason (from "reason" field).
function showReason(text) {
  if (!text) return;
  const div = document.createElement('div');
  div.className = 'message assistant-message';
  div.style.cssText = 'font-size:11px;color:#888;align-self:center;padding:4px 10px;border-radius:12px;font-style:italic;max-width:90%;';
  div.textContent = text;
  appendBeforeTyping(div);
}

// Collapsible reasoning/chain-of-thought from the LLM (truncated at 500 chars).
function displayReasoning(text) {
  if (!text) return;
  const maxPreview = 500;
  const truncated = text.length > maxPreview;
  const preview = truncated ? text.slice(0, maxPreview) + '...' : text;
  const div = document.createElement('div');
  div.className = 'message reasoning-message';
  div.style.cssText = 'max-width:95%;align-self:center;padding:8px 12px;font-size:11px;line-height:1.4;';
  const fullText = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const previewText = preview.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (truncated) {
    div.innerHTML = `<details><summary style="cursor:pointer;color:#888;font-weight:500;">Reasoning (${text.length} chars)</summary><div style="margin-top:6px;color:#999;white-space:pre-wrap;max-height:200px;overflow-y:auto;">${previewText}<br><br><em style="color:#aaa;">...truncated. Full length: ${text.length} chars</em></div></details>`;
  } else {
    div.innerHTML = `<details><summary style="cursor:pointer;color:#888;font-weight:500;">Reasoning</summary><div style="margin-top:6px;color:#999;white-space:pre-wrap;">${previewText}</div></details>`;
  }
  appendBeforeTyping(div);
}
// chrome.storage.onChanged handler — renders real-time progress from background.js.
// Fires whenever the background updates chatStatus, chatProgress, chatResult, etc.
function handleStorageChange(changes) {
  if (changes.chatProgress && changes.chatProgress.newValue) {
    showStatus(changes.chatProgress.newValue);
  }
  if (changes.chatReasoning && changes.chatReasoning.newValue) {
    displayReasoning(changes.chatReasoning.newValue);
  }
  if (changes.chatReason && changes.chatReason.newValue) {
    showReason(changes.chatReason.newValue);
  }
  if (changes.chatStepSummary && changes.chatStepSummary.newValue) {
    const content = changes.chatStepSummary.newValue;
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant-message';
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = renderMarkdown(content);
    messageDiv.appendChild(contentDiv);
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => copyToClipboard(content));
    messageDiv.appendChild(copyBtn);
    appendBeforeTyping(messageDiv);
    lastDisplayedContent = content;
    chrome.storage.local.set({ chatStepSummary: null });
  }
  if (changes.chatResult && changes.chatResult.newValue) {
    hideTypingIndicator();
    hideStatus();
    isWaitingForResponse = false;
    sendBtn.disabled = false;
    const content = changes.chatResult.newValue;
    if (content !== lastDisplayedContent) {
      displayMessage('assistant', content, new Date().toISOString());
    }
    messageHistory.saveMessage('assistant', content);
    lastDisplayedContent = '';
    chrome.storage.local.set({ chatStatus: 'idle', chatProgress: null, chatResult: null, chatReasoning: null, chatReason: null });
  }
  if (changes.chatError && changes.chatError.newValue) {
    hideTypingIndicator();
    hideStatus();
    isWaitingForResponse = false;
    sendBtn.disabled = false;
    showError(changes.chatError.newValue, () => sendMessage(2));
    chrome.storage.local.set({ chatStatus: 'idle', chatProgress: null, chatError: null });
  }
}

// Called on popup open. Restores in-flight or completed results
// if the background is still processing or finished while popup was closed.
async function loadPendingResult() {
  const { chatStatus, chatResult, chatProgress, chatError, chatStepSummary } = await chrome.storage.local.get(['chatStatus', 'chatResult', 'chatProgress', 'chatError', 'chatStepSummary']);
  if (chatStepSummary) {
    displayMessage('assistant', chatStepSummary, new Date().toISOString());
    lastDisplayedContent = chatStepSummary;
    chrome.storage.local.set({ chatStepSummary: null });
  }
  if (chatStatus === 'processing' && chatProgress) {
    showTypingIndicator();
    isWaitingForResponse = true;
    sendBtn.disabled = true;
    showStatus(chatProgress);
  }
  if (chatStatus === 'done' && chatResult) {
    if (chatResult !== lastDisplayedContent) {
      displayMessage('assistant', chatResult, new Date().toISOString());
    }
    await messageHistory.saveMessage('assistant', chatResult);
    lastDisplayedContent = '';
    chrome.storage.local.set({ chatStatus: 'idle', chatResult: null, chatProgress: null });
  }
  if (chatStatus === 'error' && chatError) {
    showError(chatError, () => sendMessage(2));
    chrome.storage.local.set({ chatStatus: 'idle', chatError: null });
  }
}

// Thin wrapper: sends the user message to background.js and lets
// the storage-change listener render progress and results.
// The popup can be closed — background continues independently.
async function sendMessage(retries = 2) {
  const input = userInput.value.trim();
  if (!input) return;

  displayMessage('user', input, new Date().toISOString());
  await messageHistory.saveMessage('user', input);
  userInput.value = '';

  showTypingIndicator();
  isWaitingForResponse = true;
  sendBtn.disabled = true;
  showStatus('Starting...');

  chrome.runtime.sendMessage({ type: 'chat', input }, (response) => {
    if (!response || !response.accepted) {
      hideTypingIndicator();
      hideStatus();
      isWaitingForResponse = false;
      sendBtn.disabled = false;
      showError('Background service worker not available. Reload the extension.', () => sendMessage(2));
    }
  });
}

// Load persisted chat history from history.js on popup open.
async function loadHistory() {
  const history = await messageHistory.getHistory();
  for (const msg of history) {
    displayMessage(msg.role, msg.content, msg.timestamp);
  }
}

async function clearChat() {
  await messageHistory.clearHistory();
  chatContainer.innerHTML = '';
  lastDisplayedContent = '';
}

// --- Event bindings ---

toggleBtn?.addEventListener('click', toggleActive);
sendBtn?.addEventListener('click', () => sendMessage(2));
clearChatBtn?.addEventListener('click', clearChat);
userInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage(2);
  }
});

settingsBtn?.addEventListener('click', () => {
  if (settingsPanel) {
    settingsPanel.toggle();
    settingsPanelContainer.classList.toggle('show');
  }
});

// --- Initialisation ---

settingsPanel = new SettingsPanel('settingsPanel');
settingsPanel.render();

// Listen for storage changes from background.js.
chrome.storage.onChanged.addListener(handleStorageChange);

loadHistory();
loadPendingResult();

chrome.storage.local.get(['isActive'], (result) => {
  if (result.isActive) {
    isActive = true;
    if (toggleBtn) {
      toggleBtn.textContent = 'Active';
      toggleBtn.className = 'toggle-btn active';
    }
  }
});