@AGENTS.md

## Claude Code

- **Node 22:** each Bash call is a fresh shell, so select Node in the *same* command, e.g.
  `nvm use >/dev/null && pnpm install && pnpm build` (`nvm use` reads `.nvmrc`). If the default is
  Node 24, the libxmljs native build fails partway through `pnpm install`.
- **Conformance review:** after changing anything under `src/lib/`, `src/lib/xsd/`, or a conformance
  claim in README/`docs/`, run the `spec-conformance-reviewer` subagent on the change (give it the diff
  range or the files) before reporting the work as done. It is read-only, so it can run alongside other
  reviews. Treat its findings as input: re-check each one against the cited rule before acting on it.
- **Reading the spec:** use `spec/factur-x-1.09/text/` (grep-able, page-marked). The Read tool can't
  render the PDFs here without poppler.
- **Worktrees:** `spec/` is versioned, so it's present in every worktree. `node_modules` is not:
  run `pnpm install` (on Node 22) in a fresh worktree before building.
