/**
 * Popup script for ThinkFiller AI
 * Controls popup UI events and interfaces with the Gemini API and active tab.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // UI Elements
  const detectedCountText = document.getElementById('detectedCount');
  const statusBadge = document.getElementById('statusBadge');
  const statusDot = statusBadge.querySelector('.status-dot');
  const profileBtns = document.querySelectorAll('.profile-btn');
  const customPromptContainer = document.getElementById('customPromptContainer');
  const customPromptInput = document.getElementById('customPrompt');
  const toggleSettingsBtn = document.getElementById('toggleSettingsBtn');
  const settingsCard = document.querySelector('.collapsible');
  const apiKeyInput = document.getElementById('apiKey');
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  const modelSelect = document.getElementById('modelSelect');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const fillFormBtn = document.getElementById('fillFormBtn');
  const btnSpinner = document.getElementById('btnSpinner');
  const consoleBox = document.getElementById('consoleBox');
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const previewContainer = document.getElementById('previewContainer');
  const previewList = document.getElementById('previewList');
  const injectDataBtn = document.getElementById('injectDataBtn');
  const regenerateDataBtn = document.getElementById('regenerateDataBtn');
  const copyDataBtn = document.getElementById('copyDataBtn');

  // State variables
  let activeTabId = null;
  let activeTabTitle = '';
  let scrapedFields = [];
  let currentProfile = 'positive';

  // 1. Initialize Settings and Scrape active page
  await loadSettings();
  await initScraper();

  // Theme Toggle Listener
  themeToggleBtn.addEventListener('click', async () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    await chrome.storage.local.set({ theme: newTheme });
    updateThemeIcon(newTheme);
  });

  // 2. Event Listeners for Profile Buttons
  profileBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      profileBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentProfile = btn.getAttribute('data-profile');
      
      // Save last used profile
      chrome.storage.local.set({ lastProfile: currentProfile });

      if (currentProfile === 'custom') {
        customPromptContainer.style.display = 'block';
      } else {
        customPromptContainer.style.display = 'none';
      }
      logMessage(`Switched profile to: ${currentProfile.toUpperCase()}`, 'info');
    });
  });

  // 3. Toggle API Settings Accordion
  toggleSettingsBtn.addEventListener('click', () => {
    settingsCard.classList.toggle('open');
  });

  // 4. Toggle API Key password visibility
  togglePasswordBtn.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      togglePasswordBtn.textContent = '🙈';
    } else {
      apiKeyInput.type = 'password';
      togglePasswordBtn.textContent = '👁';
    }
  });

  // 5. Save Settings
  saveSettingsBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    const model = modelSelect.value;
    const customPrompt = customPromptInput.value;

    chrome.storage.local.set({
      apiKey: apiKey,
      model: model,
      customPrompt: customPrompt
    }, () => {
      logMessage('Settings saved successfully.', 'success');
      settingsCard.classList.remove('open');
    });
  });

  // 6. Action Button Click (Main Flow - Generation only)
  fillFormBtn.addEventListener('click', generateAndShowPreview);
  regenerateDataBtn.addEventListener('click', generateAndShowPreview);

  async function generateAndShowPreview() {
    setLoadingState(true);
    clearLogs();
    previewContainer.classList.add('hidden');
    logMessage('Generating mock data with Gemini AI...', 'info');

    try {
      // Load current settings
      const settings = await getStoredData(['apiKey', 'model', 'customPrompt']);
      const apiKey = settings.apiKey;
      const model = settings.model || 'gemini-2.5-flash';
      const customPrompt = customPromptInput.value.trim();

      if (!apiKey) {
        throw new Error('Gemini API Key is not configured. Please expand API Settings and save your key.');
      }

      // Re-run scraper to ensure we have the latest form state
      logMessage('Analyzing active page fields...', 'info');
      await runScrapeAction();

      if (scrapedFields.length === 0) {
        throw new Error('No fillable input fields detected on the active tab page.');
      }

      logMessage(`Detected ${scrapedFields.length} fields. Prompting Gemini AI...`, 'ai');
      
      // Call Gemini API
      const generatedData = await window.GeminiService.generateFormData(
        apiKey,
        model,
        scrapedFields,
        currentProfile,
        customPrompt,
        activeTabTitle
      );

      logMessage('Received mock data from Gemini AI. Rendered preview below.', 'success');

      // Populate preview list
      previewList.innerHTML = '';
      scrapedFields.forEach(f => {
        const val = generatedData[f.thinkFillerId];
        if (val !== undefined) {
          const item = document.createElement('div');
          item.className = 'preview-item';
          
          const label = document.createElement('div');
          label.className = 'preview-label';
          label.innerText = f.label || f.name || f.thinkFillerId;
          
          let input;
          if (f.type === 'select' || f.type === 'select-multiple') {
            input = document.createElement('select');
            input.className = 'preview-input';
            input.setAttribute('data-id', f.thinkFillerId);
            if (f.type === 'select-multiple') {
              input.multiple = true;
            }
            
            if (f.options && f.options.length > 0) {
              f.options.forEach(opt => {
                const optionEl = document.createElement('option');
                optionEl.value = opt.value;
                optionEl.textContent = opt.text;
                
                // Determine if this option is selected
                if (f.type === 'select-multiple') {
                  const vals = Array.isArray(val) ? val : String(val).split(',').map(s => s.trim());
                  const isSelected = vals.some(v => {
                    const vLower = String(v).toLowerCase();
                    const optValLower = String(opt.value).toLowerCase();
                    const optTextLower = String(opt.text).toLowerCase();
                    return optValLower === vLower || optTextLower === vLower ||
                           (vLower && (optTextLower.includes(vLower) || vLower.includes(optTextLower) || optValLower.includes(vLower) || vLower.includes(optValLower)));
                  });
                  if (isSelected) {
                    optionEl.selected = true;
                  }
                } else {
                  const valLower = String(val).toLowerCase();
                  const optValLower = String(opt.value).toLowerCase();
                  const optTextLower = String(opt.text).toLowerCase();
                  if (optValLower === valLower || optTextLower === valLower ||
                      (valLower && (optTextLower.includes(valLower) || valLower.includes(optTextLower) || optValLower.includes(valLower) || valLower.includes(optValLower)))) {
                    optionEl.selected = true;
                  }
                }
                input.appendChild(optionEl);
              });
            } else {
              const optionEl = document.createElement('option');
              optionEl.value = val;
              optionEl.textContent = val;
              optionEl.selected = true;
              input.appendChild(optionEl);
            }
          } else {
            input = document.createElement('input');
            input.type = 'text';
            input.className = 'preview-input';
            input.value = val;
            input.setAttribute('data-id', f.thinkFillerId);
          }
          
          item.appendChild(label);
          item.appendChild(input);
          previewList.appendChild(item);
        }
      });

      // Show preview card
      previewContainer.classList.remove('hidden');

    } catch (error) {
      logMessage(error.message, 'error');
    } finally {
      setLoadingState(false);
    }
  }

  // 7. Inject Data Button Click (Fill form elements)
  injectDataBtn.addEventListener('click', async () => {
    injectDataBtn.disabled = true;
    const btnText = injectDataBtn.querySelector('.btn-text');
    const oldText = btnText.textContent;
    btnText.textContent = 'Filling form...';
    
    try {
      const finalData = {};
      previewList.querySelectorAll('.preview-input').forEach(input => {
        const id = input.getAttribute('data-id');
        let val;
        if (input.tagName.toLowerCase() === 'select' && input.multiple) {
          val = Array.from(input.selectedOptions).map(opt => opt.value);
        } else {
          val = input.value;
          if (val === 'true') val = true;
          if (val === 'false') val = false;
        }
        finalData[id] = val;
      });

      logMessage('Injecting data into page...', 'info');
      const fillResponse = await chrome.tabs.sendMessage(activeTabId, {
        action: 'fillForm',
        data: finalData,
        fields: scrapedFields
      });

      if (fillResponse && fillResponse.success) {
        const { filledCount, errors } = fillResponse.results;
        logMessage(`Successfully filled ${filledCount} fields!`, 'success');
        if (errors && errors.length > 0) {
          errors.forEach(err => logMessage(`Warning: ${err}`, 'warn'));
        }
      } else {
        throw new Error(fillResponse?.error || 'Failed to fill form fields.');
      }
    } catch (error) {
      logMessage(error.message, 'error');
    } finally {
      injectDataBtn.disabled = false;
      btnText.textContent = oldText;
    }
  });

  // 8. Copy Data Button Click (Copy preview values to clipboard as JSON)
  copyDataBtn.addEventListener('click', async () => {
    try {
      const finalData = {};
      previewList.querySelectorAll('.preview-input').forEach(input => {
        const id = input.getAttribute('data-id');
        let val;
        if (input.tagName.toLowerCase() === 'select' && input.multiple) {
          val = Array.from(input.selectedOptions).map(opt => opt.value);
        } else {
          val = input.value;
          if (val === 'true') val = true;
          if (val === 'false') val = false;
        }
        finalData[id] = val;
      });

      const jsonStr = JSON.stringify(finalData, null, 2);
      await navigator.clipboard.writeText(jsonStr);
      
      const btnText = copyDataBtn.querySelector('.btn-text');
      const oldText = btnText.textContent;
      btnText.textContent = 'Copied! ✔';
      setTimeout(() => {
        btnText.textContent = oldText;
      }, 1500);

      logMessage('Copied generated form data to clipboard as JSON.', 'success');
    } catch (err) {
      logMessage(`Failed to copy to clipboard: ${err.message}`, 'error');
    }
  });

  // --- Helper Functions ---

  /**
   * Load saved settings from Chrome Storage
   */
  async function loadSettings() {
    const data = await getStoredData(['apiKey', 'model', 'lastProfile', 'customPrompt', 'theme']);
    
    // Theme initialization
    const theme = data.theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcon(theme);

    if (data.apiKey) {
      apiKeyInput.value = data.apiKey;
    }
    if (data.model) {
      modelSelect.value = data.model;
    }
    if (data.lastProfile) {
      currentProfile = ['positive', 'negative', 'custom'].includes(data.lastProfile) ? data.lastProfile : 'positive';
      // Activate correct button
      profileBtns.forEach(btn => {
        if (btn.getAttribute('data-profile') === currentProfile) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
      if (currentProfile === 'custom') {
        customPromptContainer.style.display = 'block';
      } else {
        customPromptContainer.style.display = 'none';
      }
    }
    if (data.customPrompt) {
      customPromptInput.value = data.customPrompt;
    }
  }

  /**
   * Initialize scraping on popup load
   */
  async function initScraper() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        updateStatusBadge('No Tab', 'red', 'No active tab found');
        fillFormBtn.disabled = true;
        return;
      }

      activeTabId = tab.id;
      activeTabTitle = tab.title;

      // Check for restricted URLs (system pages)
      const url = tab.url || '';
      if (url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:') || url.startsWith('chrome-extension://')) {
        updateStatusBadge('Restricted', 'red', 'System page');
        logMessage('Cannot run extensions on browser system pages.', 'error');
        fillFormBtn.disabled = true;
        return;
      }

      // Execute Scrape Action
      await runScrapeAction();
    } catch (error) {
      console.error(error);
      logMessage(`Init failed: ${error.message}`, 'error');
      updateStatusBadge('Error', 'red', 'Initialization failed');
    }
  }

  /**
   * Scrapes active page by injecting content script if needed.
   */
  async function runScrapeAction() {
    try {
      let response;
      try {
        // Attempt to message active tab
        response = await chrome.tabs.sendMessage(activeTabId, { action: 'scrapeForm' });
      } catch (err) {
        // Script might not be injected. Try injecting manually
        logMessage('Content script not active. Injecting scraper...', 'info');
        await chrome.scripting.executeScript({
          target: { tabId: activeTabId },
          files: ['scripts/content.js']
        });
        // Wait briefly for script load
        await new Promise(resolve => setTimeout(resolve, 150));
        // Retry scrape message
        response = await chrome.tabs.sendMessage(activeTabId, { action: 'scrapeForm' });
      }

      if (response && response.success) {
        scrapedFields = response.fields;
        const count = scrapedFields.length;
        if (count > 0) {
          updateStatusBadge(`${count} Inputs`, 'green', 'Form fields detected');
          fillFormBtn.disabled = false;
          logMessage(`Scanned page: ${count} inputs found. Ready to fill.`, 'success');
        } else {
          updateStatusBadge('0 Inputs', 'orange', 'No form elements found');
          fillFormBtn.disabled = true;
          logMessage('No form elements detected on this page. Navigate to a form page.', 'warn');
        }
      } else {
        throw new Error('Failed to scrape inputs.');
      }
    } catch (error) {
      console.error(error);
      updateStatusBadge('Error', 'red', 'Failed to scan page');
      logMessage(`Scan error: ${error.message}. Make sure the page is fully loaded.`, 'error');
      fillFormBtn.disabled = true;
    }
  }

  /**
   * Updates status indicator badge at top
   */
  function updateStatusBadge(text, colorClass, titleText) {
    detectedCountText.textContent = text;
    statusBadge.title = titleText;
    statusDot.className = 'status-dot';
    statusDot.classList.add(colorClass);
  }

  /**
   * Log messages to extension console UI
   */
  function logMessage(text, type = 'info') {
    const line = document.createElement('div');
    line.className = `console-line ${type}-msg`;
    
    // Add prefix
    let prefix = '';
    if (type === 'success') prefix = '✔ ';
    if (type === 'error') prefix = '✖ [ERROR] ';
    if (type === 'warn') prefix = '⚠ [WARN] ';
    if (type === 'ai') prefix = '✨ [AI] ';
    if (type === 'info') prefix = 'ℹ ';

    line.textContent = `${prefix}${text}`;
    consoleBox.appendChild(line);
    consoleBox.scrollTop = consoleBox.scrollHeight;
  }

  /**
   * Clear all console logs
   */
  function clearLogs() {
    consoleBox.innerHTML = '';
  }

  /**
   * Sets the UI button loading state
   */
  function setLoadingState(isLoading) {
    if (isLoading) {
      fillFormBtn.disabled = true;
      btnSpinner.classList.remove('hidden');
      fillFormBtn.querySelector('.btn-text').textContent = 'Generating...';
    } else {
      fillFormBtn.disabled = false;
      btnSpinner.classList.add('hidden');
      fillFormBtn.querySelector('.btn-text').textContent = 'Generate Mock Data';
    }
  }

  /**
   * Update the theme button icon based on the current theme.
   */
  function updateThemeIcon(theme) {
    themeToggleBtn.textContent = theme === 'dark' ? '🌙' : '☀️';
  }

  /**
   * Promisified chrome.storage.local helper
   */
  function getStoredData(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (result) => {
        resolve(result);
      });
    });
  }
});
