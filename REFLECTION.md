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
