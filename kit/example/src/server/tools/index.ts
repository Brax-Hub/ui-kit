// The tool handlers the MCP server dispatches to: one file per manifest tool under this folder, named after the tool,
// listed here. The scanner checks that the set of files equals the set of tools in module.yaml and that nothing but
// src/server/mcp/server.ts imports this registry.
import type { ToolHandler } from '../mcp/server'
import { add_item } from './add_item'
import { list_items } from './list_items'

export const handlers: Record<string, ToolHandler> = { list_items, add_item }
