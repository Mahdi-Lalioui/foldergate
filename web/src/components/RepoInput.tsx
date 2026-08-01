import { useEffect, useRef } from 'react'
import { ArrowRight, FolderCheck, FolderX, Loader2 } from 'lucide-react'

interface Props {
  value: string
  busy: boolean
  onChange: (v: string) => void
  onSubmit: (v: string) => void
}

/**
 * A URL field, not a folder picker -- and that is a positioning decision, not a UX one.
 *
 * Every competing tool scans the machine you already have: installed MCP servers, local
 * rules files. We scan a repo you have not opened yet. A folder picker would make us look
 * identical to them; a URL field makes the difference self-evident with zero words spent.
 *
 * The two fixture chips scan on a single click. Nobody types on stage.
 */
const FIXTURES = [
  {
    path: 'fixtures/demo-trapped',
    label: 'demo-trapped',
    hint: 'the kill chain',
    Icon: FolderX,
    tone: 'text-danger',
  },
  {
    path: 'fixtures/demo-clean',
    label: 'demo-clean',
    hint: 'the control',
    Icon: FolderCheck,
    tone: 'text-safe',
  },
] as const

export default function RepoInput({ value, busy, onChange, onSubmit }: Props) {
  const ref = useRef<HTMLInputElement>(null)

  // Focus without the `autoFocus` attribute, which scrolls the input into view on load
  // and pushes the entire hero off the top of the screen -- the first thing a judge sees.
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [])

  const submit = (v: string) => {
    const trimmed = v.trim()
    if (trimmed && !busy) onSubmit(trimmed)
  }

  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit(value)
        }}
        className="flex items-center gap-2 rounded-2xl border border-line bg-surface/80 p-2 backdrop-blur focus-within:border-accent/60"
      >
        <input
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={busy}
          spellCheck={false}
          autoComplete="off"
          aria-label="Repository URL or path to scan"
          placeholder="https://github.com/org/repo"
          className="min-w-0 flex-1 bg-transparent px-4 py-3 font-mono text-base text-fg outline-none placeholder:text-fg-muted/50 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <ArrowRight size={16} strokeWidth={2.5} />
          )}
          {busy ? 'Scanning' : 'Scan'}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-fg-muted">or try</span>
        {FIXTURES.map(({ path, label, hint, Icon, tone }) => (
          <button
            key={path}
            type="button"
            disabled={busy}
            onClick={() => {
              onChange(path)
              submit(path)
            }}
            className="group flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs transition hover:border-accent/50 hover:bg-surface-2 disabled:opacity-40"
          >
            <Icon size={13} className={tone} />
            <span className="font-mono text-fg">{label}</span>
            <span className="text-fg-muted">{hint}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
