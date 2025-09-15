const express = require('express');
const jwt = require('jsonwebtoken');
const { getAppKey, checkQuota, incrementQuota } = require('./apiKeys');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

/**
 * @swagger
 * /api/chat/send:
 *   post:
 *     summary: Send a message to AI and get response
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messages
 *               - modelId
 *             properties:
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant]
 *                     content:
 *                       type: string
 *               modelId:
 *                 type: string
 *                 description: The model ID to use (e.g., gpt-4o-mini, gemini-2.0-flash)
 *     responses:
 *       200:
 *         description: AI response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 images:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       mimeType:
 *                         type: string
 *                       data:
 *                         type: string
 *       429:
 *         description: Free quota exceeded
 *       500:
 *         description: Server error
 */
router.post('/send', authenticateToken, async (req, res) => {
  try {
    const { messages, modelId } = req.body;

    if (!messages || !modelId) {
      return res.status(400).json({ error: 'Messages and modelId are required' });
    }

    // Determine provider from modelId
    const provider = modelId.includes('gpt') || modelId.includes('chatgpt') ? 'openai' : 
                     modelId.includes('gemini') ? 'gemini' :
                     modelId.includes('claude') ? 'claude' :
                     modelId.includes('deepseek') ? 'deepseek' :
                     modelId.includes('perplexity') || modelId.includes('sonar') ? 'perplexity' : 'unknown';

    // Check if user has their own API key for this provider
    const { APIKey } = require('../models/APIKey');
    const userKey = await APIKey.findOne({
      userId: req.user.userId,
      provider,
      isDefault: true,
      isActive: true
    });

    let apiKey = userKey ? userKey.key : null;
    let usingAppKey = false;

    // Only use free quota for OpenAI and Gemini
    if (!apiKey && (provider === 'openai' || provider === 'gemini')) {
      // Check if user has quota remaining
      const hasQuota = await checkQuota(req.user.userId, provider);
      if (!hasQuota) {
        return res.status(429).json({
          error: 'Free quota exceeded. Add your own API key to continue.',
          quotaExceeded: true,
          provider
        });
      }

      // Use app key
      apiKey = await getAppKey(provider);
      if (!apiKey) {
        return res.status(500).json({ error: 'App key not configured for this provider' });
      }
      usingAppKey = true;
    } else if (!apiKey) {
      // For other providers, require user's own API key
      return res.status(400).json({
        error: `Please add your own API key for ${provider} provider.`,
        requiresUserKey: true,
        provider
      });
    }

    // Call AI service (you'll need to implement this based on your current AI integration)
    const aiResponse = await callAIService(messages, modelId, apiKey, provider);

    // Increment quota if using app key
    if (usingAppKey) {
      await incrementQuota(req.user.userId, provider);
    }

    // Update usage count for user key
    if (userKey) {
      await APIKey.findByIdAndUpdate(userKey._id, {
        $inc: { usageCount: 1 },
        lastUsed: new Date()
      });
    }

    res.json(aiResponse);
  } catch (error) {
    console.error('Error in chat send:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Placeholder for AI service call - you'll need to implement this
async function callAIService(messages, modelId, apiKey, provider) {
  try {
    if (provider === 'openai') {
      return await sendToChatGPT(messages, modelId, apiKey);
    } else if (provider === 'gemini') {
      return await sendToGemini(messages, modelId, apiKey);
    } else if (provider === 'claude') {
      return await sendToClaude(messages, modelId, apiKey);
    } else if (provider === 'deepseek') {
      return await sendToDeepseek(messages, modelId, apiKey);
    } else if (provider === 'perplexity') {
      return await sendToPerplexity(messages, modelId, apiKey);
    } else {
      return { success: false, error: 'Unsupported provider' };
    }
  } catch (error) {
    console.error('AI Service Error:', error);
    return { success: false, error: 'AI service error' };
  }
}

// OpenAI/ChatGPT API Integration
async function sendToChatGPT(messages, modelId, apiKey) {
  try {
    // Map model IDs to actual OpenAI model names
    let actualModel = "gpt-4o-mini"; // Default to free tier

    switch (modelId) {
      case "gpt-4o-mini":
        actualModel = "gpt-4o-mini";
        break;
      case "gpt-4":
        actualModel = "gpt-4";
        break;
      case "gpt-3.5-turbo":
        actualModel = "gpt-3.5-turbo";
        break;
      default:
        // Fallback for backward compatibility
        if (modelId.includes("gpt-4")) {
          actualModel = "gpt-4o-mini"; // Free tier model
        } else if (modelId.includes("gpt-3.5")) {
          actualModel = "gpt-3.5-turbo";
        }
        break;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: actualModel,
        messages: messages,
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    console.log("OpenAI API Request:", {
      model: actualModel,
      messagesCount: messages.length,
      status: response.status,
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("OpenAI API Error:", errorData);
      return {
        success: false,
        error: `OpenAI Error: ${
          errorData.error?.message ||
          `HTTP ${response.status}: ${response.statusText}`
        }`,
      };
    }

    const data = await response.json();
    console.log("OpenAI API Response:", data);
    const assistantMessage = data.choices?.[0]?.message?.content;

    if (!assistantMessage) {
      return { success: false, error: "No response from ChatGPT" };
    }

    return { success: true, message: assistantMessage };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

// Google Gemini API Integration
async function sendToGemini(messages, modelId, apiKey) {
  try {
    // Get only the latest user message for Gemini
    const latestMessage = messages[messages.length - 1];

    // Map model IDs to actual Gemini model names
    let modelName = "gemini-2.0-flash"; // Default

    switch (modelId) {
      case "gemini-2.0-flash":
        modelName = "gemini-2.0-flash";
        break;
      case "gemini-2.0-flash-exp":
        modelName = "gemini-2.0-flash-exp";
        break;
      default:
        modelName = "gemini-2.0-flash";
        break;
    }

    // Decide initial response modalities: only request images for models known to support them
    const initialModalities =
      modelName === "gemini-2.0-flash-exp" ? ["text", "image"] : ["text"];

    const safetySettings = [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
    ];

    const makePayload = (modalities) => ({
      contents: [
        {
          parts: [
            {
              text: latestMessage.content,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
        responseModalities: modalities,
      },
      safetySettings,
    });

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    // Try initial request
    let response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makePayload(initialModalities)),
    });

    console.log("Gemini API Response Status:", response.status);

    // If model rejects modalities (e.g., doesn't support image), retry with text-only
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API Error:", errorText);

      const modalityErrorPattern =
        /does not support the requested response modalities|only supports text|requested response modalities/i;
      if (
        initialModalities.includes("image") &&
        modalityErrorPattern.test(errorText)
      ) {
        console.log("Gemini rejected image modality, retrying with text-only");
        response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(makePayload(["text"])),
        });

        console.log("Gemini retry Response Status:", response.status);
        if (!response.ok) {
          const retryError = await response.text();
          console.error("Gemini retry error:", retryError);
          return {
            success: false,
            error: `HTTP ${response.status}: ${retryError}`,
          };
        }
      } else {
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText}`,
        };
      }
    }

    const data = await response.json();
    console.log("Gemini API Response:", data);

    const candidate = data.candidates?.[0];
    if (!candidate || !candidate.content || !candidate.content.parts) {
      return { success: false, error: "No response from Gemini" };
    }

    let assistantMessage = "";
    const images = [];

    for (const part of candidate.content.parts) {
      if (part.text) {
        assistantMessage += part.text;
      } else if (
        part.inlineData &&
        part.inlineData.mimeType?.startsWith("image/")
      ) {
        images.push({
          mimeType: part.inlineData.mimeType,
          data: part.inlineData.data,
        });
      }
    }

    if (!assistantMessage && images.length === 0) {
      return { success: false, error: "No valid response content from Gemini" };
    }

    // Return both text and images
    return {
      success: true,
      message: assistantMessage || "[Image generated]",
      images: images.length > 0 ? images : undefined,
    };
  } catch (error) {
    console.error("Gemini API Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

// Claude API Integration (Anthropic)
async function sendToClaude(messages, modelId, apiKey) {
  try {
    // Map model IDs to actual Claude model names
    let actualModel = "claude-3-haiku-20240307"; // Default to free tier

    switch (modelId) {
      case "claude-3-haiku":
        actualModel = "claude-3-haiku-20240307";
        break;
      case "claude-3-sonnet":
        actualModel = "claude-3-sonnet-20240229";
        break;
      case "claude-3-opus":
        actualModel = "claude-3-opus-20240229";
        break;
      default:
        // Fallback for backward compatibility
        actualModel = "claude-3-haiku-20240307";
        break;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: actualModel,
        max_tokens: 1000,
        messages: messages.filter((msg) => msg.role !== "system"),
        system: messages.find((msg) => msg.role === "system")?.content,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error:
          errorData.error?.message ||
          `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();
    const assistantMessage = data.content?.[0]?.text;

    if (!assistantMessage) {
      return { success: false, error: "No response from Claude" };
    }

    return { success: true, message: assistantMessage };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

// Deepseek API Integration
async function sendToDeepseek(messages, modelId, apiKey) {
  try {
    // Map model IDs to actual DeepSeek model names
    let actualModel = "deepseek-chat"; // Default to free tier

    switch (modelId) {
      case "deepseek-chat":
        actualModel = "deepseek-chat";
        break;
      case "deepseek-coder":
        actualModel = "deepseek-coder";
        break;
      default:
        actualModel = "deepseek-chat";
        break;
    }

    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: actualModel,
        messages: messages,
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: `DeepSeek Error: ${
          errorData.error?.message ||
          `HTTP ${response.status}: ${response.statusText}`
        }`,
      };
    }

    const data = await response.json();
    const assistantMessage = data.choices?.[0]?.message?.content;

    if (!assistantMessage) {
      return { success: false, error: "No response from DeepSeek" };
    }

    return { success: true, message: assistantMessage };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

// Perplexity API Integration
async function sendToPerplexity(messages, modelId, apiKey) {
  try {
    // Map model IDs to actual Perplexity model names
    let actualModel = "sonar"; // Default

    switch (modelId) {
      case "perplexity-sonar":
        actualModel = "sonar";
        break;
      case "perplexity-sonar-pro":
        actualModel = "sonar-pro";
        break;
      default:
        actualModel = "sonar";
        break;
    }

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: actualModel,
        messages: messages,
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: `Perplexity Error: ${
          errorData.error?.message ||
          `HTTP ${response.status}: ${response.statusText}`
        }`,
      };
    }

    const data = await response.json();
    const assistantMessage = data.choices?.[0]?.message?.content;

    if (!assistantMessage) {
      return { success: false, error: "No response from Perplexity" };
    }

    return { success: true, message: assistantMessage };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

module.exports = router;