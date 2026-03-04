# Phase 6: Reflection After Work

## Purpose

Update project documentation to reflect the work done. This is the ONLY phase where documentation files may be modified.

## Entry Condition

- Phase 5 is complete (implementation is committed)

## Iron Laws

1. **This is the ONLY phase where you may modify PROGRESS.md, DETAILED_PROGRESS.md, or REFLECTION.md.** If you did not reach this phase, those files must remain untouched.
2. **Separate commit.** Documentation updates go in their own commit, not mixed with implementation.
3. **REFLECTION.md is conditional.** Only add an entry if a mistake was made or a non-obvious decision occurred. Do not add routine entries.

## Instructions

1. **Update PROGRESS.md** (if the task changes any phase or sub-task status):
   - Mark completed sub-tasks or phases
   - Update any status indicators

2. **Update DETAILED_PROGRESS.md** with a session entry:
   ```markdown
   ### <Task Title>
   - **Date**: YYYY-MM-DD
   - **Commit**: <short SHA from `git log --oneline -1`>
   - **Files changed**: <list key files added/modified>
   - **Summary**: <1-2 sentence description of what was done>
   ```

3. **Update REFLECTION.md** (ONLY if applicable):
   - A mistake was made and corrected during this task
   - A non-obvious decision was made that future agents should know about
   - A pitfall was discovered that isn't already documented
   - Format: `### YYYY-MM-DD — <Title>` followed by what happened and the lesson

4. Commit the documentation updates:
   ```bash
   git add PROGRESS.md DETAILED_PROGRESS.md REFLECTION.md
   git commit -m "docs: update progress and reflection"
   ```
   Only include files that were actually modified.

## Exit Condition

- Documentation is up to date
- Documentation commit is separate from implementation commit

## NEXT

**DONE.** Stop here. Do not invoke any further skills. Your task is complete.
