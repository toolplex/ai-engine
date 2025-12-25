/**
 * @toolplex/ai-engine - Provider Factory
 *
 * Central provider management for the AI engine.
 * Handles instantiation of both built-in AI SDK providers and custom providers.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createToolPlex } from "./toolplex.js";
import type { AIProvider, ProviderCredentials } from "../types/index.js";
import type { LoggerAdapter } from "../adapters/types.js";

export { toolplexUsageMap } from "./toolplex.js";

export interface GetProviderOptions {
  logger?: LoggerAdapter;
  clientVersion?: string;
}

/**
 * Get provider instance by ID
 *
 * @param providerId - Provider identifier (e.g., 'toolplex', 'openai', 'anthropic')
 * @param credentials - API keys and credentials
 * @param options - Optional logger and client version
 * @returns Provider instance
 */
export function getProvider(
  providerId: string,
  credentials: ProviderCredentials,
  options?: GetProviderOptions,
): AIProvider {
  switch (providerId.toLowerCase()) {
    case "toolplex": {
      if (!credentials.toolplexApiKey) {
        throw new Error("ToolPlex API key is required");
      }
      const toolplexProvider = createToolPlex({
        apiKey: credentials.toolplexApiKey,
        baseURL: credentials.toolplexBaseURL || "https://api.toolplex.ai",
        clientVersion: options?.clientVersion,
        logger: options?.logger,
      });
      return {
        id: "toolplex",
        chat: (modelId: string) => toolplexProvider(modelId),
      };
    }

    case "openai": {
      if (!credentials.openaiKey) {
        throw new Error("OpenAI API key is required");
      }
      const openaiProvider = createOpenAI({ apiKey: credentials.openaiKey });
      return {
        id: "openai",
        chat: (modelId: string) => openaiProvider(modelId),
      };
    }

    case "anthropic": {
      if (!credentials.anthropicKey) {
        throw new Error("Anthropic API key is required");
      }
      const anthropicProvider = createAnthropic({
        apiKey: credentials.anthropicKey,
      });
      return {
        id: "anthropic",
        chat: (modelId: string) => anthropicProvider(modelId),
      };
    }

    case "google": {
      if (!credentials.googleKey) {
        throw new Error("Google API key is required");
      }
      const googleProvider = createGoogleGenerativeAI({
        apiKey: credentials.googleKey,
      });
      return {
        id: "google",
        chat: (modelId: string) => googleProvider(modelId),
      };
    }

    case "openrouter": {
      if (!credentials.openrouterKey) {
        throw new Error("OpenRouter API key is required");
      }
      const openrouterProvider = createOpenRouter({
        apiKey: credentials.openrouterKey,
      });
      return {
        id: "openrouter",
        chat: (modelId: string) => openrouterProvider(modelId),
      };
    }

    case "deepseek": {
      if (!credentials.deepseekKey) {
        throw new Error("DeepSeek API key is required");
      }
      // DeepSeek uses OpenAI-compatible API
      const deepseekProvider = createOpenAI({
        apiKey: credentials.deepseekKey,
        baseURL: "https://api.deepseek.com/v1",
      });
      return {
        id: "deepseek",
        chat: (modelId: string) => deepseekProvider(modelId),
      };
    }

    case "moonshot": {
      if (!credentials.moonshotKey) {
        throw new Error("Moonshot API key is required");
      }
      // Moonshot uses OpenAI-compatible API
      const moonshotProvider = createOpenAI({
        apiKey: credentials.moonshotKey,
        baseURL: "https://api.moonshot.cn/v1",
      });
      return {
        id: "moonshot",
        chat: (modelId: string) => moonshotProvider(modelId),
      };
    }

    default:
      throw new Error(`Unknown provider: ${providerId}`);
  }
}

/**
 * Get model instance for streaming
 *
 * @param modelId - Full model identifier (e.g., 'anthropic/claude-sonnet-4')
 * @param credentials - API keys and credentials
 * @param options - Optional logger and client version
 * @returns Language model instance ready for streamText()
 */
export function getModel(
  modelId: string,
  credentials: ProviderCredentials,
  options?: GetProviderOptions,
) {
  // Parse model ID format: "provider/model-name"
  const parts = modelId.split("/");
  const providerId = parts[0];
  const actualModelId = parts.slice(1).join("/");

  const provider = getProvider(providerId, credentials, options);
  return provider.chat(actualModelId);
}

/**
 * Check if a provider is available (has required credentials)
 *
 * @param providerId - Provider identifier
 * @param credentials - API keys and credentials
 * @returns True if provider can be instantiated
 */
export function isProviderAvailable(
  providerId: string,
  credentials: ProviderCredentials,
): boolean {
  try {
    getProvider(providerId, credentials);
    return true;
  } catch {
    return false;
  }
}
