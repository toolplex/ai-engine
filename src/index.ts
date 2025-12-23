/**
 * @toolplex/ai-engine
 *
 * Core AI chat engine for ToolPlex.
 * Powers desktop, cloud, and CLI environments through adapter pattern.
 *
 * @example
 * ```typescript
 * import { ChatEngine, createElectronAdapter } from '@toolplex/ai-engine';
 *
 * const adapter = createElectronAdapter({ webContents });
 * const engine = new ChatEngine(adapter);
 *
 * await engine.stream({
 *   sessionId: 'session-123',
 *   modelId: 'anthropic/claude-sonnet-4',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */

// Types
export * from "./types/index.js";

// Adapters
export * from "./adapters/index.js";

// Providers
export {
  getProvider,
  getModel,
  isProviderAvailable,
  toolplexUsageMap,
  type GetProviderOptions,
} from "./providers/index.js";
export { createToolPlex, type ToolPlexConfig } from "./providers/toolplex.js";

// Utilities
export {
  deepSanitizeParams,
  resolveSchemaRefs,
  sanitizeSchemaForGemini,
  cleanToolSchema,
} from "./utils/schema.js";
export {
  isChatGPTModel,
  isGoogleGeminiModel,
  isAnthropicModel,
  parseModelId,
} from "./utils/models.js";

// Core engine
export { ChatEngine, type ChatEngineOptions } from "./core/ChatEngine.js";
export { buildMCPTools, type BuildToolsOptions } from "./core/ToolBuilder.js";

// MCP Client
export { MCPClient } from "./mcp/MCPClient.js";
export type {
  MCPSession,
  MCPResult,
  MCPTool,
  MCPToolResult,
  TransportFactory,
  MCPClientConfig,
} from "./mcp/types.js";

// MCP path utilities and default transport
export { getToolplexClientPath } from "./mcp/paths.js";
export {
  DefaultStdioTransportFactory,
  defaultStdioTransportFactory,
} from "./mcp/DefaultStdioTransportFactory.js";

// Re-export AI SDK primitives for consumers
export { streamText, tool, jsonSchema, stepCountIs } from "ai";
export type { ToolResultPart, ToolCallPart, TextPart, ImagePart } from "ai";

// Re-export provider factory functions
export { createOpenAI } from "@ai-sdk/openai";
export { createAnthropic } from "@ai-sdk/anthropic";
export { createGoogleGenerativeAI } from "@ai-sdk/google";
export { createOpenRouter } from "@openrouter/ai-sdk-provider";

// Re-export MCP SDK for transport implementations
export { Client as MCPSDKClient } from "@modelcontextprotocol/sdk/client/index.js";
export { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
