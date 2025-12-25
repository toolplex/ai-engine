/**
 * @toolplex/ai-engine - Chat Engine
 *
 * Core streaming engine that orchestrates AI chat sessions.
 * Uses adapters for all platform-specific I/O operations.
 */

import { streamText, stepCountIs } from "ai";
import type { CoreMessage } from "ai";
import { randomUUID } from "crypto";

import type { EngineAdapter } from "../adapters/types.js";
import type {
  StreamOptions,
  StreamResult,
  EngineConfig,
  FileAttachment,
  ModelConfigFlags,
} from "../types/index.js";
import { getModel, toolplexUsageMap } from "../providers/index.js";
import { buildMCPTools } from "./ToolBuilder.js";

export interface ChatEngineOptions {
  adapter: EngineAdapter;
  config?: EngineConfig;
}

export class ChatEngine {
  private adapter: EngineAdapter;
  private config: EngineConfig;
  private initialized: boolean = false;

  constructor(options: ChatEngineOptions) {
    this.adapter = options.adapter;
    this.config = {
      maxSteps: 50,
      debug: false,
      hiddenTools: ["initialize_toolplex"],
      ...options.config,
    };
  }

  /**
   * Initialize the engine
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.adapter.initialize();
    this.initialized = true;
  }

  /**
   * Shutdown the engine
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;
    await this.adapter.shutdown();
    this.initialized = false;
  }

  /**
   * Initialize MCP for a session
   */
  async initializeMCP(sessionId: string): Promise<void> {
    const apiKey = await this.adapter.credentials.getToolPlexApiKey();
    const sessionInfo = this.adapter.mcp.getSessionInfo(sessionId);

    if (!sessionInfo.exists) {
      this.adapter.logger.debug("ChatEngine: Initializing MCP transport", {
        sessionId,
      });
      const result = await this.adapter.mcp.createTransport(sessionId, apiKey);

      if (!result.success) {
        throw new Error(`Failed to create MCP transport: ${result.error}`);
      }
    }
  }

