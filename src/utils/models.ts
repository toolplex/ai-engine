/**
 * @toolplex/ai-engine - Model Utilities
 *
 * Utility functions for model detection and handling.
 */

/**
 * Check if a model is a ChatGPT/OpenAI model
 * Includes both direct OpenAI models (gpt-*) and OpenRouter proxied models (openai/*)
 */
export function isChatGPTModel(modelId: string): boolean {
  return modelId.startsWith("gpt-") || modelId.startsWith("openai/gpt-");
}

/**
 * Check if the model is a Google Gemini model
 */
export function isGoogleGeminiModel(modelId: string): boolean {
  return modelId.startsWith("google/") || modelId.startsWith("gemini");
}

/**
 * Check if the model is an Anthropic Claude model
 */
export function isAnthropicModel(modelId: string): boolean {
  return modelId.startsWith("anthropic/") || modelId.startsWith("claude");
}

/**
 * Extract provider and model ID from a combined model string
 * Format: "provider/model-id" or just "model-id"
 *
 * @param modelId - Combined model ID string
 * @returns Object with providerId and actualModelId
 */
export function parseModelId(modelId: string): {
  providerId: string;
  actualModelId: string;
} {
  const parts = modelId.split("/");
  if (parts.length === 1) {
    // No provider prefix, try to detect from model name
    if (modelId.startsWith("gpt-") || modelId.startsWith("o1")) {
      return { providerId: "openai", actualModelId: modelId };
    }
    if (modelId.startsWith("claude")) {
      return { providerId: "anthropic", actualModelId: modelId };
    }
    if (modelId.startsWith("gemini")) {
      return { providerId: "google", actualModelId: modelId };
    }
    // Default to toolplex
    return { providerId: "toolplex", actualModelId: modelId };
  }

  const providerId = parts[0];
  const actualModelId = parts.slice(1).join("/");
  return { providerId, actualModelId };
}
