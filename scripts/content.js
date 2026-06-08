/**
 * Content script for ThinkFiller AI
 * Responsible for scraping inputs on the active page and injecting data.
 */

(function () {
  // Listen for messages from the popup or background service worker
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'ping') {
      sendResponse({ success: true, status: 'ready' });
    } else if (request.action === 'scrapeForm') {
      const fields = scrapeActiveForm();
      sendResponse({ success: true, fields: fields });
    } else if (request.action === 'fillForm') {
      fillFormFields(request.data).then(results => {
        sendResponse({ success: true, results: results });
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true; // Keep message channel open for async response
    } else if (request.action === 'showToast') {
      showToast(request.text, request.type);
      sendResponse({ success: true });
    }
    return true; // Keep message channel open for async response
  });

  /**
   * Scrapes all visible and editable input, select, and textarea fields on the page.
   */
  function scrapeActiveForm() {
    const selector = 'input:not([type="hidden"]):not([type="submit"]):not([type="reset"]):not([type="button"]):not([type="image"]):not([type="file"]), textarea, select';
    let elements = Array.from(document.querySelectorAll(selector));

    // Sort elements visually: top-to-bottom, then left-to-right
    elements.sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      const topA = rectA.top + window.scrollY;
      const topB = rectB.top + window.scrollY;
      const leftA = rectA.left + window.scrollX;
      const leftB = rectB.left + window.scrollX;

      // If elements are on the same vertical line (within 15px), sort left-to-right
      if (Math.abs(topA - topB) < 15) {
        return leftA - leftB;
      }
      return topA - topB;
    });

    const fields = [];
    const radioGroups = {};
    let idCounter = 1;

    elements.forEach((element) => {
      // Check if element is visible and not read-only
      if (element.readOnly) return;
      
      const rect = element.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(element).display !== 'none';
      if (!isVisible) return;

      const tagName = element.tagName.toLowerCase();
      const type = tagName === 'select' ? 'select' : (tagName === 'textarea' ? 'textarea' : element.type);

      // Group radio buttons by name
      if (type === 'radio' && element.name) {
        const groupName = element.name;
        
        if (!radioGroups[groupName]) {
          const groupLabel = findRadioGroupLabel(element);
          let thinkFillerId = element.getAttribute('data-thinkfiller-radio-group-id');
          if (!thinkFillerId) {
            thinkFillerId = `tf_radio_group_${groupName}_${Math.random().toString(36).substring(2, 7)}`;
          }

          radioGroups[groupName] = {
            thinkFillerId: thinkFillerId,
            id: '',
            name: groupName,
            type: 'radio',
            placeholder: '',
            label: groupLabel || groupName,
            required: false,
            tagName: 'input',
            options: []
          };
          fields.push(radioGroups[groupName]);
        }

        element.setAttribute('data-thinkfiller-radio-group-id', radioGroups[groupName].thinkFillerId);

        if (element.required) {
          radioGroups[groupName].required = true;
        }

        const optionLabel = findLabelText(element) || element.value;
        radioGroups[groupName].options.push({
          value: element.value,
          text: optionLabel
        });
        
        return; // Skip standard field generation for grouped radios
      }

      // Assign a temporary unique ID for injection targeting
      let thinkFillerId = element.getAttribute('data-thinkfiller-id');
      if (!thinkFillerId) {
        thinkFillerId = `tf_${idCounter++}_${Math.random().toString(36).substring(2, 7)}`;
        element.setAttribute('data-thinkfiller-id', thinkFillerId);
      }

      // Try to find the label text
      const labelText = findLabelText(element);
      
      // Get field metadata
      const fieldData = {
        thinkFillerId: thinkFillerId,
        id: element.id || '',
        name: element.name || '',
        type: type,
        placeholder: element.placeholder || '',
        label: labelText,
        required: element.required || false,
        value: element.value || '',
        tagName: tagName
      };

      // If it's a select, extract the options so the AI knows what choices are valid
      if (type === 'select') {
        fieldData.options = Array.from(element.options)
          .filter(opt => opt.value !== '')
          .map(opt => ({
            value: opt.value,
            text: opt.text.trim()
          }));
        if (element.multiple) {
          fieldData.type = 'select-multiple';
        }
      }

      fields.push(fieldData);
    });

    return fields;
  }

  /**
   * Helper to find the label of a radio group.
   */
  function findRadioGroupLabel(radioElement) {
    const fieldset = radioElement.closest('fieldset');
    if (fieldset) {
      const legend = fieldset.querySelector('legend');
      if (legend && legend.innerText.trim()) {
        return legend.innerText.trim();
      }
    }
    
    let parent = radioElement.parentElement;
    let depth = 0;
    while (parent && depth < 3) {
      let sibling = parent.previousElementSibling;
      while (sibling) {
        if (['label', 'span', 'p', 'h3', 'h4', 'h5', 'legend'].includes(sibling.tagName.toLowerCase()) && sibling.innerText.trim()) {
          return sibling.innerText.trim();
        }
        sibling = sibling.previousElementSibling;
      }
      parent = parent.parentElement;
      depth++;
    }

    return radioElement.name
      .replace(/[-_]/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  /**
   * Helper to find label text associated with an element.
   */
  function findLabelText(element) {
    // 1. Check if the element has an ID and there's a <label for="ID">
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label && label.innerText.trim()) {
        return label.innerText.trim();
      }
    }

    // 2. Check if the element is nested inside a <label>
    const parentLabel = element.closest('label');
    if (parentLabel && parentLabel.innerText.trim()) {
      // Get text node content only (excluding the input's own text if any, but innerText is usually fine)
      return parentLabel.innerText.replace(element.value || '', '').trim();
    }

    // 3. Check for aria-label or aria-labelledby
    if (element.getAttribute('aria-label')) {
      return element.getAttribute('aria-label').trim();
    }
    const ariaLabelledBy = element.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const labelElement = document.getElementById(ariaLabelledBy);
      if (labelElement && labelElement.innerText.trim()) {
        return labelElement.innerText.trim();
      }
    }

    // 4. Try to find a preceding text node or label nearby (useful for simple inline forms)
    let sibling = element.previousElementSibling;
    while (sibling) {
      if (sibling.tagName.toLowerCase() === 'label' && sibling.innerText.trim()) {
        return sibling.innerText.trim();
      }
      sibling = sibling.previousElementSibling;
    }

    // 5. Fallback to name or placeholder or type
    if (element.placeholder) {
      return `[Placeholder] ${element.placeholder}`;
    }
    if (element.name) {
      // Beautify name (e.g. first_name -> First Name)
      return element.name
        .replace(/[-_]/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
    }

    return '';
  }

  /**
   * Fills form fields with values generated by AI.
   */
  async function fillFormFields(data) {
    const filled = [];
    const errors = [];

    // Query all inputs in visual order to fill them sequentially
    const selector = 'input:not([type="hidden"]):not([type="submit"]):not([type="reset"]):not([type="button"]):not([type="image"]):not([type="file"]), textarea, select';
    let elements = Array.from(document.querySelectorAll(selector));
    
    // Sort elements visually: top-to-bottom, then left-to-right
    elements.sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      const topA = rectA.top + window.scrollY;
      const topB = rectB.top + window.scrollY;
      const leftA = rectA.left + window.scrollX;
      const leftB = rectB.left + window.scrollX;
      
      if (Math.abs(topA - topB) < 15) {
        return leftA - leftB;
      }
      return topA - topB;
    });

    for (const element of elements) {
      if (element.readOnly) continue;
      
      const rect = element.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(element).display !== 'none';
      if (!isVisible) continue;

      // Check if this element belongs to a radio group
      const radioGroupId = element.getAttribute('data-thinkfiller-radio-group-id');
      const thinkFillerId = radioGroupId || element.getAttribute('data-thinkfiller-id');
      
      if (!thinkFillerId || !(thinkFillerId in data)) {
        continue;
      }

      const value = data[thinkFillerId];

      // Prevent filling a radio group multiple times
      if (filled.includes(thinkFillerId)) {
        continue;
      }

      if (thinkFillerId.startsWith('tf_radio_group_')) {
        // Handle grouped radio buttons
        const radios = document.querySelectorAll(`input[type="radio"][data-thinkfiller-radio-group-id="${thinkFillerId}"]`);
        if (radios.length === 0) {
          errors.push(`Radio group not found: ${thinkFillerId}`);
          continue;
        }

        try {
          let matched = false;
          radios.forEach(radio => {
            const labelText = findLabelText(radio) || '';
            const isValueMatch = radio.value === String(value);
            const isLabelMatch = labelText.toLowerCase() === String(value).toLowerCase();
            const isLabelPartial = labelText.toLowerCase().includes(String(value).toLowerCase());
            
            if (isValueMatch || isLabelMatch || isLabelPartial) {
              if (!radio.checked) {
                radio.checked = true;
                triggerEvents(radio, ['click', 'change']);
              }
              matched = true;
            }
          });

          if (!matched) {
            if (typeof value === 'boolean' || value === 'true') {
              if (radios[0] && !radios[0].checked) {
                radios[0].checked = true;
                triggerEvents(radios[0], ['click', 'change']);
                matched = true;
              }
            }
          }

          if (matched) {
            filled.push(thinkFillerId);
            // Wait brief moment for events to register in frameworks
            await new Promise(resolve => setTimeout(resolve, 100));
          } else {
            errors.push(`Could not match radio option "${value}" for group: ${thinkFillerId}`);
          }
        } catch (err) {
          errors.push(`Error filling radio group ${thinkFillerId}: ${err.message}`);
        }
      } else {
        // Standard elements
        try {
          const tagName = element.tagName.toLowerCase();
          
          // If it is a select dropdown, check if it's disabled or empty, and wait/poll up to 2 seconds for it to update
          if (tagName === 'select') {
            const targetValStr = String(value).trim().toLowerCase();
            for (let retry = 0; retry < 20; retry++) {
              let hasOption = false;
              for (let i = 0; i < element.options.length; i++) {
                const opt = element.options[i];
                const optVal = opt.value.trim().toLowerCase();
                const optText = opt.text.trim().toLowerCase();
                if (optVal === targetValStr || optText === targetValStr || optText.includes(targetValStr) || targetValStr.includes(optText)) {
                  hasOption = true;
                  break;
                }
              }

              // If it's enabled and has the option (or at least has more than 1 option populated), stop waiting
              if (!element.disabled && (hasOption || element.options.length > 1)) {
                break;
              }
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }

          setElementValue(element, value);
          filled.push(thinkFillerId);

          // Wait brief moment (100ms) for framework binding/updating before processing next element
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
          errors.push(`Error filling ${thinkFillerId}: ${err.message}`);
        }
      }
    }

    return { filledCount: filled.length, errors: errors };
  }

  /**
   * Set values on individual elements and trigger framework events.
   */
  function setElementValue(element, value) {
    const tagName = element.tagName.toLowerCase();
    const type = element.type;

    if (tagName === 'textarea' || (tagName === 'input' && type !== 'checkbox' && type !== 'radio')) {
      // Standard text/number/date fields
      element.value = value;
      triggerEvents(element, ['input', 'change', 'blur']);
    } else if (tagName === 'select') {
      // Select dropdowns
      if (element.multiple) {
        // Handle select-multiple
        const valuesToSelect = Array.isArray(value)
          ? value.map(String)
          : String(value).split(',').map(s => s.trim());

        for (let i = 0; i < element.options.length; i++) {
          const opt = element.options[i];
          const isMatch = valuesToSelect.some(val => 
            opt.value === val || 
            opt.text.trim().toLowerCase() === val.toLowerCase() ||
            opt.text.trim().toLowerCase().includes(val.toLowerCase())
          );
          opt.selected = isMatch;
        }
        triggerEvents(element, ['change', 'blur']);
      } else {
        // Standard single select
        let matched = false;
        let valStr = String(value).trim();
        // Clean any accidental surrounding quotes from Gemini
        if ((valStr.startsWith('"') && valStr.endsWith('"')) || (valStr.startsWith("'") && valStr.endsWith("'"))) {
          valStr = valStr.substring(1, valStr.length - 1).trim();
        }
        valStr = valStr.toLowerCase();

        // 1. Exact value or text match (case-insensitive)
        for (let i = 0; i < element.options.length; i++) {
          const opt = element.options[i];
          const optVal = opt.value.trim().toLowerCase();
          const optText = opt.text.trim().toLowerCase();
          
          if (optVal === valStr || optText === valStr) {
            element.selectedIndex = i;
            opt.selected = true;
            element.value = opt.value;
            matched = true;
            break;
          }
        }

        // 2. Partial text match or partial value match
        if (!matched && valStr) {
          for (let i = 0; i < element.options.length; i++) {
            const opt = element.options[i];
            const optVal = opt.value.trim().toLowerCase();
            const optText = opt.text.trim().toLowerCase();
            
            if (optText.includes(valStr) || valStr.includes(optText) || optVal.includes(valStr) || valStr.includes(optVal)) {
              element.selectedIndex = i;
              opt.selected = true;
              element.value = opt.value;
              matched = true;
              break;
            }
          }
        }

        // 3. Smart Fallback: if no match found, select the first valid option to prevent breaking dependencies
        if (!matched && element.options.length > 0) {
          let fallbackOpt = null;
          let fallbackIndex = -1;
          for (let i = 0; i < element.options.length; i++) {
            if (element.options[i].value !== '') {
              fallbackOpt = element.options[i];
              fallbackIndex = i;
              break;
            }
          }
          if (!fallbackOpt && element.options[0]) {
            fallbackOpt = element.options[0];
            fallbackIndex = 0;
          }

          if (fallbackOpt) {
            element.selectedIndex = fallbackIndex;
            fallbackOpt.selected = true;
            element.value = fallbackOpt.value;
            matched = true;
            console.warn(`ThinkFiller AI: No match for "${value}" in select, fell back to "${fallbackOpt.text}"`);
          }
        }
        triggerEvents(element, ['change', 'blur']);
      }
    } else if (type === 'checkbox') {
      // Checkboxes
      const shouldBeChecked = value === true || value === 'true' || value === 1 || value === '1' || String(value).toLowerCase() === 'yes' || String(value).toLowerCase() === 'checked';
      if (element.checked !== shouldBeChecked) {
        element.checked = shouldBeChecked;
        triggerEvents(element, ['click', 'change']);
      }
    } else if (type === 'radio') {
      // Un-grouped radio buttons fallback
      const isMatch = element.value === String(value) || findLabelText(element).toLowerCase() === String(value).toLowerCase();
      if (isMatch && !element.checked) {
        element.checked = true;
        triggerEvents(element, ['click', 'change']);
      }
    }
  }

  /**
   * Trigger standard browser events on an element to notify frameworks like React/Vue.
   */
  function triggerEvents(element, eventTypes) {
    eventTypes.forEach(eventType => {
      let event;
      if (eventType === 'click') {
        event = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
      } else {
        event = new Event(eventType, {
          bubbles: true,
          cancelable: true
        });
      }
      element.dispatchEvent(event);
    });
  }

  /**
   * Inject and display a floating toast notification in the DOM.
   * Self-contained styling avoids external dependencies.
   */
  function showToast(text, type = 'info') {
    let container = document.getElementById('thinkfiller-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'thinkfiller-toast-container';
      // Inline styles for toast container
      Object.assign(container.style, {
        position: 'fixed',
        top: '24px',
        right: '24px',
        zIndex: '2147483647',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        pointerEvents: 'none',
        maxWidth: '350px',
        fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
      });
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `tf-toast tf-toast-${type}`;
    
    // Style rules based on type
    let colorGlow = '#3b82f6';
    if (type === 'success') colorGlow = '#10b981';
    if (type === 'error') colorGlow = '#f43f5e';
    if (type === 'warn') colorGlow = '#f59e0b';
    if (type === 'ai') colorGlow = '#a855f7';

    // Inline styles for the toast element
    Object.assign(toast.style, {
      background: 'rgba(15, 23, 42, 0.95)',
      color: '#f8fafc',
      borderLeft: `4px solid ${colorGlow}`,
      borderRadius: '8px',
      padding: '12px 18px',
      fontSize: '13px',
      fontWeight: '500',
      lineHeight: '1.4',
      boxShadow: `0 8px 30px rgba(0, 0, 0, 0.35), 0 0 10px ${colorGlow}33`,
      backdropFilter: 'blur(8px)',
      webkitBackdropFilter: 'blur(8px)',
      opacity: '0',
      transform: 'translateX(50px) scale(0.95)',
      transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      pointerEvents: 'auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px'
    });

    // Set text with prefix icon
    let prefix = 'ℹ ';
    if (type === 'success') prefix = '✔ ';
    if (type === 'error') prefix = '✖ ';
    if (type === 'warn') prefix = '⚠ ';
    if (type === 'ai') prefix = '✨ ';

    // Create a span for the text
    const textSpan = document.createElement('span');
    textSpan.innerText = `${prefix}${text}`;
    toast.appendChild(textSpan);

    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.innerText = '✕';
    Object.assign(closeBtn.style, {
      background: 'none',
      border: 'none',
      color: '#94a3b8',
      cursor: 'pointer',
      fontSize: '11px',
      padding: '2px 4px',
      marginLeft: '10px',
      lineHeight: '1',
      outline: 'none',
      flexShrink: '0'
    });
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeToast(toast);
    });
    toast.appendChild(closeBtn);

    container.appendChild(toast);

    // Trigger animation frame for transition
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(0) scale(1)';
    });

    // Auto dismiss after 3.5 seconds
    const dismissTimeout = setTimeout(() => {
      removeToast(toast);
    }, 3500);

    function removeToast(el) {
      clearTimeout(dismissTimeout);
      el.style.opacity = '0';
      el.style.transform = 'translateY(-10px) scale(0.9)';
      setTimeout(() => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
        if (container.childNodes.length === 0 && container.parentNode) {
          container.parentNode.removeChild(container);
        }
      }, 300);
    }
  }
})();
