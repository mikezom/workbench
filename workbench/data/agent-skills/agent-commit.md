# Phase 5: Commit

## Purpose

Create a clean, focused git commit for the implementation work.

## Entry Condition

- Phase 4 is complete (all tests pass, build passes, task is complete)

## Iron Laws

1. **Do not commit CLAUDE.md files.** Never include any `CLAUDE.md`, `agent-working-claude.md`, or `agent-decompose-claude.md` in your commit.
2. **Do not modify PROGRESS.md, DETAILED_PROGRESS.md, or REFLECTION.md.** Those are updated in Phase 6 only.
3. **Focused commits.** Only include files related to this task.

## Instructions

1. Stage the relevant files:
   ```bash
   git add <specific-files>
   ```
   - Include source files, test files, and any new/modified configuration
   - Do NOT use `git add -A` or `git add .`
   - Do NOT include: `CLAUDE.md`, `agent-working-claude.md`, `PROGRESS.md`, `DETAILED_PROGRESS.md`, `REFLECTION.md`, `questions.json`

2. Commit with a descriptive message using conventional format:
   ```
   <type>: <description>
   ```
   Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

   Example: `feat: add date formatting utility with YYYY-MM-DD output`

3. Verify the commit:
   ```bash
   git log --oneline -1
   git diff --stat HEAD~1
   ```

## Exit Condition

- A clean commit exists with only task-related files
- Commit message follows conventional format

## NEXT

Invoke `workbench/data/agent-skills/agent-reflection-after-work.md`. Do NOT invoke any other skill.
