import { useEffect, useState } from 'react'
import { Eye, EyeOff, RotateCcw, TriangleAlert } from 'lucide-react'
import type { Finding } from '../api'
import { analyze } from '../lib/invisible'

interface Props {
  findings: Finding[]
}

/**
 * Counts up on entrance. A number that lands is more visceral than a number that is.
 *
 * requestAnimationFrame is paused whenever the tab is not being painted, which would strand
 * these numbers at 0 -- and "0 characters visible · 0 characters the model reads" is a
 * broken headline stat, not a graceful degradation. So a timer backstop snaps to the real
 * value regardless: timers are throttled in background tabs but never paused. If rAF is
 * running the animation finishes first and the backstop is a no-op.
 */
function useCountUp(target: number, ms = 750) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setN(target)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms)
      setN(Math.round(target * (1 - Math.pow(1 - p, 3)))) // ease-out cubic
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const backstop = setTimeout(() => setN(target), ms + 300)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(backstop)
    }
  }, [target, ms])
  return n
}

/**
 * The money shot.
 *
 * Two numbers sit side by side: what a human sees, and what the model actually reads. The
 * gap between them IS the vulnerability, and the contract carries both precisely so this
 * comparison can exist.
 *
 * The panel below them is a single view that FLIPS rather than two panels side by side.
 * That is the whole point: it is the same file. Showing two columns invites the reading
 * that these are two different things; flipping one surface in place proves they are one
 * file that renders differently to a human and to a tokenizer. The flip runs itself once,
 * automatically, so nobody has to narrate it -- and replays on click.
 *
 * Where the payload was smuggled through the Unicode tag block, `analyze()` recovers the
 * original ASCII, so the hidden instruction is printed in full. A judge does not have to
 * take our word that something is hidden there.
 */
export default function UnicodeDiff({ findings }: Props) {
  // Three of the four stub findings carry 0/0. "0 visible · 0 the model reads" is a
  // broken stat, not an empty state, so they are filtered out rather than rendered.
  const withPayload = findings.filter((f) => f.model_chars > 0 || f.visible_chars > 0)
  if (withPayload.length === 0) return null

  return (
    <>
      {withPayload.map((f) => (
        <Panel key={`${f.vector}-${f.file}`} finding={f} />
      ))}
    </>
  )
}

function Panel({ finding: f }: { finding: Finding }) {
  const a = analyze(f.decoded || '')
  const visible = useCountUp(f.visible_chars)
  const model = useCountUp(f.model_chars)
  const ratio = f.model_chars > 0 ? Math.min(1, f.visible_chars / f.model_chars) : 1

  // Starts on the human view, then reveals itself. `pass` remounts the text so the
  // materialise animation replays on demand.
  const [showModel, setShowModel] = useState(false)
  const [pass, setPass] = useState(0)

  useEffect(() => {
    const id = setTimeout(() => setShowModel(true), 1400)
    return () => clearTimeout(id)
  }, [])

  const replay = () => {
    setShowModel(false)
    setPass((p) => p + 1)
    setTimeout(() => setShowModel(true), 420)
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <header className="flex items-center gap-2 border-b border-line px-6 py-3 sm:px-8">
        <TriangleAlert size={14} className="text-accent" />
        <span className="text-xs font-semibold tracking-[0.18em] text-fg-muted uppercase">
          Hidden instruction
        </span>
        <code className="ml-auto truncate font-mono text-xs text-fg-muted">{f.file}</code>
      </header>

      {/* The stat. Largest thing on the page -- readable from the back of the room. */}
      <div className="px-6 py-7 sm:px-8">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <div className="tabular display text-5xl leading-none font-bold text-fg sm:text-6xl">
              {visible}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs tracking-wide text-fg-muted uppercase">
              <Eye size={12} /> characters visible
            </div>
          </div>

          <div className="pb-2 text-2xl text-fg-muted">·</div>

          <div>
            <div className="tabular display text-5xl leading-none font-bold text-danger sm:text-6xl">
              {model}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs tracking-wide text-danger/80 uppercase">
              <EyeOff size={12} /> characters the model reads
            </div>
          </div>
        </div>

        {/* Ratio bar: the amber sliver is everything a human can perceive. */}
        <div className="mt-6 flex h-1.5 overflow-hidden rounded-full bg-danger/25">
          <div
            className="rounded-full bg-accent transition-[width] duration-700 ease-out"
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      </div>

      {/* The reveal. One surface, two readings. */}
      <div className="border-t border-line">
        <div className="flex items-center gap-3 border-b border-line px-6 py-3 sm:px-8">
          <div className="flex items-center gap-2">
            {showModel ? (
              <EyeOff size={13} className="text-danger" />
            ) : (
              <Eye size={13} className="text-fg-muted" />
            )}
            <span
              className={`text-xs font-semibold tracking-[0.14em] uppercase transition-colors ${
                showModel ? 'text-danger' : 'text-fg-muted'
              }`}
            >
              {showModel ? 'What the model reads' : 'What you see'}
            </span>
          </div>
          <button
            type="button"
            onClick={replay}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-[11px] text-fg-muted transition hover:border-accent/50 hover:text-fg"
          >
            <RotateCcw size={11} /> Replay
          </button>
        </div>

        <div className="bg-surface-2 px-6 py-6 sm:px-8">
          <pre
            key={`${pass}-${showModel}`}
            className="anim-materialize font-mono text-sm leading-relaxed whitespace-pre-wrap"
          >
            {showModel ? (
              a.segments.map((s, i) => (
                <span key={i} style={{ animationDelay: `${i * 55}ms` }}>
                  {s.kind === 'visible' ? (
                    <span className="text-fg">{s.text}</span>
                  ) : s.kind === 'hidden' ? (
                    <span className="ghost" title={`${s.count} × ${s.codes?.join(' ')}`}>
                      {s.count}&nbsp;hidden
                    </span>
                  ) : (
                    <span className="ghost">{s.text}</span>
                  )}
                </span>
              ))
            ) : (
              <span className="text-fg-muted">{f.evidence || '—'}</span>
            )}
          </pre>
        </div>
      </div>

      {/* The recovered payload. This only exists because tag-block characters are a direct
          ASCII offset, so the smuggled text can be reconstructed exactly, not just flagged. */}
      {a.smuggled && (
        <div
          className={`border-t border-line bg-danger/[0.06] px-6 py-5 transition-opacity duration-500 sm:px-8 ${
            showModel ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <p className="text-xs font-semibold tracking-[0.18em] text-danger uppercase">
            {a.real
              ? `Recovered from ${a.hiddenCount} invisible characters`
              : 'Hidden from the reader'}
          </p>
          <p className="mt-3 font-mono text-base leading-relaxed text-fg sm:text-lg">
            “{a.smuggled}”
          </p>
        </div>
      )}
    </section>
  )
}
