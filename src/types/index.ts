/**
 * @toolplex/ai-engine - Core Type Definitions
 *
 * Platform-agnostic types for the AI chat engine.
 * These types are used across desktop, cloud, and CLI environments.
 */

import type { CoreMessage } from "ai";

// ============================================================================
// Provider Types
// ============================================================================

/**
 * Provider configuration
 */
export interface ProviderConfig {
  id: string;
  apiKey?: string;
  baseURL?: string;
  timeout?: number;
  maxRetries?: number;
}

/**
 * Credentials passed to provider factory
 */
export interface ProviderCredentials {
  openaiKey?: string;
  anthropicKey?: string;
  googleKey?: string;
  openrouterKey?: string;
  deepseekKey?: string;
  moonshotKey?: string;
  toolplexApiKey?: string;
  toolplexBaseURL?: string; // Custom base URL for cloud VPS (private network)
}

/**
 * Provider interface - wraps AI SDK providers
 */
export interface AIProvider {
  id: string;
  chat: (modelId: string) => any; // Returns LanguageModelV1 from AI SDK
}

// ============================================================================
// Stream Types
// ============================================================================

/**
 * Model configuration flags (subset from server-side ModelConfig)
 */
export interface ModelConfigFlags {
  preserveEmptyContentBlocks?: boolean;
  enforceMaxTokens?: boolean;
  maxOutputTokens?: number;
}

/**
 * File attachment structure
 */
export interface FileAttachment {
  name: string;
  mimeType: string;
  data: string; // base64 encoded
}

/**
 * Streaming options for chat requests
 */
export interface StreamOptions {
  streamId?: string;
  sessionId: string;
  modelId: string;
  provider: string;
  messages: CoreMessage[];
  tools?: any;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  fileAttachments?: FileAttachment[];
  streamingMessageId?: string;
  modelConfig?: ModelConfigFlags;
  /** Optional user ID for system API keys (per-user telemetry) */
  userId?: string;
}

/**
 * Tool call data structure
 */
export interface ToolCallData {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Usage/token data structure
 */
export interface UsageData {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Stream event types
 */
export type StreamEvent =
  | { type: "chunk"; content: string }
  | { type: "tool_call"; toolCall: ToolCallData }
  | { type: "complete"; fullText: string; usage?: UsageData }
  | { type: "error"; error: string };

/**
 * Stream result from the engine
 */
export interface StreamResult {
  streamId: string;
  textStream: AsyncIterable<string>;
  fullStream: AsyncIterable<any>;
  onFinishPromise: Promise<void>;
  abort: () => Promise<void>;
}

// ============================================================================
// MCP Types
// ============================================================================

/**
 * MCP tool definition from server
 */
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: any;
}

/**
 * MCP session information
 */
export interface MCPSessionInfo {
  exists: boolean;
  isConnected?: boolean;
  serverPath?: string;
}

/**
 * Result from MCP operations
 */
export interface MCPResult {
  success: boolean;
  error?: string;
  data?: any;
}

/**
 * MCP tool call result
 */
export interface MCPToolResult {
  content: Array<{
    type: string;
    text?: string;
    data?: any;
  }>;
  isError?: boolean;
}

// ============================================================================
// Confirmation Types
// ============================================================================

/**
 * Types of tool confirmations
 */
export type ConfirmationType =
  | "install"
  | "uninstall"
  | "missing-servers"
  | "save-playbook"
  | "submit-feedback"
  | "large-result";

/**
 * Confirmation request from engine to adapter
 */
export interface ConfirmationRequest {
  type: ConfirmationType;
  data: any;
}

/**
 * Confirmation result from adapter
 */
export interface ConfirmationResult {
  allowed: boolean;
  reason?: string;
  action?: string;
  editedConfig?: any;
  wasEdited?: boolean;
}

// ============================================================================
// Engine Events
// ============================================================================

/**
 * Events emitted by the engine during streaming
 */
export interface EngineEvents {
  // Stream events
  onStreamChunk: (streamId: string, chunk: string) => void;
  onStreamComplete: (
    streamId: string,
    fullText: string,
    usage?: UsageData,
  ) => void;
  onStreamError: (streamId: string, error: string) => void;

  // Tool events
  onToolInputStart: (
    streamId: string,
    toolCallId: string,
    toolName: string,
  ) => void;
  onToolInputDelta: (
    streamId: string,
    toolCallId: string,
    argsDelta: string,
  ) => void;
  onToolResult: (
    streamId: string,
    toolCallId: string,
    result: MCPToolResult,
    toolName: string,
    args: any,
  ) => void;
}

// ============================================================================
// Engine Configuration
// ============================================================================

/**
 * Configuration for the AI engine
 */
export interface EngineConfig {
  /** Maximum number of tool execution steps per request */
  maxSteps?: number;

  /** Whether to enable debug logging */
  debug?: boolean;

  /** Tools to hide from the AI agent */
  hiddenTools?: string[];

  /** Client version for API requests */
  clientVersion?: string;
}

// ============================================================================
// Session Types
// ============================================================================

/**
 * Chat session information
 */
export interface ChatSession {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

/**
 * Message in a chat session
 */
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string | any[];
  toolCallId?: string;
  toolCalls?: ToolCallData[];
  createdAt: Date;
}

// Re-export CoreMessage from ai sdk
export type { CoreMessage };
