# Home Section Expand Modal - Design Document

**Date**: 2026-03-06
**Feature**: Add expand button to home posts with modal view for HD images and text

## Overview

Add an expand button to each post card in the home section. When clicked, open a modal displaying the HD version of the image (if present) and the post text in a side-by-side layout. The modal can be closed via background click, X button, or ESC key.

## User Requirements

- Expand button appears at upper right of each post card (on hover only)
- Modal opens centered on screen (80vw x 80vh)
- Layout adapts based on content:
  - With image: side-by-side (image 70% left, text 30% right)
  - Without image: centered text only
- Image maintains aspect ratio, scrolls if taller than modal
- Text scrolls independently if it overflows
- Close methods: X button, ESC key, background click
- No visual divider between image and text areas

## Component Structure

### New Component: `ImageModal.tsx`

**Props:**
- `isOpen: boolean` - Controls modal visibility
- `post: HomePost | null` - The post to display
- `onClose: () => void` - Callback to close modal

**Behavior:**
- Renders nothing when `isOpen` is false
- When open, renders fixed overlay with modal content
- Handles ESC key listener via useEffect

### Changes to `page.tsx`

**State additions:**
- `expandedPost: HomePost | null` - Tracks which post is expanded
- Modal is open when `expandedPost !== null`

**UI additions:**
- Expand button on each post card (absolute positioned, top-right)
- Button only visible on card hover (opacity transition)
- Button click sets `expandedPost` to the clicked post
- ImageModal component receives `expandedPost` and close handler

**Component hierarchy:**
```
Home (page.tsx)
├── Post cards (with expand button on hover)
└── ImageModal
    ├── Backdrop (click to close)
    └── Modal content
        ├── Close button (X)
        ├── Image area (70%, scrollable) [conditional]
        └── Text area (30%, scrollable)
```

## Layout & Styling

### Backdrop
- Fixed position covering viewport (`inset-0`)
- Semi-transparent black (`bg-black bg-opacity-50`)
- High z-index (`z-50`)
- Flexbox centered for modal positioning

### Modal Container
- 80vw width, 80vh height
- Theme-aware background (`bg-white dark:bg-neutral-800`)
- Rounded corners with shadow
- Relative positioning for close button
- Overflow hidden on container

### Layout with Image
- Flexbox row layout
- Left (image): 70% width, overflow-y auto
- Right (text): 30% width, overflow-y auto
- Gap between areas (1rem)
- Padding inside each area

### Layout without Image
- Single centered text area
- Max-width constraint (600px)
- Centered with flexbox
- Overflow-y auto for long text

### Close Button
- Absolute positioned top-right of modal
- X icon or "×" character
- Hover state for feedback
- z-index above content

### Expand Button (on post cards)
- Absolute positioned top-right corner
- Hidden by default (`opacity-0`)
- Appears on card hover (`group-hover:opacity-100`)
- Smooth transition for fade-in
- Small icon button (expand/maximize icon)
- Semi-transparent background for visibility
- Hover state on button itself

## Interaction Handlers

### Opening Modal
- Click expand button → `setExpandedPost(post)`
- Modal renders when `expandedPost !== null`

### Closing Modal (three methods)

1. **Background click**:
   - onClick on backdrop div
   - Check `e.target === e.currentTarget` to ensure click on backdrop, not bubbled from content

2. **X button**:
   - onClick calls `onClose()`

3. **ESC key**:
   - useEffect hook with keydown listener
   - Check `e.key === 'Escape'`
   - Cleanup listener on unmount

**Event handler pattern:**
```typescript
useEffect(() => {
  if (!isOpen) return;

  const handleEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  window.addEventListener('keydown', handleEsc);
  return () => window.removeEventListener('keydown', handleEsc);
}, [isOpen, onClose]);
```

## Responsive Behavior

### Mobile/Tablet (< 768px)
- Switch from side-by-side to vertical stacking
- Image on top (full width), text below
- Both areas independently scrollable
- Modal size: 95vw x 90vh for better fit

## Edge Cases

- **Empty text**: Display text area with minimal/empty content
- **Very small images**: Maintain aspect ratio, center within 70% area
- **Very wide images**: Constrain width to 70%, scale height proportionally
- **Posts without images**: Show centered text only, no empty image area
- **Long text with line breaks**: Use `whitespace-pre-wrap` to preserve formatting
- **Scroll position**: Reset when opening different post
- **Image caching**: Use same URL from post card (already cached)

## Implementation Notes

- Post card wrapper needs `group` class for hover detection
- Expand button uses `group-hover:opacity-100` to show on hover
- Custom scrollbar styling to match project conventions
- Smooth scrolling enabled on scrollable areas
- No lazy loading needed (images already visible on page)
