# Clipboard Test Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add beforeEach cleanup to clipboard tests to prevent test data from persisting in the UI.

**Architecture:** Add `beforeEach` hooks that clear the `clipboard_items` table before each test, matching the existing pattern in home-db tests.

**Tech Stack:** Vitest, better-sqlite3, Next.js API routes

---

### Task 1: Add cleanup to clipboard-db.test.ts

**Files:**
- Modify: `workbench/src/lib/clipboard-db.test.ts`

**Step 1: Add beforeEach import and cleanup**

Modify the imports at the top of the file and add the cleanup hook:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "./db";
import {
  createClipboardItem,
  getAllClipboardItems,
  getClipboardItem,
  updateClipboardItem,
  deleteClipboardItem,
} from "./clipboard-db";

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM clipboard_items");
});

describe("clipboard-db", () => {
  // ... rest of file unchanged
```

**Step 2: Run tests to verify they still pass**

Run: `cd workbench && npx vitest run src/lib/clipboard-db.test.ts`

Expected: All tests pass

**Step 3: Commit**

```bash
git add workbench/src/lib/clipboard-db.test.ts
git commit -m "fix: add cleanup to clipboard-db tests"
```

---

### Task 2: Add cleanup to clipboard API route tests

**Files:**
- Modify: `workbench/src/app/api/clipboard/route.test.ts`

**Step 1: Add beforeEach import and cleanup**

Modify the file:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { GET, POST } from "./route";
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM clipboard_items");
});

describe("GET /api/clipboard", () => {
  // ... rest of file unchanged
```

**Step 2: Run tests to verify they still pass**

Run: `cd workbench && npx vitest run src/app/api/clipboard/route.test.ts`

Expected: All tests pass

**Step 3: Commit**

```bash
git add workbench/src/app/api/clipboard/route.test.ts
git commit -m "fix: add cleanup to clipboard API route tests"
```

---

### Task 3: Add cleanup to clipboard [id] route tests

**Files:**
- Modify: `workbench/src/app/api/clipboard/[id]/route.test.ts`

**Step 1: Add table cleanup to existing beforeEach**

The file already has a `beforeEach` that creates a test item. Add the table cleanup to it.

Find the existing `beforeEach` block and modify it:

```typescript
beforeEach(async () => {
  // Clear table first
  const db = getDb();
  db.exec("DELETE FROM clipboard_items");

  // Create a test item before each test
  const createRequest = new NextRequest("http://localhost:3000/api/clipboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: "test item" }),
  });
  // ... rest unchanged
```

**Step 2: Run tests to verify they still pass**

Run: `cd workbench && npx vitest run src/app/api/clipboard/[id]/route.test.ts`

Expected: All tests pass

**Step 3: Commit**

```bash
git add workbench/src/app/api/clipboard/[id]/route.test.ts
git commit -m "fix: add table cleanup to clipboard [id] route tests"
```

---

### Task 4: Run full test suite and verify

**Step 1: Run all clipboard-related tests**

Run: `cd workbench && npx vitest run src/lib/clipboard-db.test.ts src/app/api/clipboard`

Expected: All tests pass

**Step 2: Manual verification - run tests then check database**

Run tests first:
```bash
cd workbench && npx vitest run src/lib/clipboard-db.test.ts src/app/api/clipboard
```

Then check the database has no test data:
```bash
sqlite3 data/workbench.db "SELECT COUNT(*) FROM clipboard_items;"
```

Expected: `0` (or only your real data, not test data)

**Step 3: Final commit if any fixes needed**

If everything passes, no additional commit needed.

---

## Summary

| Task | File | Action |
|------|------|--------|
| 1 | `src/lib/clipboard-db.test.ts` | Add beforeEach cleanup |
| 2 | `src/app/api/clipboard/route.test.ts` | Add beforeEach cleanup |
| 3 | `src/app/api/clipboard/[id]/route.test.ts` | Add table cleanup to existing beforeEach |
| 4 | All | Verify tests pass and database is clean |
