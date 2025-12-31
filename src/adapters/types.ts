/**
 * @toolplex/ai-engine - Adapter Interface
 *
 * The EngineAdapter interface defines how the AI engine interacts with
 * the host platform. This abstraction allows the same engine core to
 * run in Electron, server-side (cloud), or CLI environments.
 *
 * Implementations:
 * - ElectronAdapter: Desktop app with IPC, webContents, confirmations
 * - HTTPAdapter: Cloud/server with HTTP streaming, no confirmations
 * - CLIAdapter: CLI with terminal I/O
 */

import type {
  ProviderCredentials,
  ConfirmationRequest,
  ConfirmationResult,
  MCPResult,
  MCPSessionInfo,
  MCPTool,
  MCPToolResult,
  UsageData,
  ChatSession,
  ChatMessage,
} from "../types/index.js";

// ============================================================================
// Event Emitter Interface
// ============================================================================

/**
 * Interface for emitting engine events to the platform
 */
export interface EngineEventEmitter {
  /** Emit a text chunk during streaming */
  emitChunk(streamId: string, chunk: string): void;

  /** Emit stream completion */
  emitComplete(streamId: string, fullText: string, usage?: UsageData): void;

  /** Emit stream error */
  emitError(streamId: string, error: string): void;

  /** Emit tool input start (for streaming tool arguments) */
  emitToolInputStart(
    streamId: string,
    toolCallId: string,
    toolName: string,
  ): void;

  /** Emit tool input delta (streaming argument chunks) */
  emitToolInputDelta(
    streamId: string,
    toolCallId: string,
    argsDelta: string,
  ): void;

  /** Emit tool execution result */
  emitToolResult(
    streamId: string,
    toolCallId: string,
    result: MCPToolResult,
    toolName: string,
    args: any,
  ): void;
}

// ============================================================================
// Confirmation Handler Interface
// ============================================================================

/**
 * Interface for handling user confirmations
 * Desktop: Shows modal dialogs via IPC
 * Cloud: Auto-approves or uses policy-based decisions
 * CLI: Prompts in terminal
 */
export interface ConfirmationHandler {
  /**
   * Request user confirmation for a tool operation
   * @param streamId - The current stream ID
   * @param request - The confirmation request details
   * @returns Confirmation result with allowed/denied and any edits
   */
  requestConfirmation(
    streamId: string,
    request: ConfirmationRequest,
  ): Promise<ConfirmationResult>;

  /**
   * Whether this handler supports interactive confirmations
   * Cloud handlers may return false to auto-approve based on policy
   */
  isInteractive(): boolean;
}

// ============================================================================
// MCP Transport Interface
// ============================================================================

/**
 * Interface for MCP transport operations
 * Abstracts away the transport mechanism (stdio, HTTP, etc.)
 */
export interface MCPTransportAdapter {
  /** Create/connect MCP transport for a session
   * @param userId - Optional user ID for system API keys (per-user telemetry)
   * @param clientMode - Client mode: standard, restricted, or automation
   */
  createTransport(
    sessionId: string,
    apiKey: string,
    sessionResumeHistory?: string,
    userId?: string,
    clientMode?: "standard" | "restricted" | "automation",
  ): Promise<MCPResult>;

  /** Get session info */
  getSessionInfo(sessionId: string): MCPSessionInfo;

  /** List available tools from MCP server */
  listTools(sessionId: string): Promise<{ tools: MCPTool[] }>;

  /** Call an MCP tool */
  callTool(
    sessionId: string,
    toolName: string,
    args: any,
  ): Promise<MCPToolResult>;

  /** Destroy/disconnect MCP transport */
  destroyTransport(sessionId: string): Promise<MCPResult>;
}

// ============================================================================
// Credentials Provider Interface
// ============================================================================

/**
 * Interface for accessing API credentials
 * Different platforms load credentials differently
 */
export interface CredentialsProvider {
  /** Get provider credentials for AI SDK */
  getCredentials(): Promise<ProviderCredentials>;

  /** Get ToolPlex API key specifically */
  getToolPlexApiKey(): Promise<string>;
}

// ============================================================================
// Persistence Interface (Optional)
// ============================================================================

/**
 * Interface for persisting chat sessions and messages
 * Optional - cloud may use different storage than desktop
 */
export interface PersistenceAdapter {
  // Session operations
  createSession(metadata?: Record<string, any>): Promise<ChatSession>;
  getSession(sessionId: string): Promise<ChatSession | null>;
  updateSession(
    sessionId: string,
    updates: Partial<ChatSession>,
  ): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;

  // Message operations
  saveMessage(
    message: Omit<ChatMessage, "id" | "createdAt">,
  ): Promise<ChatMessage>;
  getMessages(sessionId: string): Promise<ChatMessage[]>;
  updateMessage(
    messageId: string,
    updates: Partial<ChatMessage>,
  ): Promise<void>;
  deleteMessage(messageId: string): Promise<void>;
}

// ============================================================================
// Logger Interface
// ============================================================================

/**
 * Interface for logging
 * Allows different logging implementations per platform
 */
export interface LoggerAdapter {
  debug(message: string, meta?: Record<string, any>): void;
  info(message: string, meta?: Record<string, any>): void;
  warn(message: string, meta?: Record<string, any>): void;
  error(message: string, meta?: Record<string, any>): void;
}

// ============================================================================
// Main Engine Adapter Interface
// ============================================================================

/**
 * The main adapter interface that platforms must implement
 * This brings together all the sub-interfaces needed by the engine
 */
export interface EngineAdapter {
  /** Event emitter for streaming events */
  readonly events: EngineEventEmitter;

  /** Confirmation handler for user approvals */
  readonly confirmations: ConfirmationHandler;

  /** MCP transport adapter */
  readonly mcp: MCPTransportAdapter;

  /** Credentials provider */
  readonly credentials: CredentialsProvider;

  /** Logger */
  readonly logger: LoggerAdapter;

  /** Persistence adapter (optional) */
  readonly persistence?: PersistenceAdapter;

  /** Client version string (for API headers) */
  getClientVersion(): string;

  /**
   * Initialize the adapter
   * Called once when engine is created
   */
  initialize(): Promise<void>;

  /**
   * Cleanup/shutdown the adapter
   * Called when engine is destroyed
   */
  shutdown(): Promise<void>;
}

// ============================================================================
// Adapter Factory Type
// ============================================================================

/**
 * Factory function type for creating adapters
 */
export type AdapterFactory<TConfig = any> = (config: TConfig) => EngineAdapter;
