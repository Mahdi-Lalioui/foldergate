import { useCallback, useEffect, useReducer } from 'react'
import { Loader2, RotateCcw, ShieldCheck, TriangleAlert } from 'lucide-react'
import type { Emulation, ScanReport } from './api'
import { defangRepo, emulateRepo, scanRepo } from './api'
import RepoInput from './components/RepoInput'
import VerdictBanner from './components/VerdictBanner'
import KillChain from './components/KillChain'
import UnicodeDiff from './components/UnicodeDiff'
import TracePanel from './components/TracePanel'
import DefangSummary from './components/DefangSummary'
import ScanSurface from './components/ScanSurface'
import SafetyFooter from './components/SafetyFooter'

type Status = 'idle' | 'scanning' | 'result' | 'defanging'

interface State {
  status: Status
  report: ScanReport | null
  repoUrl: string
  error: string | null
}

type Action =
  | { type: 'URL'; url: string }
  | { type: 'SCAN_START'; url: string }
  | { type: 'SCAN_OK'; report: ScanReport }
  | { type: 'SCAN_FAIL'; message: string }
  | { type: 'TRACE'; emulation: Emulation }
  | { type: 'DEFANG_START' }
  | { type: 'DEFANG_OK'; report: ScanReport }
  | { type: 'DEFANG_FAIL'; message: string }
  | { type: 'RESET' }

const INITIAL: State = { status: 'idle', report: null, repoUrl: '', error: null }

/**
 * Every terminal state of every async call lands in a valid, renderable State. There is no
 * branch that leaves `report` inconsistent or lets a rejection escape, which is how "never
 * crash the page" is enforced structurally rather than by defensive checks in children.
 *
 * Note that failures never clear `report`: if a re-scan fails, the previous result stays on
 * screen with an error strip above it. Blanking the page mid-demo is the worst outcome.
 */
