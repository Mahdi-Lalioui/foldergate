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

export function inChainOrder(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => VECTOR_ORDER.indexOf(a.vector) - VECTOR_ORDER.indexOf(b.vector),
  )
}
