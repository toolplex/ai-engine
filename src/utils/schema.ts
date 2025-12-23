/**
 * @toolplex/ai-engine - Schema Utilities
 *
 * Pure utility functions for JSON Schema manipulation.
 * Used for tool schema processing before passing to AI SDK.
 */

import type { LoggerAdapter } from "../adapters/types.js";

/**
 * Deep sanitize tool parameters by recursively parsing stringified JSON values
 *
 * Some LLMs incorrectly stringify nested objects in tool parameters.
 * This function recursively detects and parses such stringified values while
 * respecting the tool's input schema to avoid corrupting legitimate string parameters.
 *
 * CRITICAL FIX: This function is now schema-aware. It will NOT parse strings that
 * the schema explicitly declares as type "string". This prevents catastrophic bugs
 * where tools expecting JSON content as a string (e.g., write_file) would receive
 * a parsed object instead.
 *
 * FIELD-AWARE FIX: Special handling for the 'arguments' field in call_tool.
 * ChatGPT and other models sometimes stringify this field even though it should
 * always be an object. This is a documented OpenAI issue (July 2024).
 *
 * @param params - The parameters to sanitize
 * @param schema - The JSON Schema for these parameters (optional but recommended)
 * @param fieldName - The name of the field being processed (for field-aware logic)
 * @param logger - Optional logger for debug output
 * @returns Sanitized parameters
 */
export function deepSanitizeParams(
  params: any,
  schema?: any,
  fieldName?: string,
  logger?: LoggerAdapter,
): any {
  if (params === null || params === undefined) {
    return params;
  }

  // If it's a string, check schema before attempting to parse
  if (typeof params === "string") {
    const trimmed = params.trim();

    // Only consider parsing if it looks like JSON (starts with { or [)
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      // CRITICAL: If schema explicitly says this should be a string, NEVER parse
      // This prevents corrupting legitimate JSON content that tools expect as strings
      if (schema?.type === "string") {
        return params;
      }

      // If schema says this should be an object or array, parse it
      // This fixes LLMs that accidentally stringify nested objects
      if (schema?.type === "object" || schema?.type === "array") {
        try {
          const parsed = JSON.parse(params);
          return deepSanitizeParams(parsed, schema, fieldName, logger);
        } catch {
          // Invalid JSON, return as-is
          return params;
        }
      }

      // FIELD-AWARE FIX: Special handling for 'arguments' field
      // Known issue: ChatGPT sometimes stringifies the arguments field in call_tool
      // even though it should always be an object (OpenAI bug documented July 2024)
      if (fieldName === "arguments") {
        try {
          const parsed = JSON.parse(params);
          logger?.info(
            'Parsed stringified "arguments" field (ChatGPT workaround)',
            {
              fieldName,
              originalType: typeof params,
              parsedType: typeof parsed,
              hadSchema: !!schema,
            },
          );
          return deepSanitizeParams(parsed, schema, fieldName, logger);
        } catch {
          // Invalid JSON, let validation fail naturally
          logger?.warn('Failed to parse stringified "arguments" field', {
            fieldName,
          });
          return params;
        }
      }

      // No schema or ambiguous schema - be conservative and don't parse
      return params;
    }

    // Regular string (doesn't look like JSON), return as-is
    return params;
  }

  // If it's an array, recursively sanitize each element
  if (Array.isArray(params)) {
    const itemSchema = schema?.items;
    return params.map((item) =>
      deepSanitizeParams(item, itemSchema, fieldName, logger),
    );
  }

  // If it's an object, recursively sanitize each property with its schema
  if (typeof params === "object") {
    const sanitized: any = {};
    const properties = schema?.properties || {};

    for (const [key, value] of Object.entries(params)) {
      const propertySchema = properties[key];
      // Pass the key as fieldName for field-aware logic
      sanitized[key] = deepSanitizeParams(value, propertySchema, key, logger);
    }
    return sanitized;
  }

  // Primitive value, return as-is
  return params;
}

/**
 * Resolve $ref references in JSON Schema by inlining from $defs
 *
 * Some MCP servers (like ElevenLabs) return tool schemas with $ref references
 * that point to $defs entries. The AI SDK's jsonSchema() validator (via AJV)
 * fails to resolve these references if they're not properly structured.
 *
 * This function:
 * 1. Extracts $defs from the root schema (if present)
 * 2. Recursively replaces $ref references with their actual definitions
 * 3. Falls back to permissive schema ({}) for unresolved references
 *
 * @param schema - The JSON Schema to process
 * @param defs - The $defs object from the root schema (optional, extracted from schema if not provided)
 * @param logger - Optional logger for warnings
 * @returns Schema with $ref references resolved
 */
