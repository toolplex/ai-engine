/**
 * @toolplex/ai-engine - ToolPlex Provider
 *
 * Custom ToolPlex Provider for Vercel AI SDK.
 * Wraps the ToolPlex AI API backend (api.toolplex.ai) which proxies OpenRouter
 * and returns OpenRouter-format SSE streaming responses.
 *
 * The backend handles:
 * - Authentication via ToolPlex API keys (x-api-key header)
 * - Usage tracking and enforcement
 * - OpenRouter model access
 * - Tool call handling
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LoggerAdapter } from "../adapters/types.js";

export interface ToolPlexConfig {
  apiKey: string;
  baseURL?: string;
  clientVersion?: string;
  logger?: LoggerAdapter;
}

/**
 * Global map to store usage data from DONE events
 * Key: sessionId, Value: Usage data from backend
 * This is cleared after being read by the engine
 */
export const toolplexUsageMap = new Map<
  string,
  {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost?: number;
  }
>();

/**
 * ToolPlex model factory function type
 */
export type ToolPlexModelFactory = (modelId: string) => any;

/**
 * Create a ToolPlex provider instance
 *
 * Uses the specialized OpenRouter SDK provider with custom configuration to work with
 * the ToolPlex backend API which proxies OpenRouter and returns OpenRouter's SSE format.
 */
export function createToolPlex(config: ToolPlexConfig): ToolPlexModelFactory {
  const baseURL = config.baseURL || "https://api.toolplex.ai";
  const logger = config.logger;

  // Build headers
  const headers: Record<string, string> = {
    "x-api-key": config.apiKey,
  };

  if (config.clientVersion) {
    headers["X-Client-Version"] = config.clientVersion;
  }

  // Create OpenRouter provider with custom configuration for ToolPlex backend
  const provider = createOpenRouter({
    apiKey: config.apiKey,
    baseURL: `${baseURL}/ai`,
    headers,
    // Custom fetch to transform requests and intercept DONE events for usage data
    fetch: async (url, init) => {
      // Add provider field and session_id to request body
      if (init?.body && typeof init.body === "string") {
        try {
          const body = JSON.parse(init.body);

          // Extract session ID from headers if present
          let sessionId: string | null = null;
          if (init?.headers) {
            if (init.headers instanceof Headers) {
              sessionId = init.headers.get("x-session-id");
            } else if (Array.isArray(init.headers)) {
              const sessionHeader = init.headers.find(
                ([key]) => key.toLowerCase() === "x-session-id",
              );
              sessionId = sessionHeader ? sessionHeader[1] : null;
            } else {
              sessionId =
                (init.headers as Record<string, string>)["x-session-id"] ||
                null;
            }
          }

          logger?.debug("ToolPlex provider: Transforming request", {
            hasSessionId: !!sessionId,
            sessionId: sessionId ? sessionId.substring(0, 8) + "..." : null,
            bodyKeys: Object.keys(body),
          });

          const toolplexBody = {
            ...body,
            provider: "openrouter",
            ...(sessionId && { session_id: sessionId }),
          };

          init = {
            ...init,
            body: JSON.stringify(toolplexBody),
          };
        } catch (error) {
          logger?.error("Failed to transform ToolPlex request", { error });
        }
      }

      const response = await fetch(url, init);

      // Intercept SSE stream to capture usage from DONE event
      if (
        response.body &&
        response.headers.get("content-type")?.includes("text/event-stream")
      ) {
        const originalBody = response.body;
        const reader = originalBody.getReader();
        const decoder = new TextDecoder();

        // Create a new readable stream that intercepts SSE events
        const transformedStream = new ReadableStream({
          async start(controller) {
            let buffer = "";

            try {
              while (true) {
                const { done, value } = await reader.read();

                if (done) {
                  controller.close();
                  break;
                }

                // Decode chunk and add to buffer
                buffer += decoder.decode(value, { stream: true });

                // Process complete SSE events (separated by \n\n)
                const events = buffer.split("\n\n");
                buffer = events.pop() || ""; // Keep incomplete event in buffer

                // Filter out DONE events and track usage
                const filteredEvents: string[] = [];

                for (const event of events) {
                  if (event.trim()) {
                    // Parse SSE event (format: "data: {...}")
                    const match = event.match(/^data: (.+)$/m);
                    if (match) {
                      try {
                        const data = JSON.parse(match[1]);

                        // Check for DONE event with usage data
                        if (data.done === true && data.usage) {
                          const sessionId = (init?.headers as any)?.[
                            "x-session-id"
                          ];

                          if (sessionId) {
                            toolplexUsageMap.set(sessionId, {
                              prompt_tokens: data.usage.prompt_tokens || 0,
                              completion_tokens:
                                data.usage.completion_tokens || 0,
                              total_tokens: data.usage.total_tokens || 0,
                              cost: data.usage.cost,
                            });
                          }

                          // Skip this event to prevent AI SDK from seeing invalid chunk format
                          continue;
                        }
                      } catch {
                        // Not JSON or different format - keep the event
                      }
                    }
                  }

                  // Keep this event
                  filteredEvents.push(event);
                }

                // Reconstruct the filtered stream
                if (filteredEvents.length > 0) {
                  const filteredBuffer = filteredEvents.join("\n\n") + "\n\n";
                  controller.enqueue(Buffer.from(filteredBuffer, "utf8"));
                }
              }
            } catch (error) {
              logger?.error("Error intercepting ToolPlex SSE stream", {
                error,
              });
              controller.error(error);
            }
          },
        });

        // Return a new response with the transformed stream
        return new Response(transformedStream, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }

      return response;
    },
  });

  // Return a function that creates model instances
  return function (modelId: string) {
    return provider.chat(modelId);
  };
}