  /**
   * Initialize a session with ToolPlex context
   */
  async initializeSession(
    sessionId: string,
    modelId: string,
    provider: string,
  ): Promise<{ success: boolean; context?: string; error?: string }> {
    try {
      this.adapter.logger.debug(
        "ChatEngine: Initializing session with ToolPlex",
        {
          sessionId,
          modelId,
          provider,
        },
      );

      // Initialize MCP transport
      await this.initializeMCP(sessionId);

      // Extract model metadata
      const modelParts = modelId.split("/");
      const modelName = modelParts[modelParts.length - 1] || modelId;

      const toolArgs = {
        llm_context: {
          model_family: provider,
          model_name: modelName,
          model_version: modelId,
          chat_client: "toolplex",
        },
      };

      // Call initialize_toolplex to get the context
      const result = await this.adapter.mcp.callTool(
        sessionId,
        "initialize_toolplex",
        toolArgs,
      );

      // Extract text content from the result
      let contextText = "";
      if (result && typeof result === "object" && result.content) {
        for (const item of result.content) {
          if (item.type === "text" && item.text) {
            contextText += item.text + "\n\n";
          }
        }
      } else if (typeof result === "string") {
        contextText = result;
      }

      return {
        success: true,
        context: contextText.trim(),
      };
    } catch (error) {
      this.adapter.logger.error("ChatEngine: Failed to initialize session", {
        sessionId,
        error,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Stream a chat completion
   */
  async stream(options: StreamOptions): Promise<StreamResult> {
    const credentials = await this.adapter.credentials.getCredentials();
    const streamId = options.streamId || randomUUID();

    const {
      sessionId,
      modelId,
      provider,
      messages,
      tools: providedTools,
      temperature,
      topP,
      fileAttachments,
      modelConfig,
    } = options;

    this.adapter.logger.debug("ChatEngine: Starting stream", {
      sessionId,
      modelId,
      provider,
      messageCount: messages.length,
      hasTools: !!providedTools,
      hasAttachments: !!fileAttachments?.length,
      streamId,
    });

    // Create abort controller
    const abortController = new AbortController();

    // Get the model
    const model = getModel(modelId, credentials, {
      logger: this.adapter.logger,
      clientVersion: this.adapter.getClientVersion(),
    });

    // Build MCP tools
    let mcpTools: Record<string, any> = {};
    const apiKey = await this.adapter.credentials.getToolPlexApiKey();
    if (apiKey) {
      try {
        await this.initializeMCP(sessionId);
        mcpTools = await buildMCPTools({
          sessionId,
          streamId,
          modelId,
          abortSignal: abortController.signal,
          adapter: this.adapter,
          hiddenTools: this.config.hiddenTools,
        });
      } catch (error) {
        this.adapter.logger.error(
          "ChatEngine: Failed to initialize MCP tools",
          {
            sessionId,
            error,
          },
        );
        // Continue without tools
      }
    }

    // Merge tools
    const allTools = { ...providedTools, ...mcpTools };

    // Process messages
    const processedMessages = this.processMessages(
      messages,
      fileAttachments,
      modelConfig,
    );

    // Track usage data
    let capturedUsage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    } | null = null;

    // Promise for onFinish coordination
    let resolveOnFinish: (() => void) | null = null;
    const onFinishPromise = new Promise<void>((resolve) => {
      resolveOnFinish = resolve;
    });

    // Prepare stream options
    const streamTextOptions: any = {
      model,
      messages: processedMessages,
      tools: allTools,
      stopWhen: stepCountIs(this.config.maxSteps!),
      temperature,
      topP,
      abortSignal: abortController.signal,
    };

    // Enforce maxTokens if specified by model config
    if (modelConfig?.enforceMaxTokens && modelConfig?.maxOutputTokens) {
      streamTextOptions.maxTokens = modelConfig.maxOutputTokens;
    }

    // Start streaming
    const result = streamText({
      ...streamTextOptions,
      headers: {
        "x-session-id": sessionId,
        ...(provider === "openrouter" && {
          "HTTP-Referer": "https://toolplex.ai",
          "X-Title": "ToolPlex AI",
        }),
      },
      onChunk: async (event: any) => {
        // Capture usage data
        if (provider === "toolplex" && event.chunk) {
          const chunk = event.chunk as any;

          if (chunk.providerMetadata?.usage || chunk.usage) {
            const usage = chunk.providerMetadata?.usage || chunk.usage;
            const promptTokens = usage.prompt_tokens || usage.input_tokens || 0;
            const completionTokens =
              usage.completion_tokens || usage.output_tokens || 0;
            const totalTokens =
              usage.total_tokens || promptTokens + completionTokens;

            capturedUsage = {
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: totalTokens,
            };
          }
        }
      },
      onStepFinish: async (event: any) => {
        // Emit step finish event if there are tool calls
        const hasToolCalls = event.toolCalls && event.toolCalls.length > 0;

        if (hasToolCalls) {
          this.adapter.logger.debug(
            "ChatEngine: Step finished with tool calls",
            {
              sessionId,
              textLength: event.text?.length || 0,
              toolCallCount: event.toolCalls.length,
            },
          );
        }
      },
      onFinish: async (completion: any) => {
        this.adapter.logger.debug("ChatEngine: Stream finished", {
          sessionId,
          textLength: completion.text?.length,
          finishReason: completion.finishReason,
          usage: completion.usage,
        });

        // Get usage data
        let usageSource = completion.usage;

        if (provider === "toolplex") {
          const mapUsage = toolplexUsageMap.get(sessionId);
          if (mapUsage) {
            usageSource = mapUsage;
            toolplexUsageMap.delete(sessionId);
          } else if (capturedUsage) {
            usageSource = capturedUsage;
          }
        }

        // Emit complete event
        this.adapter.events.emitComplete(
          streamId,
          completion.text || "",
          usageSource
            ? {
                promptTokens:
                  usageSource.prompt_tokens ||
                  usageSource.inputTokens ||
                  usageSource.promptTokens ||
                  0,
                completionTokens:
                  usageSource.completion_tokens ||
                  usageSource.outputTokens ||
                  usageSource.completionTokens ||
                  0,
                totalTokens:
                  usageSource.total_tokens || usageSource.totalTokens || 0,
              }
            : undefined,
        );

        if (resolveOnFinish) {
          resolveOnFinish();
        }
      },
      onError: (error) => {
        this.adapter.logger.error("ChatEngine: Stream error", {
          error,
          sessionId,
          modelId,
        });

        // Extract error message, handling various error formats
        let errorMessage: string;
        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (typeof error === "string") {
          errorMessage = error;
        } else if (error && typeof error === "object") {
          // Handle objects with message property or stringify
          errorMessage =
            (error as any).message ||
            (error as any).error ||
            JSON.stringify(error);
        } else {
          errorMessage = "Unknown error";
        }

        this.adapter.events.emitError(streamId, errorMessage);

        if (resolveOnFinish) {
          resolveOnFinish();
        }
      },
    });

    return {
      streamId,
      textStream: result.textStream,
      fullStream: result.fullStream,
      onFinishPromise,
      abort: async () => {
        this.adapter.logger.debug("ChatEngine: Aborting stream", {
          streamId,
          sessionId,
        });
        abortController.abort();
      },
    };
  }

  /**
   * Process messages for streaming (handle attachments, filter empty blocks)
   */
  private processMessages(
    messages: CoreMessage[],
    fileAttachments?: FileAttachment[],
    modelConfig?: ModelConfigFlags,
  ): CoreMessage[] {
    let processedMessages: CoreMessage[] = [...messages];

    // Filter empty text blocks (unless model requires preserving them)
    if (!modelConfig?.preserveEmptyContentBlocks) {
      processedMessages = processedMessages.map((msg) => {
        if (
          (msg.role === "user" || msg.role === "assistant") &&
          Array.isArray(msg.content)
        ) {
          const filteredContent = msg.content.filter((part: any) => {
            if (part.type !== "text") return true;
            return part.text && part.text.trim().length > 0;
          });

          return {
            ...msg,
            content: filteredContent.length > 0 ? filteredContent : "",
          } as CoreMessage;
        }
        return msg;
      });
    }

    // Handle file attachments
    if (fileAttachments && fileAttachments.length > 0) {
      const lastMessage = processedMessages[processedMessages.length - 1];
      if (lastMessage && lastMessage.role === "user") {
        const textContent =
          typeof lastMessage.content === "string" ? lastMessage.content : "";

        const parts: any[] = textContent.trim()
          ? [{ type: "text", text: textContent }]
          : [];

        for (const attachment of fileAttachments) {
          const mimeType = attachment.mimeType || (attachment as any).type;

          if (!mimeType) {
            parts.push({
              type: "text",
              text: `[Attached file: ${attachment.name} - type unknown]`,
            });
            continue;
          }

          if (mimeType.startsWith("image/")) {
            parts.push({
              type: "image",
              image: attachment.data,
              mimeType: mimeType,
            });
          } else if (
            mimeType === "application/pdf" ||
            mimeType.startsWith("text/") ||
            mimeType.startsWith("application/")
          ) {
            parts.push({
              type: "file",
              data: Buffer.from(attachment.data, "base64"),
              mediaType: mimeType,
            });
          } else {
            parts.push({
              type: "text",
              text: `[Attached file: ${attachment.name}]`,
            });
          }
        }

        processedMessages[processedMessages.length - 1] = {
          ...lastMessage,
          content: parts,
        };
      }
    }

    return processedMessages;
  }
}
