import { charCounts, decodeHidden, dominantCodepoint, segment } from '../lib/invisible'

/**
 * The money shot: what a human reviewer sees, beside what the model actually reads.
 *
 * Invisible characters render as red markers, and the decoded instruction is spelled
 * out underneath. This is the 1:00-2:15 stretch of the demo, so it gets to be its own
 * component rather than a cell in a findings table.
 */
export function UnicodeDiff({ raw, file }: { raw: string; file: string }) {
  const parts = segment(raw)
  const { visible, model } = charCounts(raw)
  const hiddenInstruction = decodeHidden(raw)

  return (
    <section className="rounded-lg border border-ink-hairline bg-ink-raised">
      <header className="flex items-center justify-between border-b border-ink-hairline px-5 py-3">
        <span className="font-mono text-sm text-cream">{file}</span>
        <span className="label-caps">hidden instruction</span>
      </header>

      <div className="grid gap-px bg-ink-hairline md:grid-cols-2">
        <div className="bg-ink-raised p-5">
          <p className="label-caps">what you see</p>
          <pre className="mt-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-mist">
            {parts.filter((p) => !p.hidden).map((p) => p.text).join('')}
          </pre>
        </div>

        <div className="bg-ink-raised p-5">
          <p className="label-caps">what the model reads</p>
          <pre className="mt-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-mist">
            {parts.map((part, i) =>
              part.hidden ? (
                // One labelled pill per run, not one marker per character. 158 bare
                // markers is noise, and a single small square is invisible from the
                // back of a room -- the count is what makes it land.
                <mark
                  key={i}
                  className="zw-run"
                  title={`${[...part.text].length} × ${dominantCodepoint(part.text)}`}
                >
                  ◆ {[...part.text].length} × {dominantCodepoint(part.text)}
                </mark>
              ) : (
                <span key={i}>{part.text}</span>
              ),
            )}
          </pre>
        </div>
      </div>

      {hiddenInstruction && (
        <div className="border-t border-ink-hairline px-5 py-4">
          <p className="label-caps">decoded</p>
          <p className="mt-2 font-mono text-xs leading-relaxed text-danger">{hiddenInstruction}</p>
        </div>
      )}

      {/* The gap between these two numbers is the vulnerability. */}
      <footer className="flex items-baseline gap-6 border-t border-ink-hairline px-5 py-4">
        <span className="font-display text-3xl text-cream">
          {visible}
          <span className="ml-2 text-xs tracking-widest text-taupe uppercase">visible</span>
        </span>
        <span className="font-display text-3xl text-danger">
          {model}
          <span className="ml-2 text-xs tracking-widest text-taupe uppercase">model reads</span>
        </span>
      </footer>
    </section>
  )
}
