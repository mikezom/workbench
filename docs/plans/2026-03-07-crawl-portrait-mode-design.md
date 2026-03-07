# Crawl Section Portrait Mode Design

**Date:** 2026-03-07
**Status:** Approved
**Approach:** CSS-Only Visibility Toggle

## Overview

Adjust the crawl section's information display for portrait mode by removing the headline and implementing a sub-navigation system that allows users to switch between functional panels (arXiv, Jin10, SOLIDOT). The sub-navigation bar sits fixed above the main navigation bar with a glass effect, and panel state persists when switching.

## Requirements

1. Remove the "Crawl" headline in portrait mode
2. Display only functional panels (arXiv, Jin10, SOLIDOT) in portrait mode
3. Implement horizontal tab-based sub-navigation with text labels
4. Panel state persists when switching between tabs
5. Remember last viewed panel using localStorage (default to arXiv)
6. Sub-navigation fixed right above the main navigation bar
7. Active tab distinguished by background color change
8. No animation when switching panels
9. Sub-navigation has same glass effect as main nav

## Architecture

### Component Structure

```
CrawlPage (portrait mode)
├── Sub-Navigation Bar (fixed, glass effect)
│   ├── arXiv Tab
│   ├── Jin10 Tab
│   └── SOLIDOT Tab
├── ArxivPanel (visible when active)
├── Jin10Panel (visible when active)
└── SolidotPanel (visible when active)
```

### State Flow

- Single `activePanel` state: `'arxiv' | 'jin10' | 'solidot'`
- On mount: read from localStorage, default to 'arxiv'
- On tab click: update state and localStorage
- Panels use conditional CSS classes for visibility

### Approach: CSS-Only Visibility Toggle

Keep all three functional panels mounted in the DOM at all times, use CSS classes to show/hide based on active tab. State naturally persists because components never unmount.

**Benefits:**
- Simplest implementation
- State persistence is automatic
- Best performance (no re-mounting overhead)
- Smooth instant switching

## Components & Layout

### Sub-Navigation Bar

- **Position:** Fixed at bottom, just above main nav
- **Styling:** Glass effect matching main nav (backdrop-blur, semi-transparent background)
- **Layout:** Horizontal flex with three evenly distributed tabs
- **Tab Labels:** "arXiv", "Jin10", "SOLIDOT"
- **Active State:** Background color change (similar to main nav)
- **Height:** ~48-52px (comfortable tap target)

### Panel Visibility

- All three panels rendered in the DOM
- Active panel: visible (`display: block` or `display: flex`)
- Inactive panels: hidden (`display: none`)
- Panels maintain internal state (search queries, loaded data, scroll position)

### Responsive Behavior

- **Desktop/Landscape:** 3-column grid layout, no sub-navigation, show headline
- **Portrait Mode:** Hide headline, show sub-navigation, single panel view
- **Detection:** CSS media query `@media (orientation: portrait)`

### Spacing

- Main content area: bottom padding for both nav bars (~112px)
- Sub-nav height: ~48px
- Gap between sub-nav and main nav: minimal or none (stacked)

## State Management

### State Variables

```typescript
const [activePanel, setActivePanel] = useState<'arxiv' | 'jin10' | 'solidot'>('arxiv');
```

### localStorage Integration

- **Key:** `'crawl-active-panel'`
- **On mount:** Read from localStorage, set initial state
- **On tab click:** Update state and write to localStorage
- **Fallback:** Default to `'arxiv'` if no stored value

### Panel State Preservation

Each panel manages its own state independently:
- **ArxivPanel:** `papers`, `loading`, `query`
- **Jin10Panel:** `news`, `loading`
- **SolidotPanel:** `news`, `loading`

No state lifting required - panels remain mounted and preserve state automatically.

### Event Flow

1. User clicks tab → `setActivePanel('jin10')` + `localStorage.setItem()`
2. State updates → React re-renders
3. CSS classes update → Active panel visible, others hidden
4. Panel state unchanged (still mounted)

### Data Fetching

- Panels fetch data on their own mount (existing behavior)
- Switching tabs doesn't trigger refetch
- Users can manually refresh using existing refresh buttons

## Styling & Visual Design

### Sub-Navigation Bar

```css
Position: fixed, bottom: [main-nav-height], left: 0, right: 0
Background (light): rgba(255, 255, 255, 0.7) with backdrop-blur
Background (dark): rgba(0, 0, 0, 0.5) with backdrop-blur
Border-top: 1px solid semi-transparent
Height: ~48px
z-index: 40 (below main nav's z-50)
```

### Tab Styling

```css
Flex: 1 (equal width)
Text: uppercase, small font, centered
Padding: py-3 (comfortable tap target)
Active: bg-neutral-200 dark:bg-neutral-800
Inactive: transparent, text-neutral-600 dark:text-neutral-400
Hover: subtle background on inactive tabs
Transition: smooth background color change
```

### Panel Container

```css
Portrait mode:
- Single column layout (remove grid-cols-3)
- Bottom padding: ~112px (48px sub-nav + 64px main nav)
- Full height with proper overflow
```

### Headline

```css
Portrait mode: hidden (portrait:hidden class)
Desktop/landscape: visible (current behavior)
```

## Implementation

### Code Changes

**1. CrawlPage component (`src/app/crawl/page.tsx`):**
- Add `activePanel` state with localStorage integration
- Add sub-navigation component (inline or extracted)
- Wrap headline in portrait-hidden class
- Update grid layout to be responsive (3-col desktop, 1-col portrait)
- Add conditional visibility classes to panels
- Adjust container padding for fixed nav bars

**2. Panel Modifications:**
- No changes to ArxivPanel, Jin10Panel, SolidotPanel
- Add wrapper divs with visibility classes

**3. Styling:**
- Add glass effect styles for sub-nav (reuse Nav component pattern)
- Add media queries for portrait mode
- Add bottom padding adjustments

### Edge Cases

- **First visit:** Default to arXiv panel
- **Invalid localStorage:** Fallback to arXiv
- **Orientation change:** Layout adapts, state preserved
- **Stub panels:** Not rendered in portrait mode (nLab, Planet Haskell, Reddit)

### Testing

- Verify localStorage persistence across page reloads
- Test panel state preservation when switching tabs
- Verify responsive behavior at different orientations
- Check glass effect rendering on different backgrounds
- Ensure tap targets are accessible (48px minimum)

## Files Modified

- `workbench/src/app/crawl/page.tsx` - Main implementation
- `workbench/src/app/crawl/page.test.tsx` - Update tests if needed

## Success Criteria

- Portrait mode shows sub-navigation with three tabs
- Only one panel visible at a time in portrait mode
- Panel state persists when switching tabs
- Last viewed panel remembered across sessions
- Glass effect matches main navigation styling
- Smooth, instant tab switching with no animation
- Desktop/landscape mode unchanged
