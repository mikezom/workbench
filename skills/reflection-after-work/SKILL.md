---
name: reflection-after-work
description: Self-improvement reflection and progress logging after completing a task. Use when the user says "we're done", "that's it", "update progress", "log work", or asks to reflect on what was done.
---

# Reflection After Work

This skill is the final step of a task workflow to maintain project history and surface lessons learned.

## Instructions

### Step 1: Log Detailed Progress
Append a session entry to `/home/ubuntu/DETAILED_PROGRESS.md`. 
Use the exact format specified in `assets/detailed_progress_template.md`.
- Get the commit hash from `git log --oneline`.
- Group related changes under a single task entry.
- List every file modified and briefly describe the change.

### Step 2: Write Summarized Progress
Update `/home/ubuntu/PROGRESS.md`:
1. Check off completed items by marking relevant task checkboxes with `[x]`.
2. If you completed unlisted work, add a new phase/section with checked-off items.
3. Set the phase status to "Complete" in the status table and add a brief note with the commit hash.

### Step 3: Reflect on Issues (Conditional)
Determine if anything went wrong during this task (e.g., bugs introduced, wrong approaches, build failures).
If an issue occurred, append an entry to `/home/ubuntu/REFLECTION.md` using the exact format specified in `assets/reflection_template.md`. Be honest and specific, ensuring the prevention strategy is actionable.
If nothing went wrong, skip this step entirely.

## Principles
- Accuracy over speed: Run `git log` and `git diff` to verify hashes and files rather than guessing.
- Brevity with substance: Keep entries concise but detailed enough for future comprehension.

## Common Issues

### Git Command Fails
Cause: You are not in the correct working directory or a valid git repository.
Solution: Run `pwd` to verify your directory. Navigate to the correct project root using `cd` before running `git log` or `git diff`.

### Missing Commit Hash
Cause: The work has not been committed or merged yet.
Solution: Pause and inform the user that the work must be committed to the repository before you can accurately log the progress and reflection.