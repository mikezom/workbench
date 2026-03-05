# Test Database Isolation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent tests from wiping production database by automatically using in-memory SQLite when running tests.

**Architecture:** Modify `getDb()` to detect test environment via `process.env.VITEST` and use `:memory:` database instead of file path. Singleton pattern ensures all tests share one in-memory database, with existing `beforeEach()` cleanup hooks handling data isolation between tests.

**Tech Stack:** TypeScript, better-sqlite3, Vitest

---

## Task 1: Add Environment Detection to getDb()

**Files:**
- Modify: `workbench/src/lib/db.ts:18-33`

**Step 1: Modify getDb() to detect test environment**

Update the `getDb()` function to check for test environment and use in-memory database:

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

**Changes:**
- Line 21-22: Add `isTest` detection checking `VITEST` and `NODE_ENV`
- Line 23: Use ternary to select `:memory:` or file path based on `isTest`
- Lines 25-32: Unchanged (existing initialization logic)

**Step 2: Verify tests still pass**

Run the test suite to ensure in-memory database works correctly:

```bash
cd workbench && npm test
```

**Expected output:**
- All existing tests pass
- Tests run faster (in-memory is faster than file I/O)
- No errors about missing database file

**Step 3: Verify production database is unchanged**

Check that development mode still uses file database:

```bash
cd workbench && npm run dev
```

Then visit the app and verify existing data is still present (not wiped).

**Step 4: Commit the change**

```bash
git add workbench/src/lib/db.ts
git commit -m "feat: use in-memory database for tests

Automatically detect test environment and use :memory: SQLite database
to prevent tests from wiping production data. Tests now run in complete
isolation while preserving existing test patterns.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Verification Testing

**Files:**
- Test: `workbench/src/lib/home-db.test.ts`
- Test: `workbench/src/lib/clipboard-db.test.ts`

**Step 1: Run specific database tests**

Verify clipboard and home database tests work with in-memory database:

```bash
cd workbench && npm test -- src/lib/clipboard-db.test.ts
cd workbench && npm test -- src/lib/home-db.test.ts
```

**Expected output:**
- All tests pass
- No errors about database locking or file access
- Tests complete quickly

**Step 2: Verify production data is intact**

After running tests, check that production database still has data:

```bash
cd workbench && ls -lh data/workbench.db
```

**Expected:**
- File exists and has non-zero size
- File modification time is NOT recent (tests didn't touch it)

**Step 3: Run full test suite**

```bash
cd workbench && npm test
```

**Expected:**
- All tests pass
- No database-related errors
- Faster test execution than before

---

## Completion Checklist

- [ ] `getDb()` modified with environment detection
- [ ] Tests pass with in-memory database
- [ ] Production database unchanged by test runs
- [ ] Code committed with descriptive message
- [ ] Full test suite passes

## Notes

**Why no test changes needed:** Existing tests already use `beforeEach()` with `DELETE FROM` statements. These work identically on in-memory databases, so no test modifications are required.

**Environment variable:** Vitest automatically sets `process.env.VITEST = 'true'`, so no vitest.config.ts changes needed.

**Singleton behavior:** The `_db` singleton ensures all tests share one in-memory database instance, matching the current test design where tests expect a shared database with cleanup between tests.
