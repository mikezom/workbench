# Phase 4: Verify Green

## Purpose

Run the full test suite and build to ensure nothing is broken. Assess whether the task is fully complete or needs another TDD cycle.

## Entry Condition

- Phase 3 is complete (implementation passes its tests)

## Iron Laws

1. **Both tests and build must pass.** A passing test suite with a broken build is not acceptable.
2. **Honest completeness assessment.** Do not claim the task is complete if there are unimplemented requirements.

## Instructions

1. Run the full test suite:
   ```bash
   cd workbench && npx vitest run --reporter=verbose
   ```

2. Run the build:
   ```bash
   cd workbench && npm run build
   ```

3. If either fails, fix the issue and re-run. Do not proceed until both pass.

4. Assess task completeness:
   - Re-read the original task description
   - Compare what was requested vs what has been implemented and tested
   - Are there requirements that are not yet covered by tests?

5. Route to next phase:
   - **Task incomplete** (untested requirements remain): Go back to Phase 2 for another TDD cycle
   - **Task complete** (all requirements implemented and tested, build passes): Proceed to Phase 5

## Exit Condition

- Full test suite passes (exit code 0)
- `npm run build` passes (exit code 0)
- Completeness assessment is done

## NEXT (conditional)

- If task is **incomplete**: Invoke `workbench/data/agent-skills/agent-write-failing-test.md`. Do NOT invoke any other skill.
- If task is **complete**: Invoke `workbench/data/agent-skills/agent-commit.md`. Do NOT invoke any other skill.
