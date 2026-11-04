#!/usr/bin/env node
// A local stand-in for the hub's model gateway, for development and the suites (brax-hub-module 6: a module never
// holds a provider key; the hub answers OpenAI-shaped chat completions). It speaks just enough for an app's real code
// to run, with no credential:
//   POST /v1/chat/completions, POST /ai/v1/chat/completions   a canned answer in the OpenAI chat shape. A user message
//                                  of the form `CALL tool {json}` becomes a tool call, a tool result comes back as the
//                                  answer, a file part gets a stub summary. It says nothing about how a real model
//                                  behaves.
//   GET  /v1/models                 one model, "agent"
//   GET  /last                      the last completion request, for tests to inspect
//   GET  /services/module/contacts  the four seeded members with chat addresses (what LCC's route returns)
// AI_STUB_PORT moves it off 54399. STUB_DENY=ai.generate,contacts.read answers 403 scope_required for those scopes,
// to test the "not enabled on this hub" states.
import { createServer } from 'node:http'

const PORT = Number(process.env.AI_STUB_PORT ?? 54399)
const DENY = new Set((process.env.STUB_DENY ?? '').split(',').filter(Boolean))
let last = null

const CONTACTS = [
  { address: 'olivia@hub.local', display_name: 'Olivia Owner', role: 'owner' },
  { address: 'adam@hub.local', display_name: 'Adam Admin', role: 'admin' },
  { address: 'mia@hub.local', display_name: 'Mia Member', role: 'member' },
  { address: 'victor@hub.local', display_name: 'Victor Viewer', role: 'member' },
]

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function completion(message, finish = 'stop') {
  return { id: `chatcmpl-stub-${Date.now()}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: 'agent', choices: [{ index: 0, message, finish_reason: finish }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
}

function answer(request) {
  const lastMessage = request.messages?.at(-1)
  if (lastMessage?.role === 'tool') {
    const results = request.messages.filter((m) => m.role === 'tool').map((m) => m.content).join('\n')
    return completion({ role: 'assistant', content: `RESULT: ${results}` })
  }
  const content = lastMessage?.content
  if (Array.isArray(content) && content.some((p) => p.type === 'file')) return completion({ role: 'assistant', content: 'Stub summary of the document.' })
  const question = typeof content === 'string' ? content : ''
  const call = /^CALL (\S+) (\{.*\})$/s.exec(question)
  if (call) return completion({ role: 'assistant', content: null, tool_calls: [{ id: 'call_stub', type: 'function', function: { name: call[1], arguments: call[2] } }] }, 'tool_calls')
  return completion({ role: 'assistant', content: 'Stub answer.' })
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (req.method === 'GET' && url.pathname === '/last') return json(res, 200, last)
  if (req.method === 'GET' && (url.pathname === '/v1/models' || url.pathname === '/ai/v1/models')) return json(res, 200, { object: 'list', data: [{ id: 'agent', object: 'model' }] })
  if (req.method === 'GET' && url.pathname === '/services/module/contacts') {
    if (DENY.has('contacts.read')) return json(res, 403, { detail: 'scope_required' })
    return json(res, 200, { items: CONTACTS })
  }
  let body = ''
  req.on('data', (chunk) => (body += chunk))
  req.on('end', () => {
    let request
    try {
      request = body ? JSON.parse(body) : {}
    } catch {
      return json(res, 400, { error: 'bad_json' })
    }
    if (url.pathname === '/v1/chat/completions' || url.pathname === '/ai/v1/chat/completions') {
      if (DENY.has('ai.generate')) return json(res, 403, { detail: 'scope_required' })
      last = { headers: { 'brax-agent': req.headers['brax-agent'] ?? null, 'brax-acting-member': req.headers['brax-acting-member'] ?? null, 'brax-request-id': req.headers['brax-request-id'] ?? null }, body: request }
      return json(res, 200, answer(request))
    }
    json(res, 404, { error: 'not_found' })
  })
})

server.listen(PORT, '127.0.0.1', () => console.log(`ai stub on http://127.0.0.1:${PORT} (POST /v1/chat/completions)`))
