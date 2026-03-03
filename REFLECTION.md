# REFLECTION.md - Personal Workbench

## Purpose

Record mistakes encountered during development, how they were resolved,
prevention strategies, and the relevant git commit IDs.

---

<!-- Template for each entry:

## [Date] - Brief description of the issue

**Problem**: What went wrong

**Root Cause**: Why it happened

**Solution**: How it was fixed

**Prevention**: How to avoid this in the future

**Commit**: `<git commit id>`

-->

## 2026-03-02 - Made changes directly on master instead of a task branch

**Problem**: Edited `workbench/src/app/forest/page.tsx` directly on `master` without creating a task branch first, violating the git workflow defined in CLAUDE.md.

**Root Cause**: Jumped straight into making the code change without reading CLAUDE.md's git workflow instructions first.

**Solution**: Stashed the change, created `task/forest-white-background` branch, applied the change there, committed, merged back to master, and deleted the branch.

**Prevention**: Always create a task branch (`git checkout -b task/<name>`) BEFORE making any code changes. Follow the CLAUDE.md git workflow as the very first step of every task.

**Commit**: `874c27f`

## 2026-03-03 - Symlinked to wrong forester output directory

**Problem**: Initially symlinked `public/forest/ → output/` but local links 404'd. Clicking "My first tree" showed a 404 page inside the iframe.

**Root Cause**: Forester 5.0 outputs tree pages and theme assets into `output/forest/`, not directly into `output/`. The `output/` root only contains duplicates and the `index.html` redirect. The XML `base-url="/forest/"` means all internal links reference `/forest/{tree-id}/`, which maps correctly only when the symlink targets `output/forest/`.

**Solution**: Changed the symlink from `output/` to `output/forest/`. Also replaced the stale `afterFiles` rewrites in `next.config.mjs` (designed for a root-URL scheme) with two simple `fallback` rewrites that serve `index.xml` for directory paths under `/forest/`.

**Prevention**: When integrating a static site generator's output, inspect the actual output directory structure (`ls output/` and check where the HTML/XML files land) before creating symlinks. Don't assume the output root is the serve root.

**Commit**: uncommitted

## 2026-03-03 - Made changes directly on main instead of task branches

**Problem**: All forest setup work (forester repo, symlinks, next.config.mjs, XSL fixes) was done directly on `main` in both repos without creating task branches.

**Root Cause**: The session involved infrastructure setup across two repos (workbench + forester-repo) with many small iterative fixes. The exploratory nature of the work led to skipping the branch workflow.

**Solution**: Changes remain uncommitted on main. Should be committed on task branches retroactively.

**Prevention**: Even for infrastructure/setup tasks, create `task/<name>` branches before making changes. The git workflow applies to all work, not just feature code.

**Commit**: N/A
