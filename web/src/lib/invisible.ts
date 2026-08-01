/**
 * Making the invisible visible. Mirrors `foldergate/scanner/rules.py`.
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

/** The invisible surface, deliberately wider than the usual four zero-width characters. */
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

/**
 * Name a codepoint. Showing "U+E0000 TAG" rather than a bare marker turns the panel from
 * "trust us, something is hidden" into a forensic claim the audience can check.
 */
export function codepointName(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0
  const hex = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`
  if (isTag(cp)) return `${hex} TAG`
  if (cp === 0x200b) return `${hex} ZERO WIDTH SPACE`
  if (cp === 0x200c) return `${hex} ZWNJ`
  if (cp === 0x200d) return `${hex} ZWJ`
  if (cp === 0x200e || cp === 0x200f) return `${hex} DIRECTION MARK`
  if (cp >= 0x202a && cp <= 0x202e) return `${hex} BIDI OVERRIDE`
  if (cp >= 0x2060 && cp <= 0x2064) return `${hex} WORD JOINER`
  if (cp === 0xfeff) return `${hex} BOM`
  return hex
}

/** Split into runs, flagging which are invisible. Code points, not UTF-16 units. */
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

/** The dominant invisible codepoint in a run -- what to label the whole run with. */
export function dominantCodepoint(run: string): string {
  const counts = new Map<string, number>()
  for (const ch of run) {
    const name = codepointName(ch)
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}

/** The instruction the model actually reads, decoded back out of the tag block. */
export function decodeHidden(text: string): string {
  let out = ''
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    if (isTag(cp)) out += String.fromCodePoint(cp - 0xe0000)
  }
  return out
}

/** Strip every invisible character -- what a defanged file looks like. */
export function strip(text: string): string {
  return [...text].filter((ch) => !isInvisible(ch.codePointAt(0) ?? 0)).join('')
}

/**
 * The two numbers that make the attack land. The gap between them IS the vulnerability,
 * and a number reads from the back of a room in a way a highlight never does.
 */
export function charCounts(text: string): { visible: number; model: number } {
  const all = [...text]
  return {
    visible: all.filter((ch) => !isInvisible(ch.codePointAt(0) ?? 0)).length,
    model: all.length,
  }
}

/* -------------------------------------------------------------------------------- */

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
  hiddenCount: number
  /** ASCII recovered from the tag block. Empty when nothing was smuggled that way. */
  smuggled: string
  /** True when genuine invisible codepoints were present (vs. a plain-text marker). */
  real: boolean
}

/**
 * Older scanner output paraphrased the payload and carried a literal `[HIDDEN]` token
 * rather than real codepoints. Both are supported and we never guess: if neither is
 * present the text renders untouched rather than inventing positions.
 */
const MARKER = /\[[A-Z][A-Z _-]{2,}\]/

/** Rich analysis for the reveal panel: collapsed runs, recovered payload, counts. */
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
      codes: [...new Set(run.map((cp) => codepointName(String.fromCodePoint(cp))))],
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

/**
 * The real-data path, and the one that actually runs in the demo.
 *
 * `foldergate/scanner/rules.py` hands us `decoded` already resolved -- the tag-block
 * codepoints have been turned back into ASCII -- so by the time it reaches the browser
 * there is nothing invisible left to detect. Running `analyze()` on it alone finds no
 * codepoints and renders the smuggled sentence as ordinary text, which quietly loses the
 * entire point of the panel.
 *
 * The hidden span is recoverable a different way: it is exactly what `decoded` has that
 * `evidence` does not. Anchoring on the common prefix and suffix isolates the insertion
 * without needing offsets the contract never carried.
 *
 * Falls back to `analyze()` whenever the two strings do not straddle a single insertion,
 * so raw-text input and the older `[HIDDEN]` marker convention both still work.
 */
export function analyzePair(decoded: string, evidence: string): Analysis {
  const direct = analyze(decoded)
  if (direct.real || direct.hiddenCount > 0) return direct
  if (!evidence || !decoded || decoded === evidence || !decoded.includes(evidence.slice(0, 8))) {
    return direct.smuggled ? direct : analyze(decoded)
  }

  const d = [...decoded]
  const e = [...evidence]

  let head = 0
  while (head < d.length && head < e.length && d[head] === e[head]) head++

  let tail = 0
  while (
    tail < d.length - head &&
    tail < e.length - head &&
    d[d.length - 1 - tail] === e[e.length - 1 - tail]
  ) {
    tail++
  }

  const inserted = d.slice(head, d.length - tail).join('')
  if (!inserted.trim()) return direct

  const before = d.slice(0, head).join('')
  const after = d.slice(d.length - tail).join('')

  return {
    segments: [
      ...(before ? [{ kind: 'visible' as const, text: before }] : []),
      { kind: 'marker', text: inserted },
      ...(after ? [{ kind: 'visible' as const, text: after }] : []),
    ],
    // The scanner reports the real codepoint count via model_chars - visible_chars;
    // this is the character length of the recovered instruction itself.
    hiddenCount: [...inserted].length,
    smuggled: inserted.trim(),
    real: true,
  }
}
