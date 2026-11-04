// list_items: the items the acting member may see, through their own client, so RLS decides what a viewer, a member
// or an owner gets. Arguments as module.yaml declares them (the gateway validated them against that schema).
import type { ToolHandler } from '../mcp/server'

export const list_items: ToolHandler = async ({ client, args }) => {
  const limit = Math.min(Math.max(Number(args.limit ?? 20) || 20, 1), 100)
  let query = client.from('items_with_owner').select('id, title, notes, visibility, owner_name, created_at').order('created_at', { ascending: false }).limit(limit)
  if (typeof args.query === 'string' && args.query.trim()) query = query.ilike('title', `%${args.query.trim()}%`)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const items = data ?? []
  return {
    content: [{ type: 'text', text: items.length ? items.map((i) => `${i.title} (${i.visibility}, ${i.owner_name})`).join('\n') : 'No items.' }],
    structuredContent: { items },
  }
}
