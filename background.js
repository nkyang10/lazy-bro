// Service worker — persists after popup is dismissed.
// Loads shared config and system prompt into global scope.
importScripts('config.js', 'system-prompt.js');

// Prevent concurrent chat requests from stacking.
let processing = false;

// Publish progress/result/error to chrome.storage so the
// popup (or a re-opened popup) can consume it in real-time.
function updateStatus(status, data = {}) {
  chrome.storage.local.set({ chatStatus: status, ...data });
}

// Try parsing the LLM response as JSON. Fall back to
// extracting a JSON block from markdown code fences.
function parseLLMResponse(raw) {
  try { return JSON.parse(raw); } catch {}
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) { try { return JSON.parse(match[1].trim()); } catch {} }
  return null;
}

// Grab the full DOM of the active tab.
// Returns empty string for chrome:// pages (scripting blocked).
async function getPageHTML() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0] || tabs[0].url?.startsWith('chrome://')) { resolve(''); return; }
      chrome.scripting.executeScript(
        { target: { tabId: tabs[0].id }, func: () => document.documentElement.outerHTML },
        (results) => resolve(results?.[0]?.result || '')
      );
    });
  });
}

// Grab any user-selected text on the active tab.
async function getSelectedText() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0] || tabs[0].url?.startsWith('chrome://')) { resolve(''); return; }
      chrome.scripting.executeScript(
        { target: { tabId: tabs[0].id }, func: () => window.getSelection().toString() },
        (results) => resolve(results?.[0]?.result || '')
      );
    });
  });
}

// Inject a click action into the active tab's MAIN world.
// Use MAIN (not ISOLATED) so the LLM's code can touch page-level variables.
async function executeClickAction(action) {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) { resolve(); return; }
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        world: 'MAIN',
        func: (code) => { try { eval(code); } catch (e) { console.error(e); } },
        args: [action.action]
      }, () => {
        if (chrome.runtime.lastError) console.error('Click error:', chrome.runtime.lastError);
        resolve();
      });
    });
  });
}

// Run an array of non-click actions (select / info) in the active tab.
async function executeActions(actions) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0] || tabs[0].url?.startsWith('chrome://')) return;
  for (const item of actions) {
    const code = typeof item === 'string' ? item : item.action;
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      world: 'MAIN',
      func: (c) => { try { eval(c); } catch (e) { console.error(e); } },
      args: [code]
    }, () => { if (chrome.runtime.lastError) console.error(chrome.runtime.lastError); });
  }
}

async function waitForPageReady() {
  const MAX_TIMEOUT = 5000;
  const POLL_INTERVAL = 150;

  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) { resolve(); return; }

      const tabId = tabs[0].id;
      const url = tabs[0].url || '';

      if (url.startsWith('chrome://')) { resolve(); return; }

      const startTime = Date.now();
      let intervalId = null;
      let resolved = false;

      const cleanup = () => {
        if (intervalId !== null) {
          clearInterval(intervalId);
          intervalId = null;
        }
      };

      const safeResolve = () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve();
      };

      intervalId = setInterval(() => {
        if (Date.now() - startTime >= MAX_TIMEOUT) {
          safeResolve();
          return;
        }

        chrome.scripting.executeScript(
          {
            target: { tabId: tabId },
            func: () => document.readyState
          },
          (results) => {
            if (chrome.runtime.lastError) {
              safeResolve();
              return;
            }
            const state = results?.[0]?.result;
            if (state === 'interactive' || state === 'complete') {
              safeResolve();
            }
          }
        );
      }, POLL_INTERVAL);
    });
  });
}

// Call the LLM chat/completions endpoint with the current messages array.
// Returns { content, reasoning } — reasoning is optional (DeepSeek R1/V4).
async function callLLM(messages) {
  await Config.loadConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Config.timeout);
  try {
    const url = `${Config.apiUrl}/chat/completions`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: Config.model || 'gpt-5.5',
        messages: messages
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`${resp.status} ${resp.statusText}: ${errText}`);
    }
    const data = await resp.json();
    const choice = data.choices?.[0]?.message;
    return {
      content: choice?.content || JSON.stringify(data),
      reasoning: choice?.reasoning_content || ''
    };
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

