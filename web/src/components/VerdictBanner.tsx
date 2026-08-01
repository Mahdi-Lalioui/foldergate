import { ShieldAlert, ShieldCheck } from 'lucide-react'
import type { Verdict } from '../api'

interface Props {
  verdict: Verdict
  findingCount: number
  defanging: boolean
  repo?: string
}

/**
 * The single most important element in the product.
 *
 * The demo turns on this flipping from QUARANTINED to CLEAN, so it is oversized and
 * semantic-coloured. Red and green appear nowhere else in the UI, which is exactly what
 * makes them land here.
 *
 * `key={verdict}` is what makes it animate: changing the key forces React to unmount the
 * old banner and mount a fresh node, re-triggering the CSS entrance every time the verdict
 * changes. No animation library, and -- crucially -- if the animation never runs, the
 * banner is simply visible. It can never end up blank in front of a room.
 *
 * SVG shields rather than emoji: emoji render differently on every platform, cannot be
 * themed, and look like a placeholder next to real typography.
 */
const STATES = {
  quarantined: {
    Icon: ShieldAlert,
    word: 'QUARANTINED',
    ring: 'border-danger/35',
    wash: 'bg-danger-wash',
    text: 'text-danger',
  },
  clean: {
    Icon: ShieldCheck,
    word: 'CLEAN',
    ring: 'border-safe/35',
    wash: 'bg-safe-wash',
    text: 'text-safe',
  },
} as const

export default function VerdictBanner({ verdict, findingCount, defanging, repo }: Props) {
  const s = STATES[verdict]
  const sub =
    verdict === 'quarantined'
      ? `${findingCount} finding${findingCount === 1 ? '' : 's'} — do not open this folder`
      : 'Nothing fires on open. Safe to hand to your agent.'

  return (
    <section
      key={verdict}
      role="status"
      aria-live="polite"
      className={`anim-verdict relative overflow-hidden rounded-xl border ${s.ring} ${s.wash} px-7 py-8 sm:px-10 sm:py-10`}
    >
      {/* The shockwave. Fires once per verdict because the whole node is remounted by
          `key`, so the flip lands as an impact rather than a fade. */}
      <div
        aria-hidden
        className={`anim-shock pointer-events-none absolute top-1/2 left-10 size-44 -translate-y-1/2 rounded-full border-2 ${s.ring} opacity-0`}
      />

      <div className="relative">
        <p className="label-caps">{repo ? `verdict — ${repo}` : 'verdict'}</p>

        <div className="mt-4 flex items-center gap-5">
          <s.Icon strokeWidth={1.5} className={`${s.text} size-11 shrink-0 sm:size-14`} aria-hidden />
          {/* Fluid rather than stepped: "QUARANTINED" is a long word in a bordered box,
              and a fixed size clips the final letter on a 375px screen. */}
          <h2
            className={`font-display text-[clamp(1.9rem,8vw,4.25rem)] leading-none ${s.text} ${
              defanging ? 'opacity-40' : ''
            } transition-opacity`}
          >
            {s.word}
          </h2>
        </div>

        <p className="mt-4 text-sm text-sage sm:text-base">
          {defanging ? 'Neutralising artifacts…' : sub}
        </p>
      </div>
    </section>
  )
}
