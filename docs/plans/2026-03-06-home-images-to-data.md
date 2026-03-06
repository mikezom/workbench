# Home Images to Data Folder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move home section image storage from `public/uploads/` to `data/images/` and serve via API route to prevent deletion during development.

**Architecture:** Replace direct file serving from `public/` with API-based serving from `data/`. Images stored in `data/images/` alongside the SQLite database. New API route `GET /api/home/images/[filename]` reads files and returns with proper content-type headers.

**Tech Stack:** Next.js App Router, Node.js fs module, better-sqlite3 (existing)

---

## Task 1: Create Image Serving API Route

**Files:**
- Create: `workbench/src/app/api/home/images/[filename]/route.ts`
- Create: `workbench/src/app/api/home/images/[filename]/route.test.ts`

**Step 1: Write the failing test**

Create test file with image serving test:

```typescript
import { GET } from "./route";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

describe("GET /api/home/images/[filename]", () => {
  const testImagesDir = path.join(process.cwd(), "data", "images");
  const testFilename = "test-image.jpg";
  const testFilePath = path.join(testImagesDir, testFilename);

  beforeEach(() => {
    // Create test images directory
    if (!fs.existsSync(testImagesDir)) {
      fs.mkdirSync(testImagesDir, { recursive: true });
    }
    // Create a test image file
    fs.writeFileSync(testFilePath, Buffer.from([0xff, 0xd8, 0xff, 0xe0])); // JPEG header
  });

  afterEach(() => {
    // Clean up test file
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  it("should return image with correct content-type for JPEG", async () => {
    const request = new NextRequest(
      new URL("http://localhost:3000/api/home/images/test-image.jpg")
    );
    const response = await GET(request, { params: { filename: testFilename } });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
  });

  it("should return 404 for non-existent image", async () => {
    const request = new NextRequest(
      new URL("http://localhost:3000/api/home/images/nonexistent.jpg")
    );
    const response = await GET(request, { params: { filename: "nonexistent.jpg" } });

    expect(response.status).toBe(404);
  });

  it("should return correct content-type for PNG", async () => {
    const pngFilename = "test-image.png";
    const pngFilePath = path.join(testImagesDir, pngFilename);
    fs.writeFileSync(pngFilePath, Buffer.from([0x89, 0x50, 0x4e, 0x47])); // PNG header

    const request = new NextRequest(
      new URL("http://localhost:3000/api/home/images/test-image.png")
    );
    const response = await GET(request, { params: { filename: pngFilename } });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");

    fs.unlinkSync(pngFilePath);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- workbench/src/app/api/home/images/[filename]/route.test.ts`

Expected: FAIL with "Cannot find module './route'"

**Step 3: Write minimal implementation**

Create the API route:

```typescript
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const IMAGES_DIR = path.join(process.cwd(), "data", "images");

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    const filename = params.filename;
    const filePath = path.join(IMAGES_DIR, filename);

    // Security: prevent path traversal
    if (!filePath.startsWith(IMAGES_DIR)) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    // Read file
    const fileBuffer = fs.readFileSync(filePath);

    // Determine content type
    const ext = path.extname(filename).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream";

    // Return image with proper headers
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to serve image" },
      { status: 500 }
    );
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- workbench/src/app/api/home/images/[filename]/route.test.ts`

Expected: PASS (all 3 tests)

**Step 5: Commit**

```bash
git add workbench/src/app/api/home/images/
git commit -m "feat(home): add API route to serve images from data/images"
```

---

## Task 2: Update Upload Route to Use Data Folder

**Files:**
- Modify: `workbench/src/app/api/home/upload/route.ts`
- Modify: `workbench/src/app/api/home/upload/route.test.ts`

**Step 1: Update existing test to expect new URL format**

Modify the test file to expect `/api/home/images/` URLs:

```typescript
// In route.test.ts, update the assertion:
expect(result.url).toMatch(/^\/api\/home\/images\/\d+-[a-z0-9]+\.(jpg|jpeg|png|gif|webp)$/);
```

**Step 2: Run test to verify it fails**

Run: `npm test -- workbench/src/app/api/home/upload/route.test.ts`

Expected: FAIL with URL format mismatch (expects `/uploads/` but gets `/api/home/images/`)

**Step 3: Update upload route implementation**

