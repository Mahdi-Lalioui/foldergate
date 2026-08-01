/**
 * The config surface FolderGate enumerates, stated plainly.
 *
 * This is what makes "same attack, four tools, one gate" a checkable claim rather than a
 * slogan, and it is the visual answer to the judge who asks how broad the coverage really
 * is. Kept deliberately static and honest: it mirrors the glob list in issue #3, so it
 * describes what the scanner looks for, not what any single scan happened to find.
 */
const SURFACE = [
  {
    tool: 'Cursor',
    globs: ['.cursorrules', '.Cursorrules', '.cursor/rules/**', '.cursor/mcp.json'],
  },
  { tool: 'Claude Code', globs: ['CLAUDE.md', '.claude/settings.json', '.mcp.json'] },
  { tool: 'Copilot / Codex', globs: ['.github/copilot-instructions.md', 'AGENTS.md'] },
  { tool: 'Windsurf / Cline', globs: ['.windsurfrules', '.clinerules'] },
  { tool: 'VS Code', globs: ['.vscode/tasks.json', '.vscode/mcp.json'] },
  { tool: 'Dev containers', globs: ['.devcontainer/devcontainer.json'] },
]

export default function ScanSurface() {
  return (
    <section>
      <h3 className="text-xs font-semibold tracking-[0.18em] text-sage uppercase">
        What the gate inspects
      </h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SURFACE.map(({ tool, globs }) => (
          <div key={tool} className="rounded-xl border border-rule bg-card/60 p-4">
            <p className="text-sm font-medium text-ink">{tool}</p>
            <ul className="mt-2 space-y-1">
              {globs.map((g) => (
                <li key={g} className="font-mono text-xs break-all text-sage">
                  {g}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-sage">
        Plus planted executables that shadow real binaries via PATH order — extensionless{' '}
        <code className="font-mono text-ink">git</code>,{' '}
        <code className="font-mono text-ink">node</code>,{' '}
        <code className="font-mono text-ink">python</code>.
      </p>
    </section>
  )
}
