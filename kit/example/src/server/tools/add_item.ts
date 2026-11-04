// add_item: a side-effect tool (ceiling confirm in module.yaml, so the gateway holds it for a tool_confirm first).
// Writes as the acting member: a viewer's insert is refused by the items_insert policy, not by code here.
import type { ToolHandler } from '../mcp/server'

export const add_item: ToolHandler = async ({ client, member, args }) => {
  const title = typeof args.title === 'string' ? args.title.trim() : ''
  if (!title) return { isError: true, content: [{ type: 'text', text: 'invalid_request' }], structuredContent: { error: { code: 'invalid_request', message: 'title is required' } } }
  const visibility = args.visibility === 'private' ? 'private' : 'team'
  const notes = typeof args.notes === 'string' ? args.notes : ''
  const { data, error } = await client
    .from('items')
    .insert({ tenant_id: member.tenantId, owner_id: member.memberId, title, notes, visibility })
    .select('id, title, visibility, created_at')
    .single()
  if (error) {
    const code = /row-level security/i.test(error.message) ? 'member_not_allowed' : 'tool_failed'
    return { isError: true, content: [{ type: 'text', text: code }], structuredContent: { error: { code, message: error.message } } }
  }
  return { content: [{ type: 'text', text: `Added "${data.title}" (${data.visibility}).` }], structuredContent: { item: data } }
}