export function resolveSchemaRefs(
  schema: any,
  defs?: Record<string, any>,
  logger?: LoggerAdapter,
): any {
  if (!schema || typeof schema !== "object") return schema;

  // Extract $defs from root schema if not provided
  if (!defs && schema.$defs) {
    defs = schema.$defs;
  }

  // Handle arrays
  if (Array.isArray(schema)) {
    return schema.map((item) => resolveSchemaRefs(item, defs, logger));
  }

  // Check if this is a $ref
  if (schema.$ref && typeof schema.$ref === "string") {
    // Parse the $ref to extract the definition name
    // Format: "#/$defs/DefinitionName" or "#/definitions/DefinitionName"
    const refMatch = schema.$ref.match(/^#\/(\$defs|definitions)\/(.+)$/);

    if (refMatch && defs) {
      const defName = refMatch[2];
      const resolvedDef = defs[defName];

      if (resolvedDef) {
        // Recursively resolve any nested $refs in the definition
        // Merge any other properties from the $ref schema (like description)
        const { $ref: _ref, ...otherProps } = schema;
        const resolved = resolveSchemaRefs(resolvedDef, defs, logger);
        return { ...resolved, ...otherProps };
      }
    }

    // Unresolved $ref - replace with permissive schema
    logger?.warn("Unresolved $ref in tool schema, using permissive schema", {
      ref: schema.$ref,
      availableDefs: defs ? Object.keys(defs) : [],
    });
    return {}; // Permissive schema - accepts anything
  }

  // Recursively process object properties
  const result: any = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "$defs" || key === "definitions") {
      // Keep $defs in result for nested resolution
      result[key] = value;
    } else {
      result[key] = resolveSchemaRefs(value, defs, logger);
    }
  }

  return result;
}

/**
 * Sanitize JSON Schema for Google Gemini compatibility
 *
 * Gemini has strict schema requirements for function calling:
 * - No oneOf, anyOf, allOf constructs
 * - No const values
 * - enum only allowed for string types
 * - Object types must have properties defined (even if empty)
 * - required arrays cause issues with AI SDK transformation
 */
export function sanitizeSchemaForGemini(schema: any): any {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) {
    return schema.map((item) => sanitizeSchemaForGemini(item));
  }

  const result: any = {};

  for (const [key, value] of Object.entries(schema)) {
    // Skip unsupported constructs
    if (
      key === "oneOf" ||
      key === "anyOf" ||
      key === "allOf" ||
      key === "const"
    ) {
      continue;
    }

    // Skip enum on non-string types
    if (key === "enum" && schema.type !== "string") {
      continue;
    }

    // Skip required arrays entirely - Gemini has issues with AI SDK's transformation
    if (key === "required") {
      continue;
    }

    // Recursively sanitize nested structures
    if (key === "properties" && typeof value === "object") {
      result[key] = {};
      for (const [propName, propValue] of Object.entries(
        value as Record<string, any>,
      )) {
        result[key][propName] = sanitizeSchemaForGemini(propValue);
      }
      continue;
    }

    if (
      (key === "items" || key === "additionalProperties") &&
      typeof value === "object"
    ) {
      result[key] = sanitizeSchemaForGemini(value);
      continue;
    }

    if (typeof value === "object" && value !== null) {
      result[key] = sanitizeSchemaForGemini(value);
    } else {
      result[key] = value;
    }
  }

  // Ensure object types have properties defined
  if (result.type === "object" && !result.properties) {
    result.properties = {};
  }

  return result;
}

/**
 * Clean a tool schema for AI SDK consumption
 *
 * Combines all schema processing steps:
 * 1. Remove $schema reference
 * 2. Resolve $ref references
 * 3. Apply Gemini sanitization if needed
 *
 * @param schema - Raw tool input schema from MCP
 * @param isGemini - Whether the target model is Google Gemini
 * @param logger - Optional logger
 * @returns Cleaned schema ready for AI SDK
 */
export function cleanToolSchema(
  schema: any,
  isGemini: boolean = false,
  logger?: LoggerAdapter,
): any {
  if (!schema) {
    return { type: "object", properties: {} };
  }

  // Deep clone to avoid mutating original
  const cleanedSchema = JSON.parse(JSON.stringify(schema));
  delete cleanedSchema.$schema;

  // Resolve $ref references
  const resolvedSchema = resolveSchemaRefs(cleanedSchema, undefined, logger);

  // Remove $defs after resolution
  delete resolvedSchema.$defs;
  delete resolvedSchema.definitions;

  // Apply Gemini-specific sanitization if needed
  return isGemini ? sanitizeSchemaForGemini(resolvedSchema) : resolvedSchema;
}
