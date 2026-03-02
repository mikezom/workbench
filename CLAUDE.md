# CLAUDE.md

## Git Workflow for Tasks

When completing any task, follow this branch-based workflow:

1. **Create a task branch** — Branch off `main` with a descriptive name (e.g., `task/add-login-page`)
   ```
   git checkout main
   git checkout -b task/<short-description>
   ```

2. **Work on the task branch** — Make all changes on this branch, not on `main`

3. **Commit the code** — After the task is complete, stage and commit with a clear message
   ```
   git add <files>
   git commit -m "<description of changes>"
   ```

4. **Merge and test** — Switch to `main`, merge the task branch, and verify everything works
   ```
   git checkout main
   git merge task/<short-description>
   ```
   Run tests/build to confirm nothing is broken.

5. **Fetch and rebase to main** — Keep history clean
   ```
   git fetch origin
   git rebase origin/main
   ```

6. **Mark the task as complete** — Update PROGRESS.md to check off the finished task

7. **Clean up the task branch** — Delete the branch after a successful merge
   ```
   git branch -d task/<short-description>
   ```

8. **Log detailed progress** — After all tasks in the session are complete, append a session entry to `DETAILED_PROGRESS.md` with:
   - Date and phase/topic heading
   - For each task: commit ID, problem description, and list of files changed with what was done in each
