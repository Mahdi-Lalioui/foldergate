import { FileCode2, FileTerminal, Play, Binary } from 'lucide-react'
import type { Finding, Vector } from '../api'
import { VECTOR_LABEL, chainSteps } from '../api'

interface Props {
  killChain: string
  findings: Finding[]
}

const ICONS: Record<Vector, typeof FileCode2> = {
  rules_file: FileCode2,
  mcp_json: FileTerminal,
  tasks_json: Play,
  planted_binary: Binary,
}

/**
 * Four flags in a list is a linter. One chain is a story.
 *
 * So the findings are rendered as connected nodes on a single vertical rail rather than a
 * flat table: the rail is what makes "chain" literal, and it draws downward while the
 * nodes ignite in sequence so the chain visibly propagates rather than appearing at once.
 *
 * Each node leads with `blast_radius` -- what the payload would actually reach -- because
 * that is the field the contract deliberately substitutes for a meaningless severity score.
 */
export default function KillChain({ killChain, findings }: Props) {
  const steps = chainSteps(findings)

  return (
    <section className="rounded-xl border border-rule bg-card p-6 sm:p-8">
      <h3 className="label-caps">Kill chain</h3>

      {killChain && (
        <p className="mt-5 max-w-2xl font-display text-2xl leading-[1.35] text-ink sm:text-3xl">
          {killChain}
        </p>
      )}

      <ol className="relative mt-9 space-y-1">
        <div
          aria-hidden
          className="anim-rail absolute top-4 bottom-8 left-[19px] w-px bg-gradient-to-b from-warn/80 via-warn/40 to-transparent"
        />

        {steps.map((s, i) => {
          const Icon = ICONS[s.vector]
          return (
            <li
              key={s.file}
              // Staggered so the chain assembles link by link rather than appearing at once.
              style={{ animationDelay: `${80 + i * 70}ms` }}
              className="anim-slide relative flex gap-4 pb-7 last:pb-0"
            >
              <div
                style={{ animationDelay: `${120 + i * 190}ms` }}
                className="anim-ignite relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border border-rule bg-well"
              >
                <Icon size={17} className="text-sage" />
                <span className="tabular absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full border border-rule bg-paper font-mono text-[9px] text-sage">
                  {i + 1}
                </span>
              </div>

              <div className="min-w-0 pt-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <code className="font-mono text-base font-medium break-all text-ink sm:text-lg">
                    {s.file}
                  </code>
                  <span className="rounded border border-rule px-1.5 py-0.5 text-[10px] tracking-wide text-sage uppercase">
                    {VECTOR_LABEL[s.vector]}
                  </span>
                </div>

                {s.radii.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {s.radii.map((r) => (
                      <li
                        key={r}
                        className="text-sm leading-relaxed text-sage before:mr-2 before:text-taupe before:content-['—'] sm:text-base"
                      >
                        {r}
                      </li>
                    ))}
                  </ul>
                )}

                {s.explanation && !s.explanation.startsWith('Stub') && (
                  <p className="mt-2.5 border-l-2 border-rule pl-3 text-sm text-sage/80 italic">
                    {s.explanation}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
