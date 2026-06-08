/**
 * Gemini API service for ThinkFiller AI
 * Handles prompt construction and API interaction with Gemini.
 */

const GeminiService = {
  /**
   * Helper to hash string for cache key generation.
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  },

  /**
   * Calls Gemini API to generate form data based on page fields and selected profile.
   * @param {string} apiKey - Google Gemini API Key
   * @param {string} model - Gemini model to use (e.g. 'gemini-2.5-flash')
   * @param {Array} fields - Scraped form fields
   * @param {string} profile - 'realistic' | 'custom'
   * @param {string} customPrompt - Custom prompt from user (if profile is 'custom')
   * @param {string} pageTitle - Title of the active web page
   * @returns {Promise<Object>} Object mapping thinkFillerId -> value
   */
  async generateFormData(apiKey, model, fields, profile, customPrompt = '', pageTitle = '') {
    if (!apiKey) {
      throw new Error('Gemini API Key is missing. Please set it in the extension popup.');
    }

    // 1. Generate Cache Key and Check Cache to optimize API usage
    const fieldSig = fields.map(f => `${f.thinkFillerId}:${f.type}:${(f.options || []).map(o => o.value).join(',')}`).join('|');
    const cacheKey = `tf_cache_${profile}_${this.hashString(fieldSig)}`;

    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const cached = await new Promise(resolve => {
          chrome.storage.local.get([cacheKey], res => resolve(res));
        });
        if (cached && cached[cacheKey]) {
          const { timestamp, data } = cached[cacheKey];
          // Cache valid for 30 seconds to prevent rate limit on duplicate hits
          if (Date.now() - timestamp < 30000) {
            console.log('ThinkFiller AI: Using cached Gemini response to prevent rate limit.');
            return data;
          }
        }
      }
    } catch (e) {
      console.warn('Cache read error:', e);
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // 2. Build prompt based on testing profile
    const profileInstructions = this.getProfileInstructions(profile, customPrompt);
    
    // 3. Prepare field data for the prompt (limiting options to optimize tokens)
    const fieldSummary = fields.map(f => {
      const info = {
        thinkFillerId: f.thinkFillerId,
        tagName: f.tagName,
        type: f.type,
        label: f.label || '',
        placeholder: f.placeholder || '',
        name: f.name || '',
        required: f.required
      };
      if (f.options) {
        // Limit options to first 30 to optimize tokens and limits
        const sliced = f.options.slice(0, 30);
        info.options = sliced.map(o => `${o.value} (${o.text})`);
        if (f.options.length > 30) {
          info.options.push(`... and ${f.options.length - 30} more options`);
        }
      }
      if (f.radioOptions) {
        info.radioOptions = f.radioOptions.map(o => `${o.value} (${o.label})`);
      }
      return info;
    });

    const promptText = `
You are an AI assistant designed for web testing.
Your task is to generate realistic, logical, or testing-specific mock data to fill out a web form.
The form is on a page titled: "${pageTitle}".

### Fields to Fill:
${JSON.stringify(fieldSummary, null, 2)}

### Strategy / Profile Instructions:
${profileInstructions}

### Critical Requirements:
1. For select fields, your value MUST EXACTLY match one of the option values or option texts provided in the field list (e.g., if options are ["US (United States)", "ID (Indonesia)"], output "US" or "ID").
2. For checkbox fields, provide a boolean true/false or a matching string.
3. For date fields, provide a valid date string (e.g. YYYY-MM-DD).
4. For email fields, make sure the email is valid and matches the contextual name you generate.
5. For radio buttons, select one of the provided radio options.
6. Provide a value for every single field listed, especially the ones marked "required: true".

Respond ONLY with a JSON object mapping each thinkFillerId to the generated fill value.
`;

    // 4. Create a dynamic JSON Schema to force structured JSON output from Gemini
    const schemaProperties = {};
    const requiredFields = [];

    fields.forEach(f => {
      let typeDesc = `Value to fill into the "${f.label || f.name || f.thinkFillerId}" field of type "${f.type}"`;
      if (f.options && f.options.length > 0) {
        typeDesc += `. Must be one of the option values: ${f.options.map(o => o.value).join(', ')}`;
      }
      if (f.radioOptions && f.radioOptions.length > 0) {
        typeDesc += `. Must be one of the radio values: ${f.radioOptions.map(o => o.value).join(', ')}`;
      }

      schemaProperties[f.thinkFillerId] = {
        type: f.type === 'checkbox' ? 'BOOLEAN' : 'STRING',
        description: typeDesc
      };
      requiredFields.push(f.thinkFillerId);
    });

    const responseSchema = {
      type: 'OBJECT',
      properties: schemaProperties,
      required: requiredFields
    };

    // 5. Send API request with retry logic (exponential backoff) for HTTP 429
    const requestBody = {
      contents: [
        {
          parts: [
            { text: promptText }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema
      }
    };

    let response;
    const retries = 3;
    let delay = 2000; // start with 2 seconds

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        if (response.status === 429 && attempt < retries) {
          console.warn(`Gemini API rate limit hit (429). Retrying in ${delay / 1000}s... (Attempt ${attempt + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2;
          continue;
        }

        if (!response.ok) {
          const errJson = await response.json().catch(() => ({}));
          const errMsg = errJson?.error?.message || `HTTP ${response.status} ${response.statusText}`;
          throw new Error(errMsg);
        }

        break;
      } catch (error) {
        if (attempt === retries) {
          console.error('Gemini API call failed after retries:', error);
          throw error;
        }
        console.warn(`Gemini API call attempt ${attempt + 1} failed: ${error.message}. Retrying in ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }

    try {
      const resData = await response.json();
      
      if (!resData.candidates || resData.candidates.length === 0) {
        throw new Error('No response candidates returned from Gemini API.');
      }

      const responseText = resData.candidates[0].content.parts[0].text;
      
      // Parse structured JSON
      const parsedData = JSON.parse(responseText.trim());

      // Save to local cache
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          const cacheObj = {};
          cacheObj[cacheKey] = {
            timestamp: Date.now(),
            data: parsedData
          };
          await new Promise(resolve => {
            chrome.storage.local.set(cacheObj, () => resolve());
          });
        }
      } catch (e) {
        console.warn('Cache write error:', e);
      }

      return parsedData;

    } catch (error) {
      console.error('Gemini API call parsing failed:', error);
      throw error;
    }
  },

  /**
   * Returns specific instructions for the prompt based on profile type.
   */
  getProfileInstructions(profile, customPrompt) {
    switch (profile) {
      case 'positive':
        return `
- Profile: POSITIVE CASE (VALID & REALISTIC DATA)
- Goal: Generate realistic, valid, high-quality human data that should pass form validation successfully.
- Rules:
  - Generate a Indonesian persona (e.g. Budi Santoso, Siti Aminah).
  - Use Indonesian phone numbers and addresses.
  - Make sure data formats are valid.
`;
      case 'negative':
        return `
- Profile: NEGATIVE CASE (INVALID DATA & FORMAT WRONGS)
- Goal: Generate invalid Indonesian mock data to purposely trigger validation errors.
- Rules:
  - Put alphabetical text in numeric fields.
  - Use invalid email formats.
  - Use weak password strings.
`;
      case 'custom':
        return `
- Profile: CUSTOM USER-DEFINED INSTRUCTIONS
- Instructions: ${customPrompt}
- Goal: Strictly satisfy the custom instruction above while generating mock values.
`;
      default:
        return 'Generate typical mock test data.';
    }
  }
};

// Export to window or self depending on the execution context
if (typeof window !== 'undefined') {
  window.GeminiService = GeminiService;
}
if (typeof self !== 'undefined') {
  self.GeminiService = GeminiService;
}

