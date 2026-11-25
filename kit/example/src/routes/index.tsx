import { Alert, Button, FieldError, Input, Page, PageHeader, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableFrame, TableMessage, Tag, TBody, TD, TH, THead, Toolbar, TR } from '@brax-hub/ui/parts'
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
    <Page>
      <PageHeader title="Items" description="What you see here is what row-level security lets your membership read: team items, and private items you own." />
      {data.canWrite ? (
        <form className="flex flex-col gap-2" onSubmit={add} data-testid="add-form">
          <Toolbar aria-label="A new item">
            <Input className="min-w-60 flex-1" aria-label="Title" placeholder="A new item" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
            <Select value={visibility} onValueChange={(v) => setVisibility(v as 'team' | 'private')}>
              <SelectTrigger className="w-40" aria-label="Visibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="team">team</SelectItem>
                <SelectItem value="private">private</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" variant="primary" disabled={busy || !title.trim()}>
              Add
            </Button>
          </Toolbar>
          {error ? <FieldError>{error}</FieldError> : null}
        </form>
      ) : (
        <Alert data-testid="read-only">Your role is read-only here.</Alert>
      )}
      <TableFrame>
        <Table data-testid="items">
          <THead>
            <TR>
              <TH>Title</TH>
              <TH>Owner</TH>
              <TH>Visibility</TH>
              <TH>Added</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {data.items.map((item) => (
              <TR key={item.id}>
                <TD>{item.title}</TD>
                <TD>{item.owner_name}</TD>
                <TD>
                  <Tag>{item.visibility}</Tag>
                </TD>
                <TD>{item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}</TD>
                <TD align="right">
                  {data.canAdmin || (data.canWrite && item.owner_id !== null && item.owner_id === data.memberId) ? (
                    <Button size="sm" variant="destructive" onClick={() => item.id && remove(item.id)}>
                      Delete
                    </Button>
                  ) : null}
                </TD>
              </TR>
            ))}
            {data.items.length === 0 ? <TableMessage colSpan={5}>No items yet.</TableMessage> : null}
          </TBody>
        </Table>
      </TableFrame>
    </Page>
  )
}
