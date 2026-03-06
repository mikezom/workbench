# Home Expand Modal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add expand button to home posts with modal view for HD images and text

**Architecture:** Create new ImageModal component with conditional layout (side-by-side for images, centered for text-only). Add expand button to post cards with hover visibility. Modal closes via X button, ESC key, or background click.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS

---

## Task 1: Create ImageModal Component Structure

**Files:**
- Create: `workbench/src/components/image-modal.tsx`

**Step 1: Create the component file with basic structure**

Create `workbench/src/components/image-modal.tsx`:

```typescript
"use client";

import { useEffect } from "react";

interface HomePost {
  id: string;
  content: string;
  image_url: string | null;
  created_at: string;
}

interface ImageModalProps {
  isOpen: boolean;
  post: HomePost | null;
  onClose: () => void;
}

export default function ImageModal({ isOpen, post, onClose }: ImageModalProps) {
  // ESC key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen || !post) return null;

  // Background click handler
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={handleBackdropClick}
    >
      <div className="relative bg-white dark:bg-neutral-800 rounded-lg shadow-2xl overflow-hidden w-[80vw] h-[80vh] max-md:w-[95vw] max-md:h-[90vh]">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 text-3xl leading-none"
          aria-label="Close modal"
        >
          ×
        </button>

        {/* Content area - conditional layout */}
        {post.image_url ? (
          // Side-by-side layout for posts with images
          <div className="flex flex-col md:flex-row h-full">
            {/* Image area - 70% on desktop */}
            <div className="w-full md:w-[70%] overflow-y-auto p-6 flex items-start justify-center">
              <img
                src={post.image_url}
                alt=""
                className="max-w-full h-auto object-contain"
              />
            </div>

            {/* Text area - 30% on desktop */}
            <div className="w-full md:w-[30%] overflow-y-auto p-6 border-t md:border-t-0 md:border-l border-neutral-200 dark:border-neutral-700">
              <p className="text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap">
                {post.content}
              </p>
            </div>
          </div>
        ) : (
          // Centered text-only layout for posts without images
          <div className="flex items-center justify-center h-full p-6">
            <div className="max-w-[600px] overflow-y-auto">
              <p className="text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap">
                {post.content}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify the file was created**

Run: `ls -la workbench/src/components/image-modal.tsx`

Expected: File exists

**Step 3: Commit**

```bash
git add workbench/src/components/image-modal.tsx
git commit -m "feat: create ImageModal component with conditional layout

- ESC key, X button, and background click to close
- Side-by-side layout (70/30) for posts with images
- Centered text-only layout for posts without images
- Responsive: stacks vertically on mobile

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add Expand Button to Home Page

**Files:**
- Modify: `workbench/src/app/page.tsx`

**Step 1: Import ImageModal and add state**

At the top of `workbench/src/app/page.tsx`, add the import:

```typescript
import ImageModal from "@/components/image-modal";
```

Inside the `Home` component, after the existing state declarations (around line 19), add:

```typescript
const [expandedPost, setExpandedPost] = useState<HomePost | null>(null);
```

**Step 2: Add expand button to post cards**

Find the post card div (around line 122-150). Change the opening div from:

```typescript
<div
  key={post.id}
  className="masonry-item bg-white dark:bg-neutral-800 rounded-lg shadow p-4 break-inside-avoid"
>
```

To:

```typescript
<div
  key={post.id}
  className="masonry-item bg-white dark:bg-neutral-800 rounded-lg shadow p-4 break-inside-avoid relative group"
>
```

Then, immediately after the opening div and before the image, add the expand button:

```typescript
{/* Expand button - visible on hover */}
<button
  onClick={() => setExpandedPost(post)}
  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black bg-opacity-50 hover:bg-opacity-70 text-white rounded-full p-2 z-10"
  aria-label="Expand post"
>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-5 w-5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
    />
  </svg>
</button>
```

**Step 3: Add ImageModal component at the end**

At the end of the component, before the closing `</PageContainer>` tag (around line 152), add:

```typescript
<ImageModal
  isOpen={expandedPost !== null}
  post={expandedPost}
  onClose={() => setExpandedPost(null)}
/>
```

**Step 4: Test the feature manually**

Run: `cd workbench && npm run dev`

