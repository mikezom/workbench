# Phase 3: Implement Minimal Code (GREEN)

## Purpose

Write the minimum implementation code to make the failing tests pass. No more, no less.

## Entry Condition

- Phase 2 is complete (failing tests exist)
- Tests fail with meaningful errors related to missing implementation

## Iron Laws

1. **Minimum code only.** Write only enough code to satisfy the existing tests. Do not add features, error handling, or abstractions beyond what the tests require.
2. **No new tests in this phase.** If you realize more tests are needed, note it — they will be added in the next TDD cycle after Phase 4 routes you back.
3. **Follow existing conventions.** Match the project's coding style, file organization, and patterns as documented in the section docs and CLAUDE.md.

## Instructions

1. Read the failing test(s) to understand exactly what behavior is expected.

2. Implement the minimum code to make the tests pass:
   - API routes go in `src/app/api/<section>/route.ts`
   - Database operations go in `src/lib/db.ts` or `src/lib/agent-db.ts`
   - Shared utilities go in `src/lib/`
   - Follow all conventions from CLAUDE.md (no helper exports from route files, use transactions for multi-statement mutations, etc.)

3. Run the tests to confirm they pass:
   ```bash
   cd workbench && npx vitest run --reporter=verbose
   ```

4. If tests still fail, iterate on the implementation until they pass. Do not modify the tests to make them pass — fix the implementation.

## Exit Condition

- All tests pass (exit code 0)

## NEXT

Invoke `workbench/data/agent-skills/agent-verify-green.md`. Do NOT invoke any other skill.
