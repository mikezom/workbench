# Phase 2: Write Failing Test (RED)

## Purpose

Write test(s) that describe the expected behavior of the task. The tests must fail because the implementation does not exist yet.

## Entry Condition

- Phase 1 is complete (task is understood, no ambiguity)
- No implementation code has been written for this task yet

## Iron Laws

1. **Test before implementation.** Do not write any implementation code in this phase. Only test files (`*.test.ts`).
2. **Tests must fail meaningfully.** The failure must be because the feature/fix is missing, NOT because of syntax errors, import errors, or misconfigured tests.
3. **Co-locate tests.** Place test files next to the source they test (e.g., `src/lib/db.test.ts` next to `src/lib/db.ts`).

## Instructions

1. Now you may read the source files relevant to your task to understand the existing code.

2. Write one or more test files describing the expected behavior:
   - Use `describe` and `it` blocks (globals are available, no imports needed for test functions).
   - Import the module(s) you will be testing. It is OK if the imported function does not exist yet — the test should fail because of that.
   - Keep tests focused: test the specific behavior your task requires.

3. Run the tests to confirm they fail:
   ```bash
   cd workbench && npx vitest run --reporter=verbose
   ```

4. Verify the failure is meaningful:
   - Acceptable: "function X is not exported", "expected Y but received undefined", "module has no exported member Z"
   - NOT acceptable: syntax error in the test file, wrong import path to an existing module, vitest configuration error

5. If the task has **no testable surface** (e.g., pure CSS change, static content update):
   - Write a minimal smoke test if possible (e.g., "component file exists and exports default")
   - If truly untestable, document why in a comment in your commit message and proceed

## Exit Condition

- At least one test file exists and fails with a meaningful error
- OR: task is documented as untestable with justification

## NEXT

Invoke `workbench/data/agent-skills/agent-implement-minimal.md`. Do NOT invoke any other skill.
