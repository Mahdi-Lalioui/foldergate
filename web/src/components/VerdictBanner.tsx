import { ShieldAlert, ShieldCheck } from 'lucide-react'
import type { Verdict } from '../api'

interface Props {
  verdict: Verdict
  findingCount: number
  defanging: boolean
}

/**
 * The flip from QUARANTINED to CLEAN is the moment the entire pitch lives on.
 *
 * `key={verdict}` is what makes it animate: changing the key forces React to unmount the
 * old banner and mount a fresh node, which re-triggers the CSS entrance every time the
 * verdict changes. No animation library, and -- crucially -- if the animation never runs,
 * the banner is simply visible. It can never end up blank in front of a room.
 *
 * SVG shields rather than the 🔴/🟢 emoji the issue sketched: emoji render differently on
 * every platform, cannot be themed, and look like a placeholder next to real typography.
 */
const STATES = {
  quarantined: {
    Icon: ShieldAlert,
    word: 'QUARANTINED',
    ring: 'border-danger/40',
    glow: 'bg-danger/12',
    text: 'text-danger',
  },
  clean: {
    Icon: ShieldCheck,
    word: 'CLEAN',
    ring: 'border-safe/40',
    glow: 'bg-safe/12',
    text: 'text-safe',
  },
} as const

export default function VerdictBanner({ verdict, findingCount, defanging }: Props) {
  const s = STATES[verdict]
  const sub =
    verdict === 'quarantined'
      ? `${findingCount} artifact${findingCount === 1 ? '' : 's'} · code execution on open, zero clicks`
      : 'Nothing fires on open. Safe to inspect.'

  return (
    <section
      key={verdict}
      role="status"
      aria-live="polite"
      className={`anim-verdict relative overflow-hidden rounded-2xl border ${s.ring} bg-surface px-6 py-7 sm:px-8`}
    >
      <div
        className={`pointer-events-none absolute -top-24 -left-24 size-72 rounded-full blur-3xl ${s.glow}`}
      />
      {/* The shockwave. Fires once per verdict because the whole node is remounted by
          `key`, so the flip lands as an impact rather than a fade. */}
      <div
        aria-hidden
        className={`anim-shock pointer-events-none absolute top-1/2 left-8 size-40 -translate-y-1/2 rounded-full border-2 ${s.ring} opacity-0`}
      />
      <div className="relative flex items-center gap-4 sm:gap-5">
        <s.Icon
          strokeWidth={1.6}
          className={`${s.text} size-10 shrink-0 sm:size-[52px]`}
          aria-hidden
        />
        <div className="min-w-0">
          {/* Fluid rather than stepped: "QUARANTINED" is a long word in a bordered box, and
              a fixed mobile size clips the final letter on a 375px screen. */}
          <h2
            className={`display text-[clamp(1.6rem,7.2vw,3.75rem)] leading-none font-bold ${s.text} ${
              defanging ? 'opacity-40' : ''
            } transition-opacity`}
          >
            {s.word}
          </h2>
          <p className="mt-2 text-sm text-fg-muted sm:text-base">
            {defanging ? 'Neutralising artifacts…' : sub}
          </p>
        </div>
      </div>
    </section>
  )
}