Modify `route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "data", "images");
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "File must be an image (jpg, png, gif, or webp)" },
        { status: 400 }
      );
    }

    // Ensure uploads directory exists
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    // Generate unique filename
    const ext = path.extname(file.name);
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const filename = `${timestamp}-${random}${ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);

    // Save file
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    return NextResponse.json({ url: `/api/home/images/${filename}` });
  } catch {
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- workbench/src/app/api/home/upload/route.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add workbench/src/app/api/home/upload/
git commit -m "feat(home): update upload route to store images in data/images"
```

---

## Task 3: Manual Testing and Verification

**Files:**
- None (manual testing)

**Step 1: Start development server**

Run: `npm run dev`

Expected: Server starts on http://localhost:3000

**Step 2: Test image upload**

1. Navigate to http://localhost:3000
2. Click "New Post"
3. Enter some content
4. Upload an image
5. Submit the post

Expected: Post appears with image displayed correctly

**Step 3: Verify image location**

Run: `ls -la workbench/data/images/`

Expected: Image file exists in `data/images/` directory

**Step 4: Verify image URL**

Inspect the image element in browser DevTools:

Expected: `src` attribute is `/api/home/images/{timestamp}-{random}.{ext}`

**Step 5: Test image serving**

Open the image URL directly in browser: http://localhost:3000/api/home/images/{filename}

Expected: Image displays correctly

**Step 6: Stop development server**

Press Ctrl+C

Expected: Server stops

---

## Task 4: Update .gitignore

**Files:**
- Modify: `workbench/.gitignore`

**Step 1: Add data/images to .gitignore**

Add this line to `.gitignore`:

```
# Home section uploaded images
data/images/
```

**Step 2: Verify .gitignore works**

Run: `git status`

Expected: `data/images/` directory should not appear in untracked files

**Step 3: Commit**

```bash
git add workbench/.gitignore
git commit -m "chore: add data/images to .gitignore"
```

---

## Task 5: Clean Up Old Public Uploads Directory

**Files:**
- None (directory cleanup)

**Step 1: Check if old uploads directory exists**

Run: `ls -la workbench/public/uploads/ 2>/dev/null || echo "Directory does not exist"`

Expected: Either shows directory contents or "Directory does not exist"

**Step 2: Remove old uploads directory if it exists**

Run: `rm -rf workbench/public/uploads/`

Expected: Directory removed

**Step 3: Verify removal**

Run: `ls -la workbench/public/`

Expected: No `uploads/` directory listed

---

## Task 6: Update Documentation

**Files:**
- Create: `workbench/docs/home-section.md`

**Step 1: Create home section documentation**

```markdown
# Home Section

## Overview

The home section is a personal dashboard with a masonry-grid layout for posts. Each post can contain text content and an optional image.

## Architecture

### Data Storage

**Database**: SQLite (`data/workbench.db`)

**Table**: `home_posts`
```sql
CREATE TABLE home_posts (
  id          TEXT PRIMARY KEY,
  content     TEXT NOT NULL,
  image_url   TEXT,
  created_at  TEXT NOT NULL
);
```

**Images**: Stored in `data/images/` directory (gitignored)

### API Routes

- `GET /api/home` - List all posts (ordered by created_at DESC)
- `POST /api/home` - Create new post
- `GET /api/home/[id]` - Get single post
- `PUT /api/home/[id]` - Update post
- `DELETE /api/home/[id]` - Delete post
- `POST /api/home/upload` - Upload image (returns URL)
- `GET /api/home/images/[filename]` - Serve image from data/images

### Frontend

**Page**: `src/app/page.tsx`

**Layout**: Masonry grid (1 column mobile, 2 columns tablet, 3 columns desktop)

**Features**:
- Create/edit/delete posts
- Optional image upload
- Modal form for post creation/editing
- Responsive masonry layout

## Image Storage

Images are stored in `data/images/` instead of `public/uploads/` to prevent deletion during development builds.

**Upload flow**:
1. User selects image in post form
2. Image uploaded to `POST /api/home/upload`
3. File saved to `data/images/{timestamp}-{random}.{ext}`
4. API returns URL: `/api/home/images/{filename}`
5. URL stored in `home_posts.image_url`

**Serving flow**:
1. Frontend requests `/api/home/images/{filename}`
2. API route reads file from `data/images/`
3. Returns file with proper content-type header
4. Browser displays image

## Database Module

**File**: `src/lib/home-db.ts`

**Functions**:
- `initHomeSchema(db)` - Create table if not exists
- `createHomePost(data)` - Insert new post
- `getAllHomePosts()` - Get all posts
- `getHomePost(id)` - Get single post
- `updateHomePost(id, updates)` - Update post
- `deleteHomePost(id)` - Delete post

## Testing

**Test files**:
- `src/app/api/home/route.test.ts`
- `src/app/api/home/[id]/route.test.ts`
- `src/app/api/home/upload/route.test.ts`
- `src/app/api/home/images/[filename]/route.test.ts`

Run tests: `npm test`
```

**Step 2: Commit**

```bash
git add workbench/docs/home-section.md
git commit -m "docs: add home section documentation"
```

---

## Task 7: Run Full Test Suite

**Files:**
- None (testing)

**Step 1: Run all tests**

Run: `npm test`

Expected: All tests pass

**Step 2: Run tests in watch mode to verify no regressions**

Run: `npm test -- --watch`

Expected: All tests pass, watch mode active

**Step 3: Stop watch mode**

Press 'q' to quit

Expected: Watch mode exits

---

## Summary

This plan moves home section images from `public/uploads/` to `data/images/` and serves them via API route. The changes are minimal and focused:

1. New API route to serve images from `data/images/`
2. Updated upload route to save to `data/images/` and return API URLs
3. Updated .gitignore to exclude `data/images/`
4. Documentation for the home section

**Benefits**:
- Images persist alongside database in `data/` folder
- No migration needed (existing images will be replaced naturally)
- API-based serving gives control over caching and future enhancements
- Consistent data storage location

**Testing strategy**:
- Unit tests for both API routes
- Manual testing of upload and display
- Verification of file system changes
