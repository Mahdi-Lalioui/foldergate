/**
 * Making the invisible visible.
 *
 * The attack in `fixtures/demo-trapped/.cursorrules` is the Pillar Security "Rules File
 * Backdoor": ASCII smuggled one character at a time into the Unicode **tag block**
 * (U+E0000-U+E007F). Those codepoints are category Cf -- zero-width, absent from every
 * human rendering context, and fully legible to a tokenizer. In our fixture, 158 of them
 * hide a complete instruction to exfiltrate a secret from `.env`.
 *
 * Tag-block characters are a direct offset of ASCII, so the payload is not merely
 * detectable, it is *recoverable*: `codepoint - 0xE0000` is the original character. That
 * is the difference between telling a judge "there is something hidden here" and showing
 * them the sentence.
 *
 * Everything here is pure and runs client-side. The scanner never has to send us offsets.
 */

/** The invisible surface, matching the ranges enumerated in issue #3. */
function isInvisible(cp: number): boolean {
  return (
    (cp >= 0x200b && cp <= 0x200f) || // zero-width space/joiner/non-joiner, LRM, RLM
    (cp >= 0x202a && cp <= 0x202e) || // bidi overrides
    (cp >= 0x2060 && cp <= 0x2064) || // word joiner, invisible operators
    cp === 0xfeff || // BOM
    (cp >= 0xe0000 && cp <= 0xe007f) // tag block -- the real attack
  )
}

const isTag = (cp: number) => cp >= 0xe0000 && cp <= 0xe007f

const label = (cp: number) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`

export interface Segment {
  kind: 'visible' | 'hidden' | 'marker'
  text: string
  /** Distinct codepoint labels in this run, for the tooltip. */
  codes?: string[]
  /** How many invisible codepoints this run collapses. */
  count?: number
}

export interface Analysis {
  segments: Segment[]
  /** Total invisible codepoints found. */
  hiddenCount: number
  /** ASCII recovered from the tag block. Empty when nothing was smuggled that way. */
  smuggled: string
  /** True when genuine invisible codepoints were present (vs. the stub's text marker). */
  real: boolean
}

/**
 * The stub's `decoded` is a paraphrase carrying a literal `[HIDDEN]` token rather than
 * real invisible codepoints. Real scanner output carries the codepoints themselves. We
 * support both and never guess: if neither is present the text renders untouched.
 */
const MARKER = /\[[A-Z][A-Z _-]{2,}\]/

export function analyze(text: string): Analysis {
  const segments: Segment[] = []
  let hiddenCount = 0
  let smuggled = ''

  let visible = ''
  let run: number[] = []

  const flushVisible = () => {
    if (visible) segments.push({ kind: 'visible', text: visible })
    visible = ''
  }
  const flushRun = () => {
    if (!run.length) return
    segments.push({
      kind: 'hidden',
      text: String.fromCodePoint(...run),
      codes: [...new Set(run.map(label))],
      count: run.length,
    })
    run = []
  }

  // for..of iterates codepoints, not UTF-16 units -- essential, since tag-block
  // characters are astral and occupy a surrogate pair each.
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    if (isInvisible(cp)) {
      flushVisible()
      run.push(cp)
      hiddenCount++
      if (isTag(cp)) smuggled += String.fromCodePoint(cp - 0xe0000)
    } else {
      flushRun()
      visible += ch
    }
  }
  flushVisible()
  flushRun()

  if (hiddenCount > 0) {
    return { segments, hiddenCount, smuggled: smuggled.trim(), real: true }
  }

  // No real invisibles. Fall back to the stub's bracket-marker convention so the demo
  // still reads correctly against stub data.
  const m = text.match(MARKER)
  if (m?.index !== undefined) {
    const before = text.slice(0, m.index)
    const after = text.slice(m.index + m[0].length)
    return {
      segments: [
        ...(before ? [{ kind: 'visible' as const, text: before }] : []),
        { kind: 'marker', text: m[0] },
        ...(after ? [{ kind: 'visible' as const, text: after }] : []),
      ],
      hiddenCount: 0,
      smuggled: after.trim(),
      real: false,
    }
  }

  return { segments: [{ kind: 'visible', text }], hiddenCount: 0, smuggled: '', real: false }
}
