# Clipboard Test Cleanup Design

## Problem

Test cases for the clipboard section write data to the persistent SQLite database (`data/workbench.db`) but don't clean up after themselves. This causes test data to appear in the clipboard UI.

## Root Cause

- `src/lib/clipboard-db.test.ts` creates clipboard items without cleanup
- `src/app/api/clipboard/route.test.ts` creates items via POST requests without cleanup
- The database is a singleton SQLite file shared between tests and the app

## Solution

Add `beforeEach` hooks to clear the `clipboard_items` table before each test, matching the existing pattern used in:
- `src/lib/home-db.test.ts`
- `src/app/api/home/route.test.ts`
- `src/app/api/home/[id]/route.test.ts`

## Files to Modify

### 1. `src/lib/clipboard-db.test.ts`

Add imports and cleanup:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "./db";
// ... existing imports ...

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM clipboard_items");
});
```

### 2. `src/app/api/clipboard/route.test.ts`

Add imports and cleanup:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "@/lib/db";
// ... existing imports ...

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM clipboard_items");
});
```

## Files Not Modified

- `src/app/api/clipboard/[id]/route.test.ts` - already has `beforeEach` that creates a fresh test item; should also add table cleanup for consistency

## Verification

After implementation:
1. Run tests: `npx vitest run src/lib/clipboard-db.test.ts src/app/api/clipboard`
2. Verify tests pass
3. Check clipboard UI - should show no test data
