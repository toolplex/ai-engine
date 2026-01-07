/**
 * @toolplex/ai-engine - Default Stdio Transport Factory
 *
 * Default implementation of TransportFactory that spawns @toolplex/client
 * using the system's Node.js. This works out-of-box for CLI usage.
 *
 * For desktop apps with bundled dependencies, override this with a custom
 * TransportFactory implementation.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type {
  TransportFactory,
  MCPSession,
  CreateTransportOptions,
} from "./types.js";
import { getToolplexClientPath } from "./paths.js";

/**
 * Default Transport Factory - spawns @toolplex/client using system Node.js
 *
 * This is suitable for:
 * - CLI applications
 * - Development environments
 * - Any context where system Node.js is available
 *
 * For Electron/desktop apps with bundled Node.js, create a custom
 * TransportFactory that uses the bundled runtime.
 */
export class DefaultStdioTransportFactory implements TransportFactory {
  async createTransport(
    apiKey: string,
    sessionResumeHistory?: string,
    userId?: string,
    options?: CreateTransportOptions,
  ): Promise<MCPSession> {
    const toolplexPath = getToolplexClientPath();

    // Build environment for the MCP server
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      TOOLPLEX_API_KEY: apiKey,
      CLIENT_NAME: "toolplex-ai-engine",
    };

    // Add session resume history if provided (from options or legacy param)
    const resumeHistory = options?.sessionResumeHistory || sessionResumeHistory;
    if (resumeHistory) {
      env.TOOLPLEX_SESSION_RESUME_HISTORY = resumeHistory;
    }

    // Add user ID for per-user telemetry (from options or legacy param)
    const effectiveUserId = options?.userId || userId;
    if (effectiveUserId) {
      env.TOOLPLEX_USER_ID = effectiveUserId;
    }

    // Add client mode (standard, restricted, or automation)
    if (options?.clientMode) {
      env.CLIENT_MODE = options.clientMode;
    }

    // Add automation context for HITL support (only in automation mode)
    if (options?.automationContext) {
      env.AUTOMATION_CONTEXT = JSON.stringify(options.automationContext);
    }

    const transport = new StdioClientTransport({
      command: "node", // Uses system Node.js
      args: [toolplexPath],
      env,
    });

    const client = new Client({
      name: "toolplex-ai-engine-client",
      version: "1.0.0",
    });

    await client.connect(transport);
    return { transport, client };
  }

  async closeTransport(session: MCPSession): Promise<void> {
    try {
      await session.client.close();
    } catch {
      // Silently continue to ensure cleanup
    }
  }
}

// Export singleton instance for convenience
export const defaultStdioTransportFactory = new DefaultStdioTransportFactory();
