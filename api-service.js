// =============================================================================
// DEPRECATED / LEGACY — This module is currently UNUSED.
// background.js has its own inline callLLM() function and does NOT import this.
// Kept for reference or potential future refactor.
// =============================================================================

// Service object for OpenAI-compatible chat completions with streaming.
const ApiService = {

  // Send messages + systemPrompt to the LLM and return a parsed response object.
  // Streams the response, parsing SSE chunks until the stream ends.
  async sendToLLM(messages, systemPrompt) {
    // Load API settings from chrome.storage.sync.
    await Config.loadConfig();

    const url = `${Config.apiUrl}/chat/completions`;

    // Timeout controller — aborts the fetch if it takes too long.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Config.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: Config.getHeaders(),
        body: JSON.stringify({
          model: Config.model || 'gpt-5.5',
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages
          ],
          stream: true              // Enable server-sent event streaming
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Handle known HTTP error codes.
      if (response.status === 401) {
        throw new Error('Authentication failed. Please check your API key.');
      }
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      // Read the SSE stream chunk by chunk.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          // Each SSE line is prefixed with "data: ".
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;         // Stream termination signal
            try {
              const parsed = JSON.parse(data);
              // Accumulate delta content tokens from the response.
              if (parsed.choices?.[0]?.delta?.content) {
                fullContent += parsed.choices[0].delta.content;
              }
            } catch (e) {}                           // Ignore malformed chunks
          }
        }
      }

      return this.parseResponse(fullContent);
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout. Please try again.');
      }
      throw error;
    }
  },

  // Try to JSON-parse the raw LLM output. Falls back to extracting JSON
  // from markdown code fences if direct parsing fails.
  parseResponse(raw) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      // Look for a ```json ... ``` or ``` ... ``` fenced block.
      const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        try {
          return JSON.parse(match[1].trim());
        } catch (e2) {}                              // Give up on nested parse
      }
      throw new Error('Failed to parse LLM response');
    }
  },

  // Validate that the parsed response has the expected shape.
  validateResponse(data) {
    if (!data.summary) {
      throw new Error('Response missing required "summary" field');
    }
    if (!Array.isArray(data.actions)) {
      throw new Error('Response missing required "actions" array');
    }
    return true;
  }
};
