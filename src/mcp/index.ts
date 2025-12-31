/**
 * @toolplex/ai-engine - MCP Module
 *
 * MCP (Model Context Protocol) client for ToolPlex.
 */

export { MCPClient } from "./MCPClient.js";
export type {
  MCPSession,
  MCPResult,
  MCPTool,
  MCPToolResult,
  TransportFactory,
  MCPClientConfig,
  CreateTransportOptions,
} from "./types.js";

// Path utilities
export { getToolplexClientPath } from "./paths.js";

// Default transport factory (uses system Node.js)
export {
  DefaultStdioTransportFactory,
  defaultStdioTransportFactory,
} from "./DefaultStdioTransportFactory.js";
