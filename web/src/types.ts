/**
 * Mirrors foldergate/contract.py. Keep the two in lockstep.
 *
 * Issue #6 replaces this hand-written file with types generated from FastAPI's OpenAPI
 * schema, so the UI can never drift from the backend:
 *
 *   curl -s localhost:8000/openapi.json > /tmp/openapi.json
 *   npx openapi-typescript /tmp/openapi.json -o src/types.ts
 */

export type Vector = 'rules_file' | 'mcp_json' | 'tasks_json' | 'planted_binary'
export type Verdict = 'quarantined' | 'clean'

export interface Finding {
  vector: Vector
  file: string
  /** What this payload would actually reach. Replaces the meaningless `severity`. */
  blast_radius: string
  evidence: string
  decoded: string
  /** The gap between these two numbers IS the vulnerability. */
  visible_chars: number
  model_chars: number
  explanation: string
}

export interface Emulation {
  ran: boolean
  reason: string
  triggers_extracted: string[]
  processes: string[]
  files_written: string[]
  network_attempts: string[]
}

export interface Defanged {
  files_removed: string[]
  files_modified: string[]
  output_path: string
}

export interface ScanReport {
  repo_url: string
  verdict: Verdict
  /** Plain-English narrative joining the findings. One chain, not four flags. */
  kill_chain: string
  findings: Finding[]
  emulation: Emulation
  defanged: Defanged
}
