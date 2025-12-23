/**
 * @toolplex/ai-engine - Tool Builder
 *
 * Builds AI SDK tools from MCP tools, handling:
 * - Schema cleaning and sanitization
 * - Tool confirmation flows
 * - Tool execution with cancellation support
 */

import { tool, jsonSchema } from "ai";
import type { EngineAdapter } from "../adapters/types.js";
import type {
  MCPTool,
  MCPToolResult,
  ConfirmationRequest,
} from "../types/index.js";
import { deepSanitizeParams, cleanToolSchema } from "../utils/schema.js";
import { isChatGPTModel, isGoogleGeminiModel } from "../utils/models.js";

export interface BuildToolsOptions {
  sessionId: string;
  streamId: string;
  modelId: string;
  abortSignal: AbortSignal;
  adapter: EngineAdapter;
  /** Tools to hide from AI agents (e.g., 'initialize_toolplex') */
  hiddenTools?: string[];
  /** Callback for when tool args are edited during confirmation */
  onArgsEdited?: (
    toolName: string,
    editedArgs: any,
    configEdited: boolean,
  ) => void;
}

/**
 * Build AI SDK tools from MCP tools
 */
export async function buildMCPTools(
  options: BuildToolsOptions,
): Promise<Record<string, any>> {
  const {
    sessionId,
    streamId,
    modelId,
    abortSignal,
    adapter,
    hiddenTools = ["initialize_toolplex"],
    onArgsEdited,
  } = options;

  const logger = adapter.logger;
  const isGemini = isGoogleGeminiModel(modelId);

  // Get tools from MCP
  const mcpToolsResult = await adapter.mcp.listTools(sessionId);
  const mcpTools: MCPTool[] = mcpToolsResult?.tools || [];

  const aiSdkTools: Record<string, any> = {};

  // Track active tool executions for cancellation
  const activeToolExecutions = new Map<string, AbortController>();

  // Clean up when stream is aborted
  abortSignal.addEventListener("abort", () => {
    logger.debug(
      "Tool builder: Stream aborted, cancelling active tool executions",
      {
        sessionId,
        streamId,
        activeToolCount: activeToolExecutions.size,
      },
    );

    for (const [
      toolExecutionId,
      controller,
    ] of activeToolExecutions.entries()) {
      logger.debug("Tool builder: Aborting tool execution", {
        toolExecutionId,
      });
      controller.abort();
    }

    activeToolExecutions.clear();
  });

  for (const mcpTool of mcpTools) {
    // Skip hidden tools
    if (hiddenTools.includes(mcpTool.name)) {
      continue;
    }

    const toolSchema = mcpTool.inputSchema || {
      type: "object",
      properties: {},
    };
    const finalSchema = cleanToolSchema(toolSchema, isGemini, logger);

    aiSdkTools[mcpTool.name] = tool({
      description: mcpTool.description || `Tool: ${mcpTool.name}`,
      inputSchema: jsonSchema<any>(finalSchema),
      execute: async (params: any): Promise<MCPToolResult> => {
        const toolExecutionId = `${mcpTool.name}-${Date.now()}`;
        const toolAbortController = new AbortController();
        activeToolExecutions.set(toolExecutionId, toolAbortController);

        // Check if stream was already aborted
        if (abortSignal.aborted) {
          logger.debug(
            "Tool builder: Stream already aborted, skipping tool execution",
            {
              toolName: mcpTool.name,
              sessionId,
            },
          );
          activeToolExecutions.delete(toolExecutionId);
          throw new Error("Stream cancelled");
        }

        try {
          // Normalize ChatGPT args -> arguments workaround
          if (
            mcpTool.name === "call_tool" &&
            isChatGPTModel(modelId) &&
            params?.args &&
            !params?.arguments
          ) {
            logger.info(
              "Tool builder: Normalizing call_tool params for ChatGPT",
              {
                modelId,
                originalKeys: Object.keys(params),
              },
            );
            const { args, ...rest } = params;
            params = { ...rest, arguments: args };
          }

          // Deep sanitize params
          const sanitizedParams = deepSanitizeParams(
            params,
            toolSchema,
            undefined,
            logger,
          );

          // Log when sanitization modifies parameters
          if (JSON.stringify(params) !== JSON.stringify(sanitizedParams)) {
            logger.debug(
              "Tool builder: deepSanitizeParams modified tool arguments",
              {
                toolName: mcpTool.name,
                sessionId,
              },
            );
          }

          // Check abort before confirmation
          if (toolAbortController.signal.aborted) {
            throw new Error("Tool execution cancelled");
          }

          // Handle confirmation if adapter supports it
          let finalParams = sanitizedParams;

          if (adapter.confirmations.isInteractive()) {
            const confirmationRequest = await checkToolConfirmation(
              mcpTool.name,
              sanitizedParams,
              { sessionId, streamId },
            );

            if (confirmationRequest) {
              logger.debug("Tool builder: Tool requires user confirmation", {
                sessionId,
                toolName: mcpTool.name,
                confirmationType: confirmationRequest.type,
              });

              try {
                const result = await adapter.confirmations.requestConfirmation(
                  streamId,
                  confirmationRequest,
                );

                if (!result.allowed) {
                  return {
                    content: [
                      {
                        type: "text",
                        text: `Operation cancelled: ${result.reason || "User denied the operation"}`,
                      },
                    ],
                  };
                }

                // Apply edited config if provided
                if (result.editedConfig) {
                  finalParams = { ...sanitizedParams };
                  if (confirmationRequest.type === "install") {
                    finalParams.config = result.editedConfig;
                  }

                  if (onArgsEdited) {
                    onArgsEdited(
                      mcpTool.name,
                      finalParams,
                      result.wasEdited === true,
                    );
                  }
                }
              } catch (confirmationError: any) {
                if (confirmationError?.message === "Stream cancelled by user") {
                  throw new Error("Tool execution cancelled");
                }
                throw confirmationError;
              }
            }
          }

          // Check abort before MCP call
          if (toolAbortController.signal.aborted) {
            throw new Error("Tool execution cancelled");
          }

          // Execute the MCP tool
          const result = await adapter.mcp.callTool(
            sessionId,
            mcpTool.name,
            finalParams,
          );

          return result;
        } catch (error: any) {
          activeToolExecutions.delete(toolExecutionId);

          if (
            toolAbortController.signal.aborted ||
            abortSignal.aborted ||
            error?.message === "Tool execution cancelled"
          ) {
            throw new Error("Tool execution cancelled");
          }

          logger.error("Tool builder: Tool execution failed", {
            sessionId,
            toolName: mcpTool.name,
            error,
          });

          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
          };
        }
      },
    } as any);
  }

  return aiSdkTools;
}

/**
 * Check if a tool requires confirmation
 * This is a simplified version - the full implementation would be in the confirmation registry
 */
async function checkToolConfirmation(
  toolName: string,
  params: any,
  _context: { sessionId: string; streamId: string },
): Promise<ConfirmationRequest | null> {
  // Install/uninstall operations always require confirmation
  if (toolName === "install_server" || toolName === "install_mcp_server") {
    return {
      type: "install",
      data: {
        serverId: params.server_id,
        serverName: params.server_name,
        config: params.config,
      },
    };
  }

  if (toolName === "uninstall_server" || toolName === "uninstall_mcp_server") {
    return {
      type: "uninstall",
      data: {
        serverId: params.server_id,
        serverName: params.server_name,
      },
    };
  }

  if (toolName === "save_playbook") {
    return {
      type: "save-playbook",
      data: {
        playbookName: params.playbook_name,
        description: params.description,
        actions: params.actions,
        privacy: params.privacy,
      },
    };
  }

  if (toolName === "submit_feedback") {
    return {
      type: "submit-feedback",
      data: {
        vote: params.vote,
        message: params.message,
      },
    };
  }

  return null;
}
