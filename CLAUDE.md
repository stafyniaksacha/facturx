@AGENTS.md

## Claude Code

- **Conformance review:** after changing anything under `src/lib/`, `src/lib/xsd/`, or a conformance
  claim in README/`docs/`, run the `spec-conformance-reviewer` subagent on the change (give it the diff
  range or the files) before reporting the work as done. It is read-only, so it can run alongside other
  reviews. Treat its findings as input: re-check each one against the cited rule before acting on it.
- **Reading the spec:** use `spec/factur-x-1.09/text/` (grep-able, page-marked). The Read tool can't
  render the PDFs here without poppler.
- **Worktrees:** `spec/` is versioned, so it's present in every worktree. `node_modules` is not:
  run `pnpm install` in a fresh worktree, then `pnpm build` before any test.
