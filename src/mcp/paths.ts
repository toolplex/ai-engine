/**
 * @toolplex/ai-engine - MCP Paths
 *
 * Utilities for locating @toolplex/client MCP server.
 */

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createRequire } from "module";

// Create __dirname equivalent for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create require function for ESM (for require.resolve)
const require = createRequire(import.meta.url);

/**
 * Get the path to @toolplex/client's MCP server entry point.
 *
 * This resolves the path regardless of where npm installs the package
 * (hoisted or nested in node_modules).
 *
 * @returns Path to the MCP server index.js
 * @throws Error if @toolplex/client cannot be found
 */
export function getToolplexClientPath(): string {
  // Try to resolve using require.resolve
  try {
    const clientPackageJson = require.resolve("@toolplex/client/package.json");
    const clientDir = path.dirname(clientPackageJson);
    const mcpServerPath = path.join(
      clientDir,
      "dist",
      "mcp-server",
      "index.js",
    );

    if (fs.existsSync(mcpServerPath)) {
      return mcpServerPath;
    }
  } catch {
    // require.resolve failed, try fallback paths
  }

  // Fallback: try common paths
  const fallbackPaths = [
    // From process.cwd() (development)
    path.resolve(
      process.cwd(),
      "node_modules/@toolplex/client/dist/mcp-server/index.js",
    ),
    // From this module's location (when installed as dependency)
    path.resolve(
      __dirname,
      "../../node_modules/@toolplex/client/dist/mcp-server/index.js",
    ),
    path.resolve(
      __dirname,
      "../../../node_modules/@toolplex/client/dist/mcp-server/index.js",
    ),
    path.resolve(
      __dirname,
      "../../../../node_modules/@toolplex/client/dist/mcp-server/index.js",
    ),
  ];

  // Add Electron production path if available (process.resourcesPath is Electron-specific)
  const electronProcess = process as typeof process & {
    resourcesPath?: string;
  };
  if (electronProcess.resourcesPath) {
    fallbackPaths.push(
      path.resolve(
        electronProcess.resourcesPath,
        "app/node_modules/@toolplex/client/dist/mcp-server/index.js",
      ),
    );
  }

  for (const fallbackPath of fallbackPaths) {
    if (fs.existsSync(fallbackPath)) {
      return fallbackPath;
    }
  }

  throw new Error(
    "@toolplex/client not found. Make sure @toolplex/ai-engine is properly installed.",
  );
}
