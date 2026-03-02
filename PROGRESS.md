# PROGRESS.md - Personal Workbench

## Project Overview

A personal workbench website (Next.js) with 4 sections: Agent, Forest, Study (FSRS), Crawl.

## Task Breakdown

### Phase 0: Project Setup
- [x] Initialize Next.js project with Tailwind CSS
- [x] Set up project structure (app router, components, data directory)
- [x] Initialize git repository
- [x] Extract forest.zip and integrate static files

### Phase 1: Layout & Navigation
- [x] Create main layout with sidebar/nav for 4 sections
- [x] Set up routing: `/agent`, `/forest`, `/study`, `/crawl`
- [x] Basic shared UI components (page container, nav links)

### Phase 2: Forest Section
- [x] Configure Next.js to serve `forest/output/` static files at `/forest`
- [x] Create forest landing page that loads the forester site
- [x] Verify forester JS/CSS/KaTeX rendering works

### Phase 3: Study Section (FSRS)
- [x] Install and integrate `ts-fsrs` library
- [x] Build JSON file storage layer for cards (`data/cards.json`)
- [x] Create card management UI (add/edit/delete cards)
- [x] Build review session UI (show due cards, rating buttons)
- [x] Implement FSRS scheduling on review
- [ ] Add "import from Forest" feature (deferred to Phase 3b)

### Phase 3a: Study Enhancements
- [x] Add hierarchical card groups with parent/child relationships
- [x] Add per-group study settings (daily new card limit, daily review limit)
- [x] Add Anki .apkg import with full template rendering
- [x] Add study log tracking for daily limit enforcement
- [x] Rewrite Study page UI with group selector, settings tab, and import

### Phase 3b: Study UI & Bug Fixes
- [x] Add cascading group delete (removes child groups and all associated cards)
- [x] Convert tab bar to sidebar layout for Review/Cards/Settings navigation
- [x] Center review cards in the main panel
- [x] Fix Anki import to create one group per .apkg (no subgroups per deck)

### Phase 4: Crawl Section
- [ ] Define hardcoded sources config (HN, ArXiv, Lobste.rs, nLab, Planet Haskell)
- [ ] Build backend API for fetching and parsing web content
- [ ] Create source list UI showing available sources
- [ ] Build reader-friendly content display
- [ ] Add crawl result caching in `data/crawls.json`

### Phase 5: Agent Section (TODO)
- [ ] Create placeholder "Coming Soon" page
- [ ] (Future: Claude Code CLI integration, task management, streaming output)

## Status

| Phase | Status | Notes |
|-------|--------|-------|
| 0 - Setup | Complete | Commit `da39b42` |
| 1 - Layout | Complete | Commit `450adeb` |
| 2 - Forest | Complete | Commit `450adeb` |
| 3 - Study | Complete | Commit `7eb1f33` |
| 3a - Study Enhancements | Complete | Groups, settings, Anki import |
| 3b - Study UI & Fixes | Complete | Sidebar layout, cascading delete, import fix |
| 4 - Crawl | Not started | |
| 5 - Agent | Not started | Placeholder only |
