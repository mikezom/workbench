# Crawl Section Documentation

## Overview

The Crawl section provides aggregated content from various technical sources including arXiv, Jin10, SOLIDOT, nLab, Planet Haskell, and Reddit. It features a responsive design with portrait mode support.

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
