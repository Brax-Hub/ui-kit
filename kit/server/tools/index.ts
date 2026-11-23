// The tool handlers the MCP server dispatches to: one file per manifest tool under this folder, named after the tool,
// listed here. The scanner checks that the set of files equals the set of tools in module.yaml and that nothing but
// src/server/mcp/server.ts imports this registry. In the kit this registry is empty; an app made from it adds its own.
import type { ToolHandler } from '../mcp/server'

export const handlers: Record<string, ToolHandler> = {}