Then open http://localhost:5090 in a browser and:
1. Hover over a post card - expand button should appear
2. Click expand button - modal should open
3. Test closing via X button, ESC key, and background click
4. Test with posts that have images and posts without images
5. Test responsive behavior by resizing browser window

Expected: All interactions work as designed

**Step 5: Commit**

```bash
git add workbench/src/app/page.tsx
git commit -m "feat: add expand button and modal to home posts

- Expand button appears on hover (top-right corner)
- Opens ImageModal with selected post
- Modal closes via X button, ESC, or background click
- Works for posts with and without images

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Improve Modal Styling

**Files:**
- Modify: `workbench/src/components/image-modal.tsx`

**Step 1: Remove border between image and text areas**

In `workbench/src/components/image-modal.tsx`, find the text area div (around line 48):

```typescript
<div className="w-full md:w-[30%] overflow-y-auto p-6 border-t md:border-t-0 md:border-l border-neutral-200 dark:border-neutral-700">
```

Change to (remove border classes):

```typescript
<div className="w-full md:w-[30%] overflow-y-auto p-6">
```

**Step 2: Add smooth scrolling**

In the same file, update both scrollable areas to include smooth scrolling. Change the image area div (around line 42):

```typescript
<div className="w-full md:w-[70%] overflow-y-auto p-6 flex items-start justify-center">
```

To:

```typescript
<div className="w-full md:w-[70%] overflow-y-auto p-6 flex items-start justify-center scroll-smooth">
```

And the text area div:

```typescript
<div className="w-full md:w-[30%] overflow-y-auto p-6">
```

To:

```typescript
<div className="w-full md:w-[30%] overflow-y-auto p-6 scroll-smooth">
```

Also update the centered text-only layout (around line 58):

```typescript
<div className="max-w-[600px] overflow-y-auto">
```

To:

```typescript
<div className="max-w-[600px] overflow-y-auto scroll-smooth">
```

**Step 3: Test the styling improvements**

Run: `cd workbench && npm run dev`

Open http://localhost:5090 and verify:
1. No border between image and text areas
2. Smooth scrolling when content overflows
3. Layout still looks good on mobile and desktop

Expected: Cleaner appearance, smooth scrolling works

**Step 4: Commit**

```bash
git add workbench/src/components/image-modal.tsx
git commit -m "style: improve modal appearance

- Remove border between image and text areas
- Add smooth scrolling to all scrollable areas
- Cleaner visual separation through spacing only

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Run Build and Tests

**Files:**
- None (verification only)

**Step 1: Run the build**

Run: `cd workbench && npm run build`

Expected: Build succeeds with no errors

**Step 2: Run tests**

Run: `cd workbench && npm test`

Expected: All tests pass

**Step 3: Manual testing checklist**

Start dev server: `cd workbench && npm run dev`

Test the following scenarios:
1. ✓ Expand button appears on hover for all posts
2. ✓ Expand button disappears when not hovering
3. ✓ Modal opens when clicking expand button
4. ✓ Modal shows side-by-side layout for posts with images
5. ✓ Modal shows centered text for posts without images
6. ✓ Image maintains aspect ratio and scrolls if tall
7. ✓ Text scrolls independently if long
8. ✓ Modal closes via X button
9. ✓ Modal closes via ESC key
10. ✓ Modal closes via background click
11. ✓ Modal does NOT close when clicking on content
12. ✓ Responsive: stacks vertically on mobile (<768px)
13. ✓ Dark mode styling looks correct

Expected: All scenarios work as designed

**Step 4: Update PROGRESS.md**

Add to Phase 7 section in `/Users/ccnas/DEVELOPMENT/workbench/PROGRESS.md`:

```markdown
### Phase 7h: Home Expand Modal
- [x] Create ImageModal component with conditional layout
- [x] Add expand button to post cards (visible on hover)
- [x] Implement three close methods (X button, ESC, background click)
- [x] Add responsive behavior (vertical stack on mobile)
- [x] Test all interactions and edge cases
```

**Step 5: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md with home expand modal completion

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Implementation Complete

All tasks completed. The home section now has:
- Expand button on each post (visible on hover)
- Modal with HD image and text display
- Side-by-side layout (70/30) for posts with images
- Centered text-only layout for posts without images
- Three close methods: X button, ESC key, background click
- Responsive design: vertical stack on mobile
- Smooth scrolling in all scrollable areas
