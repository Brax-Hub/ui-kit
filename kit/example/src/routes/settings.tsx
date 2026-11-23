import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { getJobsFn, runJobNowFn } from '@/server/jobs.functions'

export const Route = createFileRoute('/settings')({
  loader: () => getJobsFn(),
  component: SettingsPage,
})

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
    <main className="page">
      <h1>Settings</h1>
      <section>
        <h2>Hub</h2>
        <p className="muted" data-testid="hub-state">
          {data.hub.connected ? `Connected; granted scopes: ${data.hub.scopes.join(', ') || 'none'}.` : data.hub.reason === 'no_hub' ? 'No hub here: running locally with the stub edge.' : `Hub call refused: ${data.hub.reason}.`}
        </p>
      </section>
      <section>
        <h2>Scheduled jobs</h2>
        <table data-testid="jobs">
          <thead>
            <tr>
              <th>Job</th>
              <th>Schedule (UTC)</th>
              <th>Last run</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.jobs.map((job) => (
              <tr key={job.name}>
                <td>
                  <strong>{job.name}</strong>
                  <div className="muted">{job.description}</div>
                </td>
                <td>
                  <code>{job.schedule}</code>
                </td>
                <td>{job.last_run_at ? new Date(job.last_run_at).toLocaleString() : 'never'}</td>
                <td>{data.registered.includes(job.name) ? <button onClick={() => runNow(job.name)}>Run now</button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {message ? <p data-testid="job-message">{message}</p> : null}
      </section>
      <section>
        <h2>Recent runs</h2>
        <table data-testid="job-runs">
          <thead>
            <tr>
              <th>Job</th>
              <th>Trigger</th>
              <th>Status</th>
              <th>Rows</th>
              <th>Finished</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {data.runs.map((run) => (
              <tr key={run.id}>
                <td>{run.job}</td>
                <td>{run.trigger}</td>
                <td>
                  <span className="badge">{run.status}</span>
                </td>
                <td>{run.rows ?? ''}</td>
                <td>{run.finished_at ? new Date(run.finished_at).toLocaleString() : ''}</td>
                <td className="error">{run.error ?? ''}</td>
              </tr>
            ))}
            {data.runs.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No runs yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </main>
  )
}
