import { useEffect, useState } from 'react'
import { Eye, EyeOff, RotateCcw, TriangleAlert } from 'lucide-react'
import type { Finding } from '../api'
import { payloadFindings } from '../api'
import { analyzePair } from '../lib/invisible'

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
  // A finding with no character counts has no story to tell here ("0 visible · 0 the
  // model reads" is a broken stat, not an empty state), and the same file can be
  // reported more than once. One panel per file, richest instance wins.
  const withPayload = payloadFindings(findings)
  if (withPayload.length === 0) return null

  const [lead, ...rest] = withPayload

  return (
    <div className="space-y-4">
      <Panel finding={lead} />

      {/* The same payload planted in several files is not repetition to be hidden -- it
          is the cross-tool claim, proven. Cursor's rules file, its case-collision twin
          and Claude's file all carry it, so one gate has to cover all of them. Shown as
          compact corroboration rather than three identical full-size panels. */}
      {rest.length > 0 && (
        <section className="rounded-xl border border-rule bg-card p-6 sm:p-8">
          <h3 className="label-caps">Same payload, {rest.length + 1} files</h3>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-sage">
            One instruction, planted across every rules file the tools read. Removing it from
            one leaves the others live — which is the argument for a gate rather than a linter.
          </p>
          <ul className="mt-5 divide-y divide-rule border-t border-rule">
            {[lead, ...rest].map((f) => (
              <li key={f.file} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3">
                <code className="font-mono text-sm break-all text-ink">{f.file}</code>
                <span className="tabular ml-auto font-mono text-xs text-sage">
                  {f.visible_chars} visible
                </span>
                <span className="tabular font-mono text-xs text-danger">
                  {f.model_chars} read
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Panel({ finding: f }: { finding: Finding }) {
  const a = analyzePair(f.decoded || '', f.evidence || '')
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
    <section className="overflow-hidden rounded-xl border border-rule bg-card">
      <header className="flex items-center gap-2 border-b border-rule px-6 py-3.5 sm:px-8">
        <TriangleAlert size={14} className="text-danger" />
        <span className="label-caps">Hidden instruction</span>
        <code className="ml-auto truncate font-mono text-xs text-sage">{f.file}</code>
      </header>

      {/* The stat. Largest thing on the page -- readable from the back of the room. */}
      <div className="px-6 py-8 sm:px-8">
        <div className="flex flex-wrap items-end gap-x-12 gap-y-5">
          <div>
            <div className="tabular font-display text-6xl leading-none text-ink sm:text-7xl">
              {visible}
            </div>
            <div className="mt-3 flex items-center gap-1.5 label-caps">
              <Eye size={12} /> characters visible
            </div>
          </div>

          <div className="pb-3 font-display text-3xl text-taupe">/</div>

          <div>
            <div className="tabular font-display text-6xl leading-none text-danger sm:text-7xl">
              {model}
            </div>
            <div className="mt-3 flex items-center gap-1.5 label-caps text-danger!">
              <EyeOff size={12} /> characters the model reads
            </div>
          </div>
        </div>

        {/* Ratio bar: the sliver is everything a human can perceive. */}
        <div className="mt-7 flex h-1.5 overflow-hidden rounded-full bg-danger/25">
          <div
            className="rounded-full bg-ink transition-[width] duration-700 ease-out"
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      </div>

      {/* The reveal. One surface, two readings. */}
      <div className="border-t border-rule">
        <div className="flex items-center gap-3 border-b border-rule bg-paper/60 px-6 py-3 sm:px-8">
          <div className="flex items-center gap-2">
            {showModel ? (
              <EyeOff size={13} className="text-danger" />
            ) : (
              <Eye size={13} className="text-sage" />
            )}
            <span className={`label-caps transition-colors ${showModel ? 'text-danger!' : ''}`}>
              {showModel ? 'What the model reads' : 'What you see'}
            </span>
          </div>
          <button
            type="button"
            onClick={replay}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-rule px-2.5 py-1 text-[11px] text-sage transition hover:border-ink hover:text-ink"
          >
            <RotateCcw size={11} /> Replay
          </button>
        </div>

        <div className="bg-well px-6 py-6 sm:px-8">
          <pre
            key={`${pass}-${showModel}`}
            className="anim-materialize font-mono text-sm leading-relaxed whitespace-pre-wrap"
          >
            {showModel ? (
              a.segments.map((s, i) => (
                <span key={i} style={{ animationDelay: `${i * 55}ms` }}>
                  {s.kind === 'visible' ? (
                    <span className="text-ink">{s.text}</span>
                  ) : s.kind === 'hidden' ? (
                    <span className="zw-run" title={s.codes?.join(' ')}>
                      {s.count}&nbsp;×&nbsp;{s.codes?.[0] ?? 'HIDDEN'}
                    </span>
                  ) : (
                    <span className="zw-run">{s.text}</span>
                  )}
                </span>
              ))
            ) : (
              <span className="text-sage">{f.evidence || '—'}</span>
            )}
          </pre>
        </div>
      </div>

      {/* The recovered payload. This only exists because tag-block characters are a direct
          ASCII offset, so the smuggled text can be reconstructed exactly, not just flagged. */}
      {a.smuggled && (
        <div
          className={`border-t border-danger/25 bg-danger-wash px-6 py-6 transition-opacity duration-500 sm:px-8 ${
            showModel ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <p className="label-caps text-danger!">
            {a.real
              ? `Recovered from ${a.hiddenCount} invisible characters`
              : 'Hidden from the reader'}
          </p>
          <p className="mt-3 font-mono text-base leading-relaxed text-ink sm:text-lg">
            “{a.smuggled}”
          </p>
        </div>
      )}
    </section>
  )
}