// Core multi-click loop:
// 1. Send current page DOM to LLM.
// 2. If LLM returns click action(s) → click, wait for page load, repeat.
// 3. If LLM returns select/info action(s) → run them, finish.
// 4. Every state change is published to chrome.storage so the popup can render.
async function processChatRequest(input) {
  if (processing) {
    updateStatus('idle', { chatError: 'A request is already in progress' });
    return;
  }
  processing = true;
  updateStatus('processing', { chatProgress: 'Fetching page context...', chatResult: null, chatError: null, chatReasoning: null, chatReason: null, chatActions: [] });

  try {
    await Config.loadConfig();
    await SystemPrompt.load();
    const multiClick = Config.multiClickEnabled;
    const maxClicks = Math.min(Config.maxClicks || 5, 10);

    updateStatus('processing', { chatProgress: 'Fetching page context...' });
    let pageContent = await getPageHTML();
    const selectedText = await getSelectedText();

    // userQuestion never contains DOM — DOM is in a separate system message.
    const userQuestion = `User Input: ${input}${selectedText ? '\n\nSelected Text: ' + selectedText : ''}`;
    let messages = [
      { role: 'system', content: SystemPrompt.base },
      { role: 'user', content: userQuestion },
      { role: 'system', content: `Current page DOM:\n${pageContent}` }
    ];

    let finalSummary = '';
    let finalActions = [];
    let clickCount = 0;
    let isFinalAction = false;

    // Loop: call LLM → parse → act → repeat until final.
    while (!isFinalAction) {
      updateStatus('processing', { chatProgress: 'Waiting for LLM response...' });
      let result = await callLLM(messages);
      let rawContent = result.content;

      if (result.reasoning) {
        updateStatus('processing', { chatProgress: 'Processing...', chatReasoning: result.reasoning });
      }

      const parsed = parseLLMResponse(rawContent);
      if (!parsed || !parsed.summary) {
        finalSummary = rawContent;
        break;
      }

      finalSummary = parsed.summary;
      finalActions = parsed.actions || [];
      const reason = parsed.reason || '';

      // Split clicks: final-clicks stop the loop; non-final continue.
      const clickActions = finalActions.filter(a => a && a.type === 'click' && !a.final);
      const finalClicks = finalActions.filter(a => a && a.type === 'click' && a.final);
      const hasAnyClick = clickActions.length > 0 || finalClicks.length > 0;

      if (multiClick && hasAnyClick && clickCount < maxClicks && !isFinalAction) {
        // Prioritize final-clicks over non-final.
        const clicksToRun = finalClicks.length > 0 ? finalClicks : clickActions;
        if (finalClicks.length > 0) isFinalAction = true;

        for (const clickAction of clicksToRun) {
          clickCount++;
          updateStatus('processing', { chatProgress: `Click ${clickCount}/${maxClicks}: ${clickAction.label || 'navigating...'}`, chatReason: reason });
          console.log('Clicking:', clickAction.label, clickAction.action, 'final:', clickAction.final);
          await executeClickAction(clickAction);

          updateStatus('processing', { chatProgress: 'Waiting for page to load...' });
          await waitForPageReady();
          pageContent = await getPageHTML();

          // Rebuild messages with fresh DOM. Only keep system prompt + user question + current DOM.
          const summary = `Clicked: ${clickAction.label}. ${clickAction.final ? 'This is the final page — answer now.' : 'Continue finding the answer. Clicks used: ${clickCount}/${maxClicks}.'}`;
          messages = [
            { role: 'system', content: SystemPrompt.base },
            { role: 'user', content: userQuestion },
            { role: 'system', content: `Current page after "${clickAction.label}":\n${pageContent}\n\nProgress: ${summary}` }
          ];
        }

        if (isFinalAction) {
          // After the final click, call LLM one more time on the destination page
          // to get the actual answer (select/info action).
          updateStatus('processing', { chatProgress: 'Waiting for page to load...' });
          await waitForPageReady();
          pageContent = await getPageHTML();
          messages = [
            { role: 'system', content: SystemPrompt.base },
            { role: 'user', content: userQuestion },
            { role: 'system', content: `Final page reached. Current page:\n${pageContent}\n\nAnswer the user's question based on this page. Use select or info action.` }
          ];
          const finalResult = await callLLM(messages);
          const finalParsed = parseLLMResponse(finalResult.content);
          if (finalParsed && finalParsed.summary) {
            finalSummary = finalParsed.summary;
            finalActions = finalParsed.actions || [];
          }
        } else {
          // Non-final click: call LLM again with the new page, loop continues.
          result = await callLLM(messages);
          rawContent = result.content;
          if (result.reasoning) {
            updateStatus('processing', { chatProgress: 'Processing...', chatReasoning: result.reasoning });
          }
        }
      }
      // Exit the while loop — if isFinalAction is still false, the next
      // iteration will make a fresh LLM call and re-evaluate.
      break;
    }

    // Run any remaining select/info actions on the final page.
    if (finalActions.length > 0) {
      const otherActions = finalActions.filter(a => !a || a.type !== 'click');
      if (otherActions.length > 0) {
        await executeActions(otherActions);
      }
    }

    updateStatus('done', { chatResult: finalSummary, chatProgress: 'Complete', chatActions: finalActions });

  } catch (error) {
    updateStatus('error', { chatError: error.message, chatProgress: 'Error' });
  } finally {
    processing = false;
  }
}

// Listen for chat messages from the popup.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'chat') {
    processChatRequest(message.input);
    sendResponse({ accepted: true });
  }
  return true;
});

// Initialize idle state on install.
chrome.runtime.onInstalled.addListener(() => {
  console.log('Lazy Browser extension initialized');
  chrome.storage.local.set({ chatStatus: 'idle' });
});