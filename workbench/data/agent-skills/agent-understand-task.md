# Phase 1: Understand the Task

## Purpose

Absorb all relevant context before touching any code. Determine whether the task is clear enough to proceed or needs clarification.

## Entry Condition

- You have been invoked by the pipeline skeleton in CLAUDE.md
- You have NOT yet read any source files

## Iron Laws

1. **No code changes.** Do not create, edit, or delete any source files in this phase.
2. **No source file reading.** Do not read files in `src/`, `scripts/`, or any implementation files. You may only read documentation files listed below.
3. **Read documentation first.** Always read the relevant section docs before forming your plan.

## Instructions

1. Read your task description carefully. Identify which section(s) it involves:
   - Forest section → read `docs/forest-section.md`
   - Study section → read `docs/study-section.md`
   - Agent section → read `docs/agent-section.md`
   - If it spans multiple sections, read all relevant docs.

2. Read `PROGRESS.md` to understand current project state.

3. Read `REFLECTION.md` to check for past mistakes relevant to this task.

4. Assess clarity:
   - **If the task is ambiguous** (multiple valid interpretations, missing requirements, unclear scope):
     Write `questions.json` to the repository root and **STOP immediately**. Do not proceed to any further phase.
   - **If the task is clear**: Proceed to the next phase.

## Exit Condition

One of:
- `questions.json` has been written and you have STOPPED (waiting for answers)
- You have a clear understanding of the task and are ready to write tests

## NEXT

Invoke `workbench/data/agent-skills/agent-write-failing-test.md`. Do NOT invoke any other skill.
