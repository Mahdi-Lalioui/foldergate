import { useState } from 'react'
import type { ScanReport } from './types'

/**
 * Placeholder shell. Issue #6 replaces this with the real components
 * (RepoInput / VerdictBanner / KillChain / UnicodeDiff / TracePanel / SafetyFooter).
 *
 * It exists to prove one thing, which is issue #1's acceptance criterion: the UI can
 * reach the API through the Vite proxy with no CORS config anywhere.
 */
export default function App() {
  const [report, setReport] = useState<ScanReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function scan() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_url: 'fixtures/demo-trapped' }),
      })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      setReport(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-10 font-mono">
      <h1 className="text-3xl font-bold">FolderGate</h1>
      <p className="mt-2 text-sm text-neutral-400">
        A folder shouldn&apos;t be able to attack you. This is the gate it has to pass
        through first.
      </p>

      <button
        onClick={scan}
        disabled={busy}
        className="mt-8 rounded bg-red-600 px-5 py-2 font-semibold hover:bg-red-500 disabled:opacity-50"
      >
        {busy ? 'Scanning…' : 'Test API wiring'}
      </button>

      {error && (
        <p className="mt-6 rounded border border-red-800 bg-red-950/50 p-4 text-sm text-red-300">
          {error} — is the backend running? <code>uv run uvicorn foldergate.api:app</code>
        </p>
      )}

      {report && (
        <section className="mt-6">
          <p className="text-lg">
            verdict:{' '}
            <span className={report.verdict === 'quarantined' ? 'text-red-400' : 'text-green-400'}>
              {report.verdict}
            </span>{' '}
            · {report.findings.length} findings
          </p>
          <pre className="mt-4 overflow-x-auto rounded bg-neutral-900 p-4 text-xs">
            {JSON.stringify(report, null, 2)}
          </pre>
        </section>
      )}
    </main>
  )
}
