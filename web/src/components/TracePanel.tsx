import { CircleSlash, FileWarning, Network, Radio, Terminal } from 'lucide-react'
import type { Emulation } from '../api'

interface Props {
  emulation: Emulation | null | undefined
}

/**
 * Not "we ran the repo in a sandbox" -- Cursor is not running in our container, so that
 * would reproduce nothing. We parse tasks.json and mcp.json, extract the exact commands
 * the IDE would execute on folder open, and run only those under tracing.
 *
 * Emulation (#5) is the first thing the team cuts, so `ran: false` is a first-class state
 * here, not a fallback. Every array access is guarded: a missing trace degrades this panel
 * and never touches the rest of the page.
 */
export default function TracePanel({ emulation }: Props) {
  if (!emulation?.ran) {
    return (
      <section className="rounded-2xl border border-dashed border-rule bg-card/50 px-6 py-6 sm:px-8">
        <div className="flex items-center gap-2">
          <CircleSlash size={15} className="text-sage" />
          <h3 className="text-xs font-semibold tracking-[0.18em] text-sage uppercase">
            Trigger emulation
          </h3>
        </div>
        <p className="mt-3 text-sm text-sage">
          Unavailable — {emulation?.reason || 'not run for this scan.'}
        </p>
        <p className="mt-1 text-xs text-sage/70">
          Static analysis above stands on its own; the trace is corroboration.
        </p>
      </section>
    )
  }

  const groups = [
    { label: 'Triggers extracted', Icon: Radio, items: emulation.triggers_extracted },
    { label: 'Processes spawned', Icon: Terminal, items: emulation.processes },
    { label: 'Files written', Icon: FileWarning, items: emulation.files_written, loud: true },
    { label: 'Network attempts', Icon: Network, items: emulation.network_attempts, blocked: true },
  ] as const

  return (
    <section className="rounded-2xl border border-rule bg-card p-6 sm:p-8">
      <h3 className="text-xs font-semibold tracking-[0.18em] text-sage uppercase">
        Trigger emulation
      </h3>
      <p className="mt-2 text-sm text-sage">
        The IDE&apos;s own trigger paths, extracted and executed under tracing. No network egress.
      </p>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {groups.map(({ label, Icon, items, ...flags }) => {
          const loud = 'loud' in flags && flags.loud
          const blocked = 'blocked' in flags && flags.blocked
          const list = items ?? []
          return (
            <div key={label} className="rounded-xl border border-rule bg-well p-4">
              <div className="flex items-center gap-2">
                <Icon size={13} className={loud ? 'text-danger' : 'text-sage'} />
                <span className="text-[11px] tracking-wider text-sage uppercase">{label}</span>
              </div>
              {list.length === 0 ? (
                <p className="mt-2 text-sm text-sage/60">none observed</p>
              ) : (
                <ul className="mt-2.5 space-y-1.5">
                  {list.map((item, i) => (
                    <li
                      key={i}
                      className={`font-mono break-all ${
                        loud
                          ? 'text-base font-medium text-danger sm:text-lg'
                          : blocked
                            ? 'text-sm text-sage line-through decoration-danger/60'
                            : 'text-sm text-ink'
                      }`}
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
