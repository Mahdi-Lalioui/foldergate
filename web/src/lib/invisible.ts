/**
 * Invisible-character detection, mirroring foldergate/scanner/rules.py.
 *
 * Deliberately wider than the usual four zero-width characters. The Pillar
 * "Rules File Backdoor" research used the Unicode **tag block** (U+E0000-U+E007F),
 * which a naive zero-width check misses entirely.
 */

export interface InvisibleRange {
  start: number
  end: number
}

function isInvisible(codePoint: number): boolean {
  return (
    (codePoint >= 0x200b && codePoint <= 0x200f) || // zero-width space/joiner, LRM/RLM
    (codePoint >= 0x202a && codePoint <= 0x202e) || // bidi overrides
    (codePoint >= 0x2060 && codePoint <= 0x2064) || // word joiner, invisible operators
    codePoint === 0xfeff || // BOM
    (codePoint >= 0xe0000 && codePoint <= 0xe007f) // tag block -- the real attack
  )
}

/** Split text into runs, flagging which are invisible. Code points, not UTF-16 units. */
export function segment(text: string): Array<{ text: string; hidden: boolean }> {
  const out: Array<{ text: string; hidden: boolean }> = []
  for (const ch of text) {
    const hidden = isInvisible(ch.codePointAt(0) ?? 0)
    const last = out[out.length - 1]
    if (last && last.hidden === hidden) last.text += ch
    else out.push({ text: ch, hidden })
  }
  return out
}

/**
 * Name a codepoint. Showing "U+E0000 TAG" rather than a bare marker turns the panel
 * from "trust us, something is hidden" into a forensic claim the audience can check.
 */
export function codepointName(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0
  const hex = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`
  if (cp >= 0xe0000 && cp <= 0xe007f) return `${hex} TAG`
  if (cp === 0x200b) return `${hex} ZERO WIDTH SPACE`
  if (cp === 0x200c) return `${hex} ZWNJ`
  if (cp === 0x200d) return `${hex} ZWJ`
  if (cp === 0x200e || cp === 0x200f) return `${hex} DIRECTION MARK`
  if (cp >= 0x202a && cp <= 0x202e) return `${hex} BIDI OVERRIDE`
  if (cp >= 0x2060 && cp <= 0x2064) return `${hex} WORD JOINER`
  if (cp === 0xfeff) return `${hex} BOM`
  return hex
}

/** The dominant invisible codepoint in a run -- what to label the whole run with. */
export function dominantCodepoint(run: string): string {
  const counts = new Map<string, number>()
  for (const ch of run) {
    const name = codepointName(ch)
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}

/** The instruction the model actually reads, decoded back from the tag block. */
export function decodeHidden(text: string): string {
  let out = ''
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp >= 0xe0000 && cp <= 0xe007f) out += String.fromCodePoint(cp - 0xe0000)
  }
  return out
}

/** Strip every invisible character -- what a defanged file looks like. */
export function strip(text: string): string {
  return [...text].filter((ch) => !isInvisible(ch.codePointAt(0) ?? 0)).join('')
}

/**
 * The two numbers that make the attack land.
 * The gap between them IS the vulnerability, and a number reads from the back of a
 * room in a way a highlight never does.
 */
export function charCounts(text: string): { visible: number; model: number } {
  const all = [...text]
  return {
    visible: all.filter((ch) => !isInvisible(ch.codePointAt(0) ?? 0)).length,
    model: all.length,
  }
}
