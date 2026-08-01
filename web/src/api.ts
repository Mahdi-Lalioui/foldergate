/**
 * The single seam between the generated OpenAPI types and every component.
 *
 * `types.ts` is generated (`npx openapi-typescript`) and its shapes are nested under
 * `components['schemas'][...]`. Components import the friendly aliases from here instead,
 * so regenerating types can never ripple through the component tree.
 */

import type { components } from './types'

export type ScanReport = components['schemas']['ScanReport']
export type Finding = components['schemas']['Finding']
export type Emulation = components['schemas']['Emulation']
export type Defanged = components['schemas']['Defanged']

// Derived from the fields themselves: Pydantic Literals used in a single place get
// inlined by openapi-typescript rather than promoted to their own named schema.
export type Vector = Finding['vector']
export type Verdict = ScanReport['verdict']

export class ApiError extends Error {}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Cannot reach the backend — is uvicorn running on :8000?')
  }
  // A dead backend behind the Vite dev proxy surfaces as a bare 502/503/504, which tells
  // a presenter nothing. Translate it into the thing they actually need to do.
  if (res.status >= 502 && res.status <= 504) {
    throw new ApiError('Cannot reach the backend — is uvicorn running on :8000?')
  }
  if (!res.ok) throw new ApiError(`${res.status} ${res.statusText}`)
  return (await res.json()) as T
}

export const scanRepo = (repo_url: string) => post<ScanReport>('/api/scan', { repo_url })
export const emulateRepo = (repo_url: string) => post<Emulation>('/api/emulate', { repo_url })
export const defangRepo = (repo_url: string) => post<ScanReport>('/api/defang', { repo_url })

export const VECTOR_LABEL: Record<Vector, string> = {
  rules_file: 'Rules file',
  mcp_json: 'MCP config',
  tasks_json: 'Task runner',
  planted_binary: 'Planted binary',
}

/**
 * Findings arrive as a flat list, but the demo depends on them reading in infection
 * order -- rules trusts MCP, MCP points at a script, tasks runs it, the binary keeps it
 * alive. Sorting here means the narrative survives whatever order the real scanner emits.
 */
const VECTOR_ORDER: Vector[] = ['rules_file', 'mcp_json', 'tasks_json', 'planted_binary']

export interface ChainStep {
  file: string
  vector: Vector
  /** Every distinct blast radius reported for this file, in scanner order. */
  radii: string[]
  explanation: string
}

/**
 * One step per FILE, not one per finding.
 *
 * The real scanner emits a finding per rule that fires, so a single `.cursor/mcp.json`
 * can produce three -- unallowlisted command, path inside the repo, and a `curl | sh`
 * shape. All true, all worth showing, but rendering them as three chain links destroys
 * the sentence the whole product rests on: four files, individually mild, together
 * code execution on open. So findings are grouped by file and their blast radii listed
 * under one node. Nothing is dropped; it is just told as one step.
 */
export function chainSteps(findings: Finding[]): ChainStep[] {
  const byFile = new Map<string, ChainStep>()
  for (const f of findings) {
    const step = byFile.get(f.file)
    if (!step) {
      byFile.set(f.file, {
        file: f.file,
        vector: f.vector,
        radii: f.blast_radius ? [f.blast_radius] : [],
        explanation: f.explanation ?? '',
      })
      continue
    }
    if (f.blast_radius && !step.radii.includes(f.blast_radius)) step.radii.push(f.blast_radius)
    if (!step.explanation && f.explanation) step.explanation = f.explanation
    // Keep the earliest vector in infection order as the file's identity.
    if (VECTOR_ORDER.indexOf(f.vector) < VECTOR_ORDER.indexOf(step.vector)) step.vector = f.vector
  }
  return [...byFile.values()].sort(
    (a, b) => VECTOR_ORDER.indexOf(a.vector) - VECTOR_ORDER.indexOf(b.vector),
  )
}

/**
 * One reveal panel per file. The same rules file can be reported more than once; the
 * richest instance (most characters the model reads) is the one worth showing.
 */
export function payloadFindings(findings: Finding[]): Finding[] {
  const best = new Map<string, Finding>()
  for (const f of findings) {
    if (f.model_chars <= 0 && f.visible_chars <= 0) continue
    const cur = best.get(f.file)
    if (!cur || f.model_chars > cur.model_chars) best.set(f.file, f)
  }
  return [...best.values()]
}
