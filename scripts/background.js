/**
 * Background script for ThinkFiller AI
 * Listens for keyboard commands and triggers quick-filling.
 */

// Import GeminiService
importScripts('../utils/gemini-api.js');

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'fill-last-profile') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      
      const url = tab.url || '';
      if (url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:') || url.startsWith('chrome-extension://')) {
        return;
      }

      // Check if script is injected by sending a test message
      let isScriptActive = false;
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
        isScriptActive = true;
      } catch (e) {
        // Not active, need injection
      }

      if (!isScriptActive) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['scripts/content.js']
        });
        await new Promise(r => setTimeout(r, 150));
      }

      // Retrieve settings
      const data = await chrome.storage.local.get(['apiKey', 'model', 'lastProfile', 'customPrompt']);
      const apiKey = data.apiKey;
      const model = data.model || 'gemini-2.5-flash';
      const profile = data.lastProfile || 'positive';
      const customPrompt = data.customPrompt || '';

      if (!apiKey) {
        chrome.tabs.sendMessage(tab.id, {
          action: 'showToast',
          text: 'ThinkFiller AI: API Key is not configured. Please open extension popup to save it.',
          type: 'error'
        });
        return;
      }

      // Show "Analyzing..." toast
      chrome.tabs.sendMessage(tab.id, {
        action: 'showToast',
        text: '⚡ ThinkFiller AI: Scrape-analyzing form inputs...',
        type: 'info'
      });

      // Scrape form
      const scrapeRes = await chrome.tabs.sendMessage(tab.id, { action: 'scrapeForm' });
      if (!scrapeRes || !scrapeRes.success || scrapeRes.fields.length === 0) {
        chrome.tabs.sendMessage(tab.id, {
          action: 'showToast',
          text: 'ThinkFiller AI: No fillable input fields detected on page.',
          type: 'warn'
        });
        return;
      }

      // Show "Generating..." toast
      chrome.tabs.sendMessage(tab.id, {
        action: 'showToast',
        text: `⚡ ThinkFiller AI: Contacting Gemini AI (${profile.toUpperCase()})...`,
        type: 'ai'
      });

      // Call API
      const generatedData = await GeminiService.generateFormData(
        apiKey,
        model,
        scrapeRes.fields,
        profile,
        customPrompt,
        tab.title
      );

      // Fill Form
      const fillRes = await chrome.tabs.sendMessage(tab.id, {
        action: 'fillForm',
        data: generatedData
      });

      if (fillRes && fillRes.success) {
        const { filledCount } = fillRes.results;
        chrome.tabs.sendMessage(tab.id, {
          action: 'showToast',
          text: `✔ ThinkFiller AI: Injected data into ${filledCount} fields successfully!`,
          type: 'success'
        });
      } else {
        throw new Error('Form filling script rejected the inputs.');
      }

    } catch (err) {
      console.error(err);
      // Send error toast to page
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'showToast',
            text: `✖ ThinkFiller AI Error: ${err.message}`,
            type: 'error'
          });
        }
      } catch (_) {}
    }
  }
});
