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

## 2026-03-03 - Subagent created wrong branch during task execution

**Problem**: Task 2 subagent created a new branch `task/groups-db-layer-api` instead of committing on the existing `task/study-queue-sqlite` branch, requiring a merge to fix.

**Root Cause**: The subagent prompt did not explicitly instruct it to stay on the current branch. Subagents follow CLAUDE.md's "always use task branches" rule by default.

**Solution**: Merged the subagent's branch back into `task/study-queue-sqlite` and deleted the extra branch.

**Prevention**: When dispatching implementer subagents, explicitly state which branch to commit on and instruct them not to create new branches.

**Commit**: `d7ff797`

## 2026-03-03 - Three bugs in study queue logic caught by code review

**Problem**: (1) `getGroupStudiedToday()` only counted the parent group's study log, not descendant groups, causing budget to be undercounted. (2) `getRolloverBoundary()` used `Date.UTC()` making the rollover hour UTC instead of local time. (3) `reviewCard()` ran UPDATE and INSERT as separate statements without a transaction.

**Root Cause**: These were logic oversights during implementation — descendant groups weren't considered for budget counting, UTC was used where local time was intended, and transaction safety wasn't applied to the multi-statement review operation.

**Solution**: (1) Used `getDescendantIds()` with `WHERE group_id IN (...)` for budget counting. (2) Switched to `setHours()` for local time. (3) Wrapped UPDATE+INSERT in `db.transaction()`.

**Prevention**: For rollover/timezone logic, always explicitly verify UTC vs local time at the point of use. For multi-statement DB operations that must be atomic, default to wrapping in a transaction. For hierarchical data (groups with children), always check whether descendant entities need to be included in aggregate queries.

**Commit**: `99e5ad9`

## 2026-03-03 - [SERIOUS] Implemented wrong behavior by not clarifying user intent first

**Problem**: User asked to remove the "waiting for cards" process for cards with review time less than one day. Instead of asking clarifying questions about the desired behavior, I immediately implemented a change that completely removed all intra-day re-queuing — cards were reviewed once and gone. The user actually wanted cards to be **immediately** re-queued (no waiting/countdown), not removed from the session entirely. This required a second round of changes to get right.

**Root Cause**: Jumped directly into implementation without confirming what the user meant. The request was ambiguous — "no waiting for cards" could mean (a) remove re-queuing entirely, or (b) remove only the delay/countdown and requeue immediately. I assumed (a) without asking, wasting a full implementation cycle.

**Solution**: After the user clarified, restored `nextRollover` tracking and added logic to immediately append cards scheduled before rollover to the end of `immediateQueue` instead of using a delayed queue with countdown.

**Prevention**: **ALWAYS ask clarifying questions before implementing when a request has multiple plausible interpretations.** This is non-negotiable. Specifically:
1. Before touching code, restate your understanding of the desired behavior back to the user.
2. If there are two or more reasonable interpretations, list them and ask which one the user wants.
3. Never assume the simplest interpretation (removal) when the user might want a modification of existing behavior.
4. The cost of one clarifying question is far lower than the cost of implementing the wrong thing.

**Commit**: `d71a95a`

## 2026-03-03 - Next.js route file rejected non-handler export

**Problem**: Build failed with "getAgentConfig is not a valid Route export field" when the config route file exported a helper function alongside GET/PUT handlers.

**Root Cause**: Next.js App Router route files (`route.ts`) only allow exporting HTTP method handlers (GET, POST, PUT, DELETE, etc.) and specific Next.js route config. Any other named export causes a type error at build time. The `getAgentConfig` utility was exported from the route file so the decompose route could import it.

**Solution**: Extracted `getAgentConfig` and `saveAgentConfig` into a separate `src/lib/agent-config.ts` file. Both route files import from the lib instead.

**Prevention**: Never export non-handler functions from Next.js `route.ts` files. If a route needs to share logic with other routes, extract it into a `src/lib/` module.

**Commit**: `38a7b41`

## 2026-03-03 - Python 3.10+ type hint syntax used on Python 3.9 system

**Problem**: The agent daemon script used `dict | None` union type hints which require Python 3.10+. The macOS system Python at `/usr/bin/python3` is Python 3.9.6, causing `TypeError: unsupported operand type(s) for |: 'type' and 'NoneType'` at import time.

**Root Cause**: Wrote modern Python type hints without checking which Python version is installed on the target system. The launchd plist points to `/usr/bin/python3` (system Python 3.9).

**Solution**: Added `from __future__ import annotations` at the top of the script, which makes all annotations strings (lazy evaluation) and avoids the runtime `|` operator on types.

**Prevention**: When writing Python scripts intended to run on macOS system Python, always add `from __future__ import annotations` or use `Optional[X]` / `Union[X, Y]` from `typing`. Check the target Python version with `/usr/bin/python3 --version` early.

**Commit**: `dc21b6a`

## 2026-03-03 - Python module named with hyphen cannot be imported

**Problem**: The executor file was created as `agent-executor.py` (hyphen). The daemon's `from agent_executor import execute_task` failed with `ModuleNotFoundError` because Python cannot import modules with hyphens in their names.

**Root Cause**: The spec at `docs/agent-section.md` listed the file as `scripts/agent-executor.py` (matching the daemon's naming convention). The implementer followed the spec without considering that this file, unlike the daemon, needs to be *imported* by another Python module.

**Solution**: Renamed to `agent_executor.py` (underscore) via `git mv`.

**Prevention**: When creating a Python file that will be imported by other modules (not just run directly), always use underscores in the filename. Files run directly (like `agent-daemon.py`) can use hyphens, but importable modules must use underscores.

**Commit**: `7718813`

## 2026-03-03 - REPO_ROOT computed wrong number of directory levels up

**Problem**: `REPO_ROOT` was computed as `dirname(dirname(__file__))` (2 levels) but the file is at `workbench/scripts/agent_executor.py` — 3 levels below the git repo root. This would have placed worktrees inside the Next.js project directory instead of at the git root.

**Root Cause**: The plan was written assuming `scripts/` is at the repo root, but it's actually inside the `workbench/` Next.js subdirectory. The implementer followed the plan's formula without verifying the actual path depth.

**Solution**: Changed to `dirname(dirname(dirname(__file__)))` (3 levels) and verified the resolved path matches the git root.

**Prevention**: When computing relative paths from `__file__`, always verify the result by printing it or asserting against a known marker (e.g., `assert os.path.isdir(os.path.join(REPO_ROOT, ".git"))`). Don't trust directory-level arithmetic without checking.

**Commit**: `2f5ab6b`

## 2026-03-04 - Polling stop condition too aggressive for new status usage

**Problem**: After adding `waiting_for_review` as a polled status in the TaskDetailModal, the existing `fetchTask` callback would clear the polling interval for any status other than `developing`. This meant polling would stop as soon as a task entered `waiting_for_review`, preventing the questions UI from staying updated.

**Root Cause**: The original `fetchTask` had a stop-polling guard `if (data.status !== "developing")` which was correct when `developing` was the only active polling status. When the useEffect was extended to also poll for `waiting_for_review`, the stop condition in `fetchTask` wasn't updated to match, creating a conflict between the two.

**Solution**: Changed the stop condition to `if (data.status !== "developing" && data.status !== "waiting_for_review")` so polling continues for both active statuses.

**Prevention**: When extending polling conditions in useEffect to cover additional statuses, always check all places where polling is stopped (interval cleanup in callbacks, not just the setup condition). Search for `clearInterval(pollRef` to find all polling termination points.

**Commit**: `e1f3723`
