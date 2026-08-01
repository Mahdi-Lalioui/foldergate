import { Check, FilePen, Trash2 } from 'lucide-react'
import type { Defanged } from '../api'

/**
 * The artifact you walk away with.
 *
 * Nearly every tool in this space hands you a report. This hands you a repo -- a real path
 * on disk, not a UI state -- which is the single clearest way to show the difference.
 */
export default function DefangSummary({ defanged }: { defanged: Defanged }) {
  const removed = defanged.files_removed ?? []
  const modified = defanged.files_modified ?? []

  return (
    <section
      style={{ animationDelay: '120ms' }}
      className="anim-rise rounded-2xl border border-safe/30 bg-card p-6 sm:p-8"
    >
      <div className="flex items-center gap-2">
        <Check size={15} className="text-safe" />
        <h3 className="text-xs font-semibold tracking-[0.18em] text-safe uppercase">
          Defanged copy written
        </h3>
      </div>

      {defanged.output_path && (
        <div className="mt-4 rounded-xl border border-rule bg-well px-5 py-4">
          <p className="text-[11px] tracking-wider text-sage uppercase">Output path</p>
          <code className="mt-1.5 block font-mono text-base break-all text-ink sm:text-xl">
            {defanged.output_path}
          </code>
        </div>
      )}

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <div className="flex items-center gap-2">
            <Trash2 size={13} className="text-danger" />
            <span className="text-[11px] tracking-wider text-sage uppercase">
              Removed ({removed.length})
            </span>
          </div>
          <ul className="mt-2 space-y-1">
            {removed.length === 0 && <li className="text-sm text-sage/60">none</li>}
            {removed.map((f) => (
              <li
                key={f}
                className="font-mono text-sm break-all text-sage line-through decoration-danger/70"
              >
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <FilePen size={13} className="text-warn" />
            <span className="text-[11px] tracking-wider text-sage uppercase">
              Neutralised ({modified.length})
            </span>
          </div>
          <ul className="mt-2 space-y-1">
            {modified.length === 0 && <li className="text-sm text-sage/60">none</li>}
            {modified.map((f) => (
              <li key={f} className="font-mono text-sm break-all text-ink">
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-6 text-xs text-sage">
        Deterministic — no model was consulted about what to remove.
      </p>
    </section>
  )
}
