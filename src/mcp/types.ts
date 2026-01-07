/**
 * @toolplex/ai-engine - MCP Types
 *
 * Type definitions for MCP (Model Context Protocol) integration.
 */

/**
 * MCP Session - holds the client connection
 * Client type is 'any' to avoid version mismatches between ai-engine and consumers
 */
export interface MCPSession {
  client: any; // MCP Client instance
  transport: any; // Transport type varies by platform
}

/**
 * Result from MCP operations
 */
export interface MCPResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * MCP Tool definition from server
 */
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: any;
}

/**
 * MCP Tool call result
 */
export interface MCPToolResult {
  content: Array<{
    type: string;
    text?: string;
    data?: any;
    [key: string]: any;
  }>;
  isError?: boolean;
  [key: string]: any;
}

/**
 * Automation context for HITL (Human-in-the-Loop) support.
 * Passed when clientMode is 'automation' to enable tool approval and notifications.
 */
export interface AutomationContext {
  automationId: string;
  runId: string;
  /** Tools that require user approval before execution (format: "server_id.tool_name") */
  toolsRequiringApproval: string[];
  /** Email address for notifications */
  notificationEmail?: string;
  /** Hours before HITL decisions expire (default 24) */
  expirationHours: number;
  /** Notification instructions from automation config */
  notifyInstructions?: string;
  /** Pre-approved tool call from HITL resume (bypasses approval check for this specific call) */
  preApprovedToolCall?: {
    server_id: string;
    tool_name: string;
  };
}

/**
 * Options for creating a transport
 */
export interface CreateTransportOptions {
  sessionResumeHistory?: string;
  userId?: string;
  /** Client mode: standard, restricted, or automation */
  clientMode?: "standard" | "restricted" | "automation";
  /** Automation context for HITL support (only when clientMode is 'automation') */
  automationContext?: AutomationContext;
}

/**
 * Transport factory interface - platforms implement this
 */
export interface TransportFactory {
  /**
   * Create a transport and connect to the MCP server
   * @param apiKey - ToolPlex API key
   * @param sessionResumeHistory - Optional session history for resuming (deprecated, use options)
   * @param userId - Optional user ID for per-user telemetry (deprecated, use options)
   * @param options - Additional options including clientMode
   * @returns Connected MCP session
   */
  createTransport(
    apiKey: string,
    sessionResumeHistory?: string,
    userId?: string,
    options?: CreateTransportOptions,
  ): Promise<MCPSession>;

  /**
   * Close a transport
   */
  closeTransport(session: MCPSession): Promise<void>;
}

/**
 * MCP Client configuration
 */
export interface MCPClientConfig {
  transportFactory: TransportFactory;
  logger?: {
    debug: (message: string, meta?: any) => void;
    info: (message: string, meta?: any) => void;
    warn: (message: string, meta?: any) => void;
    error: (message: string, meta?: any) => void;
  };
  /**
   * Optional image handler for processing image results
   */
  imageHandler?: {
    initialize(userId: string): Promise<void>;
    processToolResult(
      result: any,
    ): Promise<{ content: any[]; savedImages?: any[] }>;
  };
  /**
   * Optional function to get current user ID (for image handling)
   */
  getCurrentUserId?: () => string | null;
}
