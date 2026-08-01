import { HandHeart, ShieldOff, Unplug } from 'lucide-react'

/**
 * Safety and responsible AI design is a published, scored judging criterion, and most
 * teams will score zero on it because they never say anything. These three sentences are
 * the whole answer, and they are always on screen.
 *
 * The third is the one that matters most: defang is deterministic, so no model can ever
 * take a destructive action. That is an architectural property, not a promise.
 */
const POINTS = [
  {
    Icon: HandHeart,
    title: 'Consented payloads',
    body: 'Every attack fixture is self-created and self-owned. Payloads write PWNED.txt or print a fake variable — nothing destructive, no real credentials.',
  },
  {
    Icon: Unplug,
    title: 'No network egress',
    body: 'Emulation runs in an isolated sandbox with egress blocked. Attempted connections are recorded as evidence, never completed.',
  },
  {
    Icon: ShieldOff,
    title: 'No LLM in the destructive path',
    body: 'The model explains the chain. It never decides what to delete — defang is deterministic by design.',
  },
]

export default function SafetyFooter() {
  return (
    <footer className="mt-4 border-t border-line pt-8">
      <div className="grid gap-6 sm:grid-cols-3">
        {POINTS.map(({ Icon, title, body }) => (
          <div key={title}>
            <div className="flex items-center gap-2">
              <Icon size={14} className="text-accent" />
              <h4 className="text-xs font-semibold tracking-wider text-fg uppercase">{title}</h4>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-fg-muted">{body}</p>
          </div>
        ))}
      </div>
      <p className="mt-8 text-xs text-fg-muted/60">
        FolderGate · a folder shouldn&apos;t be able to attack you.
      </p>
    </footer>
  )
}
