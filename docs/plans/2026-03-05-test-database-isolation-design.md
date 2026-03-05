# Test Database Isolation Design

**Date:** 2026-03-05
**Status:** Approved

## Problem

Running tests on the clipboard database and home database cleans all content in the workbench project. Tests use `beforeEach()` hooks with `DELETE FROM` statements that operate on the production database at `data/workbench.db`, wiping real data.

## Solution

Modify `getDb()` in `src/lib/db.ts` to automatically use an in-memory SQLite database (`:memory:`) when running in a test environment. This provides complete isolation between tests and production data.

## Design Decisions

### Database Selection Strategy

**Automatic environment detection:** Check for `process.env.VITEST === 'true'` or `process.env.NODE_ENV === 'test'` to determine if running in test mode.

**Why this approach:**
- Vitest automatically sets `VITEST=true` - no additional configuration needed
- No changes required to existing test files
- Preserves current test patterns with `beforeEach()` cleanup hooks
- Zero risk of accidentally using production database in tests

### Database Lifecycle

**One shared in-memory database for entire test run:**
- First test creates the in-memory database and initializes schema
- Singleton pattern ensures all tests share the same database instance
- `beforeEach()` hooks clean data between tests (existing pattern)
- Database is discarded when test process exits

**Why shared vs. per-test:**
- Matches current test patterns (tests already expect shared database with cleanup)
- Faster than recreating schema for every test
- Still provides complete isolation from production data

## Implementation

### Code Changes

**File:** `src/lib/db.ts`

**Function:** `getDb()` (lines 18-33)

```typescript
export function getDb(): Database.Database {
  if (_db) return _db;

  // Use in-memory database for tests
  const isTest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
  const dbPath = isTest ? ':memory:' : path.join(process.cwd(), "data", "workbench.db");

  _db = new Database(dbPath);

  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  initSchema(_db);
  initAgentSchema(_db);
  initClipboardSchema(_db);
  initCrawlSchema(_db);
  initHomeSchema(_db);
  return _db;
}
```

### What Changes

- Add environment detection before database path construction
- Use `:memory:` for test environment, file path for production
- All other initialization remains identical

### What Stays the Same

- Singleton pattern preserved
- Schema initialization unchanged
- Test files unchanged
- `beforeEach()` cleanup hooks unchanged
- Production database behavior unchanged

## Edge Cases & Error Handling

### WAL Pragma on In-Memory Database

SQLite silently ignores `journal_mode = WAL` for `:memory:` databases. This is harmless and requires no special handling.

### Migration Function

`migrateFromJson()` checks for `data/groups.json` which won't exist in test environment. Migration is correctly skipped.

### Worktrees

Each worktree has its own `data/workbench.db` file. Tests in any worktree use in-memory databases, preventing interference with worktree databases or main database.

### Accidental Production Use

Environment check only triggers when `VITEST` or `NODE_ENV=test` is explicitly set. Normal development (`npm run dev`) and production builds never set these variables, ensuring file database is always used.

### Database Reset Between Test Runs

In-memory database exists only while Node process is alive. Each `npm test` invocation is a fresh process with a clean database.

## Testing Strategy

No changes needed to existing tests. Current test patterns continue to work:

```typescript
beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM clipboard_items");
});
```

Tests automatically use in-memory database when run via `npm test` or `vitest`.

## Benefits

- **Complete isolation:** Tests never touch production data
- **Fast:** In-memory databases are faster than file-based
- **Automatic:** No configuration or test file changes needed
- **Safe:** Impossible to accidentally use production database in tests
- **Clean:** Each test run starts with fresh database

## Risks

None identified. The change is minimal, well-isolated, and automatically detected.
