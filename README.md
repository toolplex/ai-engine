# @toolplex/ai-engine

The core AI chat engine for [ToolPlex](https://toolplex.ai). A TypeScript SDK that provides a unified interface for building AI-powered applications with tool calling via the Model Context Protocol (MCP).

## Features

- **Multi-provider support** - Anthropic, OpenAI, Google Gemini, OpenRouter
- **MCP integration** - Connect to ToolPlex's MCP server for powerful tool calling
- **Transport abstraction** - Works in CLI, desktop (Electron), or cloud environments
- **AI SDK wrapper** - Built on [Vercel AI SDK](https://sdk.vercel.ai) with ToolPlex-specific enhancements

## Installation

```bash
npm install @toolplex/ai-engine
```

## Quick Start

### Basic Chat (No Tools)

```typescript
import { streamText, createAnthropic } from '@toolplex/ai-engine';

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const result = await streamText({
  model: anthropic('claude-sonnet-4-20250514'),
  messages: [{ role: 'user', content: 'Hello!' }],
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

### With ToolPlex MCP Tools

```typescript
import {
  MCPClient,
  defaultStdioTransportFactory,
  streamText,
  createAnthropic
} from '@toolplex/ai-engine';

// Create MCP client (connects to @toolplex/client)
const mcpClient = new MCPClient({
  transportFactory: defaultStdioTransportFactory,
});

// Create a session
await mcpClient.createSession('my-session', process.env.TOOLPLEX_API_KEY);

// List available tools
const { tools } = await mcpClient.listTools('my-session');
console.log('Available tools:', tools.map(t => t.name));

// Call a tool
const result = await mcpClient.callTool('my-session', 'search_servers', {
  query: 'weather',
});

// Clean up
await mcpClient.destroySession('my-session');
```

## API Reference

### Providers

```typescript
import {
  createAnthropic,
  createOpenAI,
  createGoogleGenerativeAI,
  createOpenRouter,
  getProvider,
  getModel,
} from '@toolplex/ai-engine';

// Direct provider creation
const anthropic = createAnthropic({ apiKey: '...' });
const openai = createOpenAI({ apiKey: '...' });

// Or use the unified getProvider helper
const model = getModel('anthropic/claude-sonnet-4-20250514', {
  anthropicApiKey: '...',
});
```

### MCP Client

```typescript
import { MCPClient, TransportFactory } from '@toolplex/ai-engine';

const client = new MCPClient({
  transportFactory: myTransportFactory,
  logger: console, // optional
});

// Session management
await client.createSession(sessionId, apiKey, resumeHistory?);
await client.destroySession(sessionId);
client.getActiveSessions();
client.hasSession(sessionId);

// Tool operations
await client.listTools(sessionId);
await client.callTool(sessionId, toolName, args);
```

### Transport Factory

The `TransportFactory` interface allows you to customize how the MCP server is spawned:

```typescript
import { TransportFactory, MCPSession } from '@toolplex/ai-engine';

class MyCustomTransportFactory implements TransportFactory {
  async createTransport(apiKey: string, resumeHistory?: string): Promise<MCPSession> {
    // Spawn @toolplex/client with custom configuration
    // Return { client, transport }
  }

  async closeTransport(session: MCPSession): Promise<void> {
    await session.client.close();
  }
}
```

**Built-in transports:**

- `defaultStdioTransportFactory` - Uses system Node.js (for CLI apps)

### Utilities

```typescript
import {
  // Schema utilities
  deepSanitizeParams,
  resolveSchemaRefs,
  sanitizeSchemaForGemini,

  // Model detection
  isChatGPTModel,
  isGoogleGeminiModel,
  isAnthropicModel,
  parseModelId,

  // Path utilities
  getToolplexClientPath,
} from '@toolplex/ai-engine';
```

### AI SDK Re-exports

For convenience, common AI SDK exports are re-exported:

```typescript
import {
  streamText,
  tool,
  jsonSchema,
  stepCountIs,
  type CoreMessage,
  type ToolResultPart,
  type ToolCallPart,
} from '@toolplex/ai-engine';
```

## Custom Transport Example (Electron)

For Electron apps with bundled Node.js:

```typescript
import {
  MCPClient,
  MCPSDKClient as Client,
  StdioClientTransport,
  getToolplexClientPath,
  type TransportFactory,
  type MCPSession,
} from '@toolplex/ai-engine';

class ElectronTransportFactory implements TransportFactory {
  async createTransport(apiKey: string): Promise<MCPSession> {
    const toolplexPath = getToolplexClientPath();

    const transport = new StdioClientTransport({
      command: '/path/to/bundled/node', // Use bundled Node.js
      args: [toolplexPath],
      env: {
        ...process.env,
        TOOLPLEX_API_KEY: apiKey,
      },
    });

    const client = new Client({ name: 'my-app', version: '1.0.0' });
    await client.connect(transport);

    return { transport, client };
  }

  async closeTransport(session: MCPSession): Promise<void> {
    await session.client.close();
  }
}

const mcpClient = new MCPClient({
  transportFactory: new ElectronTransportFactory(),
});
```

## Environment Variables

When using `defaultStdioTransportFactory`, these environment variables are passed to the MCP server:

- `TOOLPLEX_API_KEY` - Your ToolPlex API key (required)
- `TOOLPLEX_SESSION_RESUME_HISTORY` - JSON string containing historical tool usage for resumed sessions

### Session Resume History

When restoring a chat session from a database, the MCP server needs context about what tools were previously used. This allows the enforcement layer to validate operations like `save_playbook` and `submit_feedback` which depend on historical tool usage.

The `resumeHistory` parameter is a JSON string with the following structure:

```typescript
interface SessionResumeHistory {
  tool_calls: Array<{ server_id: string; tool_name: string }>;
  installs: Array<{ server_id: string }>;
  uninstalls: Array<{ server_id: string }>;
}
```

**Example usage:**

```typescript
// When creating a session with history (e.g., restoring from database)
const resumeHistory = JSON.stringify({
  tool_calls: [
    { server_id: 'weather-server', tool_name: 'get_forecast' },
    { server_id: 'calendar-server', tool_name: 'create_event' },
  ],
  installs: [
    { server_id: 'weather-server' },
  ],
  uninstalls: [],
});

await mcpClient.createSession('my-session', apiKey, resumeHistory);
```

**In a custom transport factory:**

```typescript
class MyTransportFactory implements TransportFactory {
  async createTransport(apiKey: string, sessionResumeHistory?: string): Promise<MCPSession> {
    const transport = new StdioClientTransport({
      command: 'node',
      args: [toolplexPath],
      env: {
        ...process.env,
        TOOLPLEX_API_KEY: apiKey,
        // Pass resume history to the MCP server process
        ...(sessionResumeHistory && { TOOLPLEX_SESSION_RESUME_HISTORY: sessionResumeHistory }),
      },
    });

    const client = new Client({ name: 'my-app', version: '1.0.0' });
    await client.connect(transport);
    return { transport, client };
  }
}
```

This is particularly useful in desktop applications where chat sessions are persisted and can be restored later.

## Requirements

- Node.js 18+
- A ToolPlex API key (get one at [toolplex.ai](https://toolplex.ai))

## License

[BSL 1.1](./LICENSE)

## Links

- [ToolPlex](https://toolplex.ai)
- [Documentation](https://docs.toolplex.ai)
- [@toolplex/client](https://github.com/toolplex/client) - The MCP server
