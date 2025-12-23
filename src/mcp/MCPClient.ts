/**
 * @toolplex/ai-engine - MCP Client
 *
 * Core MCP client that manages sessions and tool operations.
 * Uses a TransportFactory for platform-specific transport creation.
 */

import type {
  MCPSession,
  MCPResult,
  MCPToolResult,
  MCPClientConfig,
  TransportFactory,
} from "./types.js";

/**
 * MCP Client - manages sessions and provides tool operations
 */
export class MCPClient {
  private sessions = new Map<string, MCPSession>();
  private transportFactory: TransportFactory;
  private logger: MCPClientConfig["logger"];
  private imageHandler: MCPClientConfig["imageHandler"];
  private getCurrentUserId: MCPClientConfig["getCurrentUserId"];

  constructor(config: MCPClientConfig) {
    this.transportFactory = config.transportFactory;
    this.logger = config.logger;
    this.imageHandler = config.imageHandler;
    this.getCurrentUserId = config.getCurrentUserId;
  }

  /**
   * Creates an MCP session and waits for tools to be initialized
   *
   * CRITICAL: The ToolPlex MCP server fetches tool schemas from the API during startup.
   * This is asynchronous and can take time. We MUST wait for this to complete before
   * returning, otherwise listTools() will return empty schemas.
   */
  async createSession(
    sessionId: string,
    apiKey: string,
    sessionResumeHistory?: string,
  ): Promise<MCPResult> {
    try {
      // Clean up existing session if it exists
      await this.destroySession(sessionId);

      this.logger?.debug("MCPClient: Creating session", { sessionId });

      const session = await this.transportFactory.createTransport(
        apiKey,
        sessionResumeHistory,
      );

      this.sessions.set(sessionId, session);
      this.logger?.debug("MCPClient: Session created and stored", {
        sessionId,
      });

      return { success: true };
    } catch (error) {
      this.logger?.error("MCPClient: Transport creation failed", { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Lists available tools for a session
   */
  async listTools(sessionId: string): Promise<{ tools: any[] }> {
    this.logger?.debug("MCPClient: Listing tools for session", {
      sessionId,
      availableSessions: Array.from(this.sessions.keys()),
    });

    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger?.error("MCPClient: No session found in registry", {
        sessionId,
        availableSessions: Array.from(this.sessions.keys()),
      });
      throw new Error(`No MCP client found for session: ${sessionId}`);
    }

    try {
      const result = await session.client.listTools();
      this.logger?.debug("MCPClient: Tools listed successfully", {
        sessionId,
        toolCount: result?.tools?.length || 0,
      });
      return result;
    } catch (error) {
      this.logger?.error("MCPClient: Failed to list tools", {
        sessionId,
        error,
      });
      throw error;
    }
  }

  /**
   * Calls a tool for a session
   */
  async callTool(
    sessionId: string,
    toolName: string,
    args: any,
  ): Promise<MCPToolResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`No MCP client found for session: ${sessionId}`);
    }

    const toolCall = {
      name: toolName,
      arguments: args || {},
    };
    const result = await session.client.callTool(toolCall);

    // Process the result to handle images if handler is available
    if (
      this.imageHandler &&
      this.getCurrentUserId &&
      result?.content &&
      Array.isArray(result.content)
    ) {
      const hasImages = result.content.some(
        (item: any) => item?.type === "image" && item?.data,
      );

      if (hasImages) {
        const userId = this.getCurrentUserId();
        if (userId) {
          await this.imageHandler.initialize(userId);
          const processed = await this.imageHandler.processToolResult(result);

          return {
            ...result,
            content: processed.content,
            savedImages: processed.savedImages,
          };
        }
      }
    }

    return result as MCPToolResult;
  }

  /**
   * Destroys an MCP session
   */
  async destroySession(sessionId: string): Promise<MCPResult> {
    try {
      const session = this.sessions.get(sessionId);
      if (session) {
        await this.transportFactory.closeTransport(session);
        this.sessions.delete(sessionId);
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Gets all active session IDs
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Destroys all MCP sessions (cleanup)
   */
  async destroyAllSessions(): Promise<void> {
    const sessionIds = this.getActiveSessions();
    await Promise.all(sessionIds.map((id) => this.destroySession(id)));
  }

  /**
   * Gets session info
   */
  getSessionInfo(sessionId: string): {
    exists: boolean;
    isConnected?: boolean;
  } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { exists: false };
    }

    return { exists: true, isConnected: true };
  }

  /**
   * Check if a session exists
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }
}
