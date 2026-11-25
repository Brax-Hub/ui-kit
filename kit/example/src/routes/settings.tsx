import { Alert, Badge, Button, Page, PageHeader, Section, Table, TableFrame, TableMessage, TBody, TD, TH, THead, TR } from '@brax-hub/ui/parts'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { getJobsFn, runJobNowFn } from '@/server/jobs.functions'

export const Route = createFileRoute('/settings')({
  loader: () => getJobsFn(),
  component: SettingsPage,
})

/** A run's status as the kit's status label: the word, with the tint that says how it went. */
const runTone = (status: string) => (status === 'ok' ? 'ok' : status === 'error' ? 'risk' : 'neutral')

function SettingsPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [message, setMessage] = useState<string | null>(null)

  async function runNow(name: string) {
    setMessage(`Running ${name}...`)
    const result = await runJobNowFn({ data: { name } })
    setMessage(result.ok ? `${name}: ${result.rows} rows${result.note ? ` (${result.note})` : ''}` : `${name} failed: ${result.error}`)
    await router.invalidate()
  }

  return (
    <Page>
      <PageHeader title="Settings" />
      <Section title="Hub">
        <p className="text-ink-3" data-testid="hub-state">
          {data.hub.connected ? `Connected; granted scopes: ${data.hub.scopes.join(', ') || 'none'}.` : data.hub.reason === 'no_hub' ? 'No hub here: running locally with the stub edge.' : `Hub call refused: ${data.hub.reason}.`}
        </p>
      </Section>
      <Section title="Scheduled jobs">
        <TableFrame>
          <Table data-testid="jobs">
            <THead>
              <TR>
                <TH>Job</TH>
                <TH>Schedule (UTC)</TH>
                <TH>Last run</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {data.jobs.map((job) => (
                <TR key={job.name}>
                  <TD>
                    <div className="font-display font-strong text-title tracking-row-title">{job.name}</div>
                    <div className="text-small text-ink-3">{job.description}</div>
                  </TD>
                  <TD mono>{job.schedule}</TD>
                  <TD>{job.last_run_at ? new Date(job.last_run_at).toLocaleString() : 'never'}</TD>
                  <TD align="right">
                    {data.registered.includes(job.name) ? (
                      <Button size="sm" onClick={() => runNow(job.name)}>
                        Run now
                      </Button>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableFrame>
        {message ? <Alert data-testid="job-message">{message}</Alert> : null}
      </Section>
      <Section title="Recent runs">
        <TableFrame>
          <Table data-testid="job-runs">
            <THead>
              <TR>
                <TH>Job</TH>
                <TH>Trigger</TH>
                <TH>Status</TH>
                <TH align="right">Rows</TH>
                <TH>Finished</TH>
                <TH>Error</TH>
              </TR>
            </THead>
            <TBody>
              {data.runs.map((run) => (
                <TR key={run.id}>
                  <TD>{run.job}</TD>
                  <TD>{run.trigger}</TD>
                  <TD>
                    <Badge tone={runTone(run.status)} dot>
                      {run.status}
                    </Badge>
                  </TD>
                  <TD align="right">{run.rows ?? ''}</TD>
                  <TD>{run.finished_at ? new Date(run.finished_at).toLocaleString() : ''}</TD>
                  <TD className="text-risk">{run.error ?? ''}</TD>
                </TR>
              ))}
              {data.runs.length === 0 ? <TableMessage colSpan={6}>No runs yet.</TableMessage> : null}
            </TBody>
          </Table>
        </TableFrame>
      </Section>
    </Page>
  )
}
