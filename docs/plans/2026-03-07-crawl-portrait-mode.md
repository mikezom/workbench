# Crawl Portrait Mode Sub-Navigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add portrait mode sub-navigation to crawl section with tab-based panel switching and localStorage persistence.

**Architecture:** CSS-only visibility toggle approach. All three functional panels (arXiv, Jin10, SOLIDOT) stay mounted in the DOM. Active panel controlled by state, visibility toggled via CSS classes. Sub-navigation bar fixed above main nav with glass effect.

**Tech Stack:** React (Next.js), TypeScript, Tailwind CSS, localStorage

---

## Task 1: Add State Management and localStorage Integration

**Files:**
- Modify: `workbench/src/app/crawl/page.tsx:497-516`

**Step 1: Add activePanel state with localStorage integration**

Add this code after the imports and before the ArxivPanel component (around line 35):

```typescript
/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/*  ------------------------------------------------------------------ */

type PanelType = 'arxiv' | 'jin10' | 'solidot';

const STORAGE_KEY = 'crawl-active-panel';

function getInitialPanel(): PanelType {
  if (typeof window === 'undefined') return 'arxiv';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'arxiv' || stored === 'jin10' || stored === 'solidot') {
    return stored;
  }
  return 'arxiv';
}

function saveActivePanel(panel: PanelType) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, panel);
  }
}
```

**Step 2: Add state to CrawlPage component**

In the `CrawlPage` component (line 497), add state initialization:

```typescript
export default function CrawlPage() {
  const [activePanel, setActivePanel] = useState<PanelType>('arxiv');

  useEffect(() => {
    setActivePanel(getInitialPanel());
  }, []);

  const handlePanelChange = (panel: PanelType) => {
    setActivePanel(panel);
    saveActivePanel(panel);
  };

  return (
```

**Step 3: Verify code compiles**

Run: `cd workbench && npm run build`
Expected: Build succeeds with no TypeScript errors

**Step 4: Commit**

```bash
git add workbench/src/app/crawl/page.tsx
git commit -m "feat(crawl): add state management for portrait mode panel switching

Add activePanel state with localStorage persistence. Panels default to
arXiv on first visit and remember last viewed panel across sessions.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Add Sub-Navigation Component

**Files:**
- Modify: `workbench/src/app/crawl/page.tsx:497-516`

**Step 1: Add SubNavigation component**

Add this component before the main CrawlPage component (around line 492):

```typescript
/* ------------------------------------------------------------------ */
/*  SubNavigation                                                      */
/*  ------------------------------------------------------------------ */

interface SubNavigationProps {
  activePanel: PanelType;
  onPanelChange: (panel: PanelType) => void;
}

