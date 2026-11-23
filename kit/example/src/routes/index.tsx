import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { addItemFn, deleteItemFn, listItemsFn } from '@/server/items.functions'

export const Route = createFileRoute('/')({
  loader: () => listItemsFn(),
  component: ItemsPage,
})

function ItemsPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [visibility, setVisibility] = useState<'team' | 'private'>('team')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function add(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await addItemFn({ data: { title, notes: '', visibility } })
      setTitle('')
      await router.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    await deleteItemFn({ data: { id } })
    await router.invalidate()
  }

  return (
    <main className="page">
      <h1>Items</h1>
      <p className="muted">What you see here is what row-level security lets your membership read: team items, and private items you own.</p>
      {data.canWrite ? (
        <form className="row" onSubmit={add} data-testid="add-form">
          <input aria-label="Title" placeholder="A new item" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
          <select aria-label="Visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as 'team' | 'private')}>
            <option value="team">team</option>
            <option value="private">private</option>
          </select>
          <button type="submit" disabled={busy || !title.trim()}>
            Add
          </button>
          {error ? <span className="error">{error}</span> : null}
        </form>
      ) : (
        <p className="muted" data-testid="read-only">
          Your role is read-only here.
        </p>
      )}
      <table data-testid="items">
        <thead>
          <tr>
            <th>Title</th>
            <th>Owner</th>
            <th>Visibility</th>
            <th>Added</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => (
            <tr key={item.id}>
              <td>{item.title}</td>
              <td>{item.owner_name}</td>
              <td>
                <span className="badge">{item.visibility}</span>
              </td>
              <td>{item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}</td>
              <td>{data.canAdmin || (data.canWrite && item.owner_id !== null && item.owner_id === data.memberId) ? <button onClick={() => item.id && remove(item.id)}>Delete</button> : null}</td>
            </tr>
          ))}
          {data.items.length === 0 ? (
            <tr>
              <td colSpan={5} className="muted">
                No items yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </main>
  )
}
