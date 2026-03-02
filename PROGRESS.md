# PROGRESS.md - Personal Workbench

## Project Overview

A personal workbench website (Next.js) with 4 sections: Agent, Forest, Study (FSRS), Crawl.

## Task Breakdown

### Phase 0: Project Setup
- [ ] Initialize Next.js project with Tailwind CSS
- [ ] Set up project structure (app router, components, data directory)
- [ ] Initialize git repository
- [ ] Extract forest.zip and integrate static files

### Phase 1: Layout & Navigation
- [ ] Create main layout with sidebar/nav for 4 sections
- [ ] Set up routing: `/agent`, `/forest`, `/study`, `/crawl`
- [ ] Basic shared UI components (page container, nav links)

### Phase 2: Forest Section
- [ ] Configure Next.js to serve `forest/output/` static files at `/forest`
- [ ] Create forest landing page that loads the forester site
- [ ] Verify forester JS/CSS/KaTeX rendering works

### Phase 3: Study Section (FSRS)
- [ ] Install and integrate `ts-fsrs` library
- [ ] Build JSON file storage layer for cards (`data/cards.json`)
- [ ] Create card management UI (add/edit/delete cards)
- [ ] Build review session UI (show due cards, rating buttons)
- [ ] Implement FSRS scheduling on review
- [ ] Add "import from Forest" feature (create card from forester page content)

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
| 0 - Setup | Not started | |
| 1 - Layout | Not started | |
| 2 - Forest | Not started | |
| 3 - Study | Not started | |
| 4 - Crawl | Not started | |
| 5 - Agent | Not started | Placeholder only |