function SubNavigation({ activePanel, onPanelChange }: SubNavigationProps) {
  const tabs: { id: PanelType; label: string }[] = [
    { id: 'arxiv', label: 'arXiv' },
    { id: 'jin10', label: 'Jin10' },
    { id: 'solidot', label: 'SOLIDOT' },
  ];

  return (
    <>
      <style jsx global>{`
        @media (orientation: portrait) {
          .sub-nav-glass {
            backdrop-filter: blur(16px) saturate(180%);
            -webkit-backdrop-filter: blur(16px) saturate(180%);
            background: rgba(255, 255, 255, 0.7) !important;
            border-top: 1px solid rgba(255, 255, 255, 0.3) !important;
            box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.1);
          }
          .dark .sub-nav-glass {
            background: rgba(0, 0, 0, 0.5) !important;
            border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
          }
        }
      `}</style>
      <nav className="hidden portrait:flex sub-nav-glass fixed bottom-16 left-0 right-0 z-40 h-12 border-t border-neutral-200 dark:border-neutral-800">
        <div className="flex w-full">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onPanelChange(tab.id)}
              className={`flex-1 text-xs font-medium uppercase tracking-wide transition-colors py-3 ${
                activePanel === tab.id
                  ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
```

**Step 2: Add SubNavigation to CrawlPage render**

Update the CrawlPage return statement to include SubNavigation (after the opening div, before the header):

```typescript
return (
  <div className="flex flex-col h-full p-4 overflow-hidden bg-white dark:bg-neutral-900 portrait:pb-28">
    <SubNavigation activePanel={activePanel} onPanelChange={handlePanelChange} />

    {/* Header */}
    <div className="flex items-center justify-between mb-3 portrait:hidden">
      <h1 className="text-lg font-bold">Crawl</h1>
    </div>
```

**Step 3: Verify code compiles**

Run: `cd workbench && npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add workbench/src/app/crawl/page.tsx
git commit -m "feat(crawl): add sub-navigation component for portrait mode

Add fixed sub-navigation bar with glass effect above main nav. Shows
three tabs (arXiv, Jin10, SOLIDOT) with active state styling. Hidden
in landscape/desktop mode.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Update Panel Layout and Visibility

**Files:**
- Modify: `workbench/src/app/crawl/page.tsx:506-514`

**Step 1: Update grid layout for responsive behavior**

Update the Panel Grid section in CrawlPage (around line 506):

```typescript
{/* Panel Grid */}
<div className="grid grid-cols-3 gap-3 flex-1 min-h-0 portrait:grid-cols-1 portrait:gap-0">
  <div className={activePanel === 'arxiv' ? 'portrait:block' : 'portrait:hidden'}>
    <ArxivPanel />
  </div>
  <div className={activePanel === 'jin10' ? 'portrait:block' : 'portrait:hidden'}>
    <Jin10Panel />
  </div>
  <div className={activePanel === 'solidot' ? 'portrait:block' : 'portrait:hidden'}>
    <SolidotPanel />
  </div>
  <div className="portrait:hidden">
    <NLabPanel />
  </div>
  <div className="portrait:hidden">
    <PlanetHaskellPanel />
  </div>
  <div className="portrait:hidden">
    <RedditPanel />
  </div>
</div>
```

**Step 2: Verify code compiles**

Run: `cd workbench && npm run build`
Expected: Build succeeds

**Step 3: Test in browser**

Run: `cd workbench && npm run dev`
Open: `http://localhost:3000/crawl`
Test:
1. Desktop view shows all 6 panels in 3-column grid
2. Resize to portrait orientation (or use dev tools device mode)
3. Portrait view shows sub-navigation at bottom
4. Only one panel visible at a time
5. Clicking tabs switches panels
6. Headline hidden in portrait mode

**Step 4: Commit**

```bash
git add workbench/src/app/crawl/page.tsx
git commit -m "feat(crawl): implement responsive panel visibility

Update grid layout to be responsive. In portrait mode, show only
active panel and hide stub panels. Desktop mode unchanged with
3-column grid showing all panels.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Update Tests

**Files:**
- Modify: `workbench/src/app/crawl/page.test.tsx:1-35`

**Step 1: Update test to account for portrait mode changes**

Replace the second test with updated logic:

```typescript
it("should render all 6 panels in the grid", () => {
  // Verify the grid contains 6 panel components (3 functional + 3 stubs)
  const gridSection = pageContent.match(/<div className="grid[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*\);/);
  expect(gridSection).toBeTruthy();

  // Count panel component usages - should still have 6 panels
  // (3 functional panels wrapped in divs + 3 stub panels wrapped in divs)
  const panelUsages = gridSection![1].match(/<\w+Panel\s*\/>/g);
  expect(panelUsages).toBeTruthy();
  expect(panelUsages!.length).toBe(6);
});
```

**Step 2: Add new test for portrait mode features**

Add new tests at the end of the describe block:

```typescript
it("should have SubNavigation component for portrait mode", () => {
  expect(pageContent).toContain("function SubNavigation");
  expect(pageContent).toContain("sub-nav-glass");
});

it("should have activePanel state management", () => {
  expect(pageContent).toContain("activePanel");
  expect(pageContent).toContain("setActivePanel");
  expect(pageContent).toContain("crawl-active-panel");
});

it("should have portrait mode visibility classes", () => {
  expect(pageContent).toContain("portrait:block");
  expect(pageContent).toContain("portrait:hidden");
});
```

**Step 3: Run tests**

Run: `cd workbench && npm test -- src/app/crawl/page.test.tsx`
Expected: All tests pass

**Step 4: Commit**

```bash
git add workbench/src/app/crawl/page.test.tsx
git commit -m "test(crawl): update tests for portrait mode features

Add tests for SubNavigation component, activePanel state management,
and portrait mode visibility classes. Update existing grid test to
account for wrapper divs.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Manual Testing and Verification

**Files:**
- None (manual testing only)

**Step 1: Test localStorage persistence**

1. Run: `cd workbench && npm run dev`
2. Open: `http://localhost:3000/crawl` in portrait mode
3. Switch to Jin10 tab
4. Reload page
5. Expected: Jin10 tab still active

**Step 2: Test panel state preservation**

1. In arXiv panel, search for "machine learning"
2. Wait for results to load
3. Switch to Jin10 tab
4. Switch back to arXiv tab
5. Expected: Search results still visible, query still "machine learning"

**Step 3: Test responsive behavior**

1. Start in desktop/landscape mode
2. Verify: 3-column grid, all 6 panels visible, no sub-nav, headline visible
3. Switch to portrait mode (rotate device or use dev tools)
4. Verify: Single column, only active panel visible, sub-nav visible, headline hidden
5. Switch back to landscape
6. Verify: Returns to 3-column grid layout

**Step 4: Test glass effect**

1. In portrait mode, scroll content behind sub-nav
2. Verify: Glass blur effect visible on sub-nav
3. Toggle dark mode
4. Verify: Glass effect adapts to dark theme

**Step 5: Test tap targets**

1. In portrait mode, tap each tab
2. Verify: Easy to tap, no mis-taps
3. Verify: Active state changes immediately
4. Verify: Panel switches instantly with no animation

**Step 6: Document completion**

Create a checklist of verified items:
- ✓ localStorage persistence works
- ✓ Panel state preserved when switching
- ✓ Responsive layout works correctly
- ✓ Glass effect renders properly
- ✓ Tap targets are accessible
- ✓ No animations on panel switch
- ✓ Headline hidden in portrait mode
- ✓ Stub panels hidden in portrait mode

---

## Task 6: Update Documentation

**Files:**
- Modify: `workbench/docs/crawl-section.md:48-72`

**Step 1: Update UI Layout section**

Replace the UI Layout section with updated information:

```markdown
## UI Layout (`crawl/page.tsx`)

Single client component file containing all sub-components:

### Desktop/Landscape Mode

```
+----------------------------------------------+
| Crawl (header, h1)                           |
+----------------------------------------------+
| [ArxivPanel] [Jin10Panel] [SolidotPanel]     |
| [NLabPanel]  [PlanetH.]  [RedditPanel]       |
+----------------------------------------------+
```

- **Layout**: 3-column grid (`grid-cols-3`) with `gap-3`
- **All panels visible**: 6 panels in 2 rows

### Portrait Mode

```
+----------------------------------------------+
| [Active Panel Content]                       |
|                                              |
|                                              |
+----------------------------------------------+
| [arXiv] [Jin10] [SOLIDOT] ← Sub-navigation  |
+----------------------------------------------+
| [Home] [Agent] [Monitor] ... ← Main nav     |
+----------------------------------------------+
```

- **Layout**: Single column (`grid-cols-1`)
- **Sub-navigation**: Fixed above main nav with glass effect
- **Panel switching**: Tabs control which panel is visible
- **State persistence**: Active panel remembered via localStorage
- **Headline**: Hidden in portrait mode
- **Stub panels**: Hidden (nLab, Planet Haskell, Reddit)
```

**Step 2: Add Portrait Mode section**

Add new section after UI Layout:

```markdown
## Portrait Mode Features

### Sub-Navigation

- **Position**: Fixed at bottom, above main navigation bar
- **Styling**: Glass effect (backdrop-blur, semi-transparent)
- **Tabs**: arXiv, Jin10, SOLIDOT (functional panels only)
- **Active state**: Background color change
- **Height**: 48px (comfortable tap target)

### Panel Visibility

- All three functional panels stay mounted in DOM
- Only active panel visible (CSS `display` toggle)
- Panel state preserved when switching (search queries, loaded data, scroll position)
- No animation on panel switch (instant)

### State Management

- **localStorage key**: `crawl-active-panel`
- **Default**: arXiv panel on first visit
- **Persistence**: Last viewed panel remembered across sessions
- **Fallback**: Invalid values default to arXiv

### Responsive Behavior

- **Detection**: CSS media query `@media (orientation: portrait)`
- **Desktop/Landscape**: 3-column grid, all panels visible, no sub-nav
- **Portrait**: Single panel view with sub-navigation
```

**Step 3: Commit**

```bash
git add workbench/docs/crawl-section.md
git commit -m "docs(crawl): document portrait mode sub-navigation

Update crawl-section.md with portrait mode features including
sub-navigation, panel visibility, state management, and responsive
behavior documentation.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Success Criteria

All of the following must be true:

- ✓ Portrait mode shows sub-navigation with three tabs (arXiv, Jin10, SOLIDOT)
- ✓ Only one panel visible at a time in portrait mode
- ✓ Panel state persists when switching tabs (search queries, loaded data)
- ✓ Last viewed panel remembered across page reloads (localStorage)
- ✓ Glass effect matches main navigation styling
- ✓ Smooth, instant tab switching with no animation
- ✓ Desktop/landscape mode unchanged (3-column grid, all panels visible)
- ✓ Headline hidden in portrait mode, visible in desktop mode
- ✓ Stub panels (nLab, Planet Haskell, Reddit) hidden in portrait mode
- ✓ All tests pass
- ✓ Documentation updated

## Notes

- The implementation uses CSS-only visibility toggle for simplicity and performance
- All panels remain mounted to preserve state automatically
- The glass effect styling is reused from the main Nav component pattern
- Portrait mode detection uses CSS media queries for reliability
- localStorage provides cross-session persistence without backend changes
