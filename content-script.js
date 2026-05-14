// LEGACY / DEPRECATED — content script injected into every page.
// Current architecture uses chrome.scripting.executeScript from the
// service worker (background.js) instead of message-passing through
// content scripts. Kept for reference; the allow-list validation
// pattern may be useful if sandboxing is re-introduced later.

// Original allow-list for DOM operations the LLM could request.
const ALLOWED_ACTIONS = [
  'alert',
  'prompt',
  'console.log',
  'querySelector',
  'querySelectorAll',
  'getElementById',
  'getElementsByClassName',
  'getElementsByTagName',
  'createElement',
  'removeChild',
  'appendChild',
  'innerHTML',
  'textContent',
  'style'
];

// Check whether an action string contains at least one allowed API name.
function validateAction(action) {
  for (const allowed of ALLOWED_ACTIONS) {
    if (action.includes(allowed)) {
      return true;
    }
  }
  return false;
}

window.getPageHTML = function() {
  return document.documentElement.outerHTML;
};

window.getSelectedText = function() {
  return window.getSelection().toString();
};

window.executeAction = function(action) {
  if (!validateAction(action)) {
    console.warn('Action not allowed:', action);
    return { success: false, error: 'Action not in allowlist' };
  }

  try {
    const result = eval(action);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
};