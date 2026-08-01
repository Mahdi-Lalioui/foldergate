import { FileCode2, FileTerminal, Play, Binary } from 'lucide-react'
import type { Finding, Vector } from '../api'
import { VECTOR_LABEL, inChainOrder } from '../api'

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
 * flat table: the rail is what makes "chain" literal. Each node leads with `blast_radius`
 * -- what the payload would actually reach -- because that is the field the contract
 * deliberately substitutes for a meaningless severity score.
 */
export default function KillChain({ killChain, findings }: Props) {
  const ordered = inChainOrder(findings)

  return (
    <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
      <h3 className="text-xs font-semibold tracking-[0.18em] text-fg-muted uppercase">
        Kill chain
      </h3>

      {killChain && (
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-fg sm:text-xl">{killChain}</p>
      )}

      <ol className="relative mt-8 space-y-1">
        {/* The rail draws itself downward while the nodes ignite in sequence beneath it,
            so the chain visibly propagates: rules file infects MCP config infects task
            runner infects planted binary. A static list cannot say that. */}
        <div
          aria-hidden
          className="anim-rail absolute top-4 bottom-8 left-[19px] w-px bg-gradient-to-b from-accent/70 via-accent/35 to-transparent"
        />

        {ordered.map((f, i) => {
          const Icon = ICONS[f.vector]
          return (
            <li
              key={`${f.vector}-${f.file}`}
              // Staggered so the chain assembles link by link rather than appearing at once.
              style={{ animationDelay: `${80 + i * 70}ms` }}
              className="anim-slide relative flex gap-4 pb-6 last:pb-0"
            >
              <div
                style={{ animationDelay: `${120 + i * 190}ms` }}
                className="anim-ignite relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2"
              >
                <Icon size={17} className="text-accent" />
                <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full border border-line bg-bg font-mono text-[9px] text-fg-muted">
                  {i + 1}
                </span>
              </div>

              <div className="min-w-0 pt-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <code className="font-mono text-base font-medium break-all text-fg sm:text-lg">
                    {f.file}
                  </code>
                  <span className="rounded border border-line px-1.5 py-0.5 text-[10px] tracking-wide text-fg-muted uppercase">
                    {VECTOR_LABEL[f.vector]}
                  </span>
                </div>
                {f.blast_radius && (
                  <p className="mt-1.5 text-sm leading-relaxed text-fg-muted sm:text-base">
                    {f.blast_radius}
                  </p>
                )}
                {f.explanation && !f.explanation.startsWith('Stub') && (
                  <p className="mt-2 border-l-2 border-line pl-3 text-sm text-fg-muted/80 italic">
                    {f.explanation}
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
