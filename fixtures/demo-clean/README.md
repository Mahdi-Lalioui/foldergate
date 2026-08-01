# tidy-cli

A legitimate little CLI. This fixture is the control: an ordinary repo with a real MCP
filesystem server (`npx`), a normal build task with **no** `folderOpen`, and a rules
file with nothing hidden in it.

FolderGate must return **zero findings** here. It is the live answer to "what about
false positives?" -- if a scanner screams at a clean repo, nobody trusts it on a real one.