function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'URL':
      return { ...s, repoUrl: a.url }
    case 'SCAN_START':
      return { ...s, status: 'scanning', repoUrl: a.url, error: null }
    case 'SCAN_OK':
      return { ...s, status: 'result', report: a.report, error: null }
    case 'SCAN_FAIL':
      return { ...s, status: s.report ? 'result' : 'idle', error: a.message }
    case 'TRACE':
      // Merges the out-of-band emulation result into the current report.
      return s.report ? { ...s, report: { ...s.report, emulation: a.emulation } } : s
    case 'DEFANG_START':
      return { ...s, status: 'defanging', error: null }
    case 'DEFANG_OK':
      return { ...s, status: 'result', report: a.report, error: null }
    case 'DEFANG_FAIL':
      return { ...s, status: 'result', error: a.message }
    case 'RESET':
      return INITIAL
  }
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export default function App() {
  const [state, dispatch] = useReducer(reducer, INITIAL)
  const { status, report, repoUrl, error } = state

  const busy = status === 'scanning' || status === 'defanging'
  // Two distinct questions. `showDefang` keeps the button mounted through the whole
  // defang so it can show its own spinner; `canDefang` gates whether firing is legal.
  const showDefang = report?.verdict === 'quarantined' && status !== 'scanning'
  const canDefang = status === 'result' && report?.verdict === 'quarantined'

  const handleScan = useCallback(async (url: string) => {
    dispatch({ type: 'SCAN_START', url })
    try {
      dispatch({ type: 'SCAN_OK', report: await scanRepo(url) })
    } catch (e) {
      dispatch({ type: 'SCAN_FAIL', message: message(e) })
      return
    }
    // Emulation is fetched out of band and merged when it lands. /api/scan returns
    // `ran: false` by design, and #5 is the first thing the team cuts -- so a failure
    // here must leave TracePanel in its unavailable state, not surface as an error.
    try {
      dispatch({ type: 'TRACE', emulation: await emulateRepo(url) })
    } catch {
      /* TracePanel already renders the unavailable state. */
    }
  }, [])

  const handleDefang = useCallback(async () => {
    dispatch({ type: 'DEFANG_START' })
    try {
      // Deliberately no re-scan of the output: /api/scan currently ignores repo_url and
      // would return the quarantined stub again, flipping the banner straight back to red.
      // /api/defang already returns a complete clean report -- render that.
      dispatch({ type: 'DEFANG_OK', report: await defangRepo(state.repoUrl) })
    } catch (e) {
      dispatch({ type: 'DEFANG_FAIL', message: message(e) })
    }
  }, [state.repoUrl])

  // "D" defangs, so judges never have to hunt for the mouse. The typing guard is the
  // whole trick: a URL containing the letter d must never fire this.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t?.isContentEditable
      ) {
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.toLowerCase() !== 'd' || !canDefang) return
      e.preventDefault()
      void handleDefang()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canDefang, handleDefang])

  const findings = report?.findings ?? []

  return (
    <div className="hero-glow relative isolate min-h-dvh">
      <main className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
        <header>
          <div className="flex items-center gap-2.5">
            <ShieldCheck size={22} className="text-accent" />
            <span className="text-lg font-semibold tracking-tight">FolderGate</span>
          </div>
          <h1 className="display mt-8 max-w-2xl text-4xl leading-[1.1] font-bold sm:text-5xl">
            A folder shouldn&apos;t be able to attack you.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-fg-muted sm:text-lg">
            Paste a repo <em className="text-fg not-italic">before</em> you open it. FolderGate
            scans it, emulates the trigger paths your IDE would execute on folder open, and hands
            back a defanged copy.
          </p>
        </header>

        <div className="mt-10">
          <RepoInput
            value={repoUrl}
            busy={busy}
            onChange={(url) => dispatch({ type: 'URL', url })}
            onSubmit={handleScan}
          />
        </div>

        {error && (
          <div
            role="alert"
            className="mt-6 flex items-start gap-3 rounded-xl border border-accent/40 bg-accent/[0.07] px-5 py-4"
          >
            <TriangleAlert size={16} className="mt-0.5 shrink-0 text-accent" />
            <div className="min-w-0 text-sm">
              <p className="font-medium text-fg">{error}</p>
              <p className="mt-1 font-mono text-xs text-fg-muted">
                uv run uvicorn foldergate.api:app
              </p>
            </div>
          </div>
        )}

        {status === 'idle' && !report && (
          <div className="anim-rise mt-14">
            <ScanSurface />
          </div>
        )}

        {report && (
          <div className="mt-10 space-y-5">
            <VerdictBanner
              verdict={report.verdict}
              findingCount={findings.length}
              defanging={status === 'defanging'}
            />

            {showDefang && (
              <div className="anim-rise flex flex-wrap items-center gap-3">
                <button
                  onClick={handleDefang}
                  disabled={busy}
                  className="flex items-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-bg transition hover:brightness-110 disabled:opacity-50"
                >
                  {status === 'defanging' ? (
                    <Loader2 size={17} className="animate-spin" />
                  ) : (
                    <ShieldCheck size={17} strokeWidth={2.4} />
                  )}
                  Defang this repo
                </button>
                <span className="text-xs text-fg-muted">
                  or press{' '}
                  <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-fg">
                    D
                  </kbd>
                </span>
              </div>
            )}

            {report.defanged?.output_path && <DefangSummary defanged={report.defanged} />}

            {/* Findings unmount the instant the report has none, rather than waiting on an
                exit animation. A stalled exit would leave stale quarantined findings on
                screen underneath a CLEAN banner -- the one contradiction we cannot show. */}
            {findings.length > 0 && (
              <div className="space-y-5">
                <KillChain killChain={report.kill_chain} findings={findings} />
                <UnicodeDiff findings={findings} />
              </div>
            )}

            <TracePanel emulation={report.emulation} />

            <button
              onClick={() => dispatch({ type: 'RESET' })}
              className="flex items-center gap-2 text-sm text-fg-muted transition hover:text-fg"
            >
              <RotateCcw size={14} /> Scan another repo
            </button>
          </div>
        )}

        <SafetyFooter />
      </main>
    </div>
  )
}
