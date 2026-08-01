import type { Verdict } from '../types'

/**
 * The single most important element in the product.
 *
 * The demo turns on this flipping from QUARANTINED to CLEAN, so it is deliberately
 * oversized and semantic-coloured. Red and green appear nowhere else in the UI, which
 * is what makes them land here.
 */
export function VerdictBanner({
  verdict,
  findingCount,
  repo,
}: {
  verdict: Verdict
  findingCount: number
  repo?: string
}) {
  const quarantined = verdict === 'quarantined'

  return (
    <section
      role="status"
      aria-live="polite"
      className={[
        'rounded-lg border px-8 py-7 transition-colors duration-500',
        quarantined
          ? 'border-danger/40 bg-danger-dim'
          : 'border-safe/40 bg-safe-dim',
      ].join(' ')}
    >
      <p className="label-caps">{repo ? `verdict — ${repo}` : 'verdict'}</p>

      <p
        className={[
          'mt-3 font-display text-verdict',
          quarantined ? 'text-danger' : 'text-safe',
        ].join(' ')}
      >
        {quarantined ? 'QUARANTINED' : 'CLEAN'}
      </p>

      <p className="mt-2 text-sm text-taupe">
        {quarantined
          ? `${findingCount} finding${findingCount === 1 ? '' : 's'} — do not open this folder`
          : 'Nothing fires on open. Safe to hand to your agent.'}
      </p>
    </section>
  )
}
