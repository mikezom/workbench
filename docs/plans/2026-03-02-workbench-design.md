# Personal Workbench - Design Document

## Overview

A personal workbench website built with Next.js that integrates four sections:
Agent (TODO), Forest (forester docs), Study (FSRS flashcards), and Crawl (web reader).

## Architecture

- **Framework**: Next.js (App Router)
- **Storage**: JSON files in `data/` directory
- **Runtime**: Node.js 18
- **Styling**: Tailwind CSS

## Sections

### 1. Agent (TODO)

Placeholder section for future Claude Code agent integration. Will display a
"Coming Soon" page. Detailed requirements to be specified later.

### 2. Forest

Serve the pre-built forester static site from the extracted `forest/output/` directory.

- Extract `forest.zip` into the project
- Configure Next.js rewrites to serve `forest/output/` at `/forest`
- The forester site includes its own JS/CSS (forester.js, style.css, katex.min.css)
- Each topic has `index.html` and `index.xml` in subdirectories

### 3. Study (FSRS)

Spaced repetition flashcard system using the FSRS algorithm.

- **Cards**: Front (question) / Back (answer) format
- **FSRS**: Use `ts-fsrs` library for scheduling
- **Card creation**: Manual creation via form, or import from Forest pages
- **Review session**: Show due cards, rate recall (Again/Hard/Good/Easy), update schedule
- **Storage**: `data/cards.json` stores card data with FSRS parameters

Data model per card:
```json
{
  "id": "uuid",
  "front": "string (supports markdown/html)",
  "back": "string (supports markdown/html)",
  "source": "optional forester page reference",
  "fsrs": { "due", "stability", "difficulty", "elapsed_days", "scheduled_days", "reps", "lapses", "state", "last_review" },
  "created_at": "ISO date",
  "updated_at": "ISO date"
}
```

### 4. Crawl

On-demand web content fetcher with hardcoded sources.

- **Hardcoded sources** (editable in config):
  - Hacker News (front page)
  - ArXiv (recent CS papers)
  - Lobste.rs
  - nLab (math/category theory)
  - Planet Haskell
- **Fetch**: Backend API fetches URL, extracts readable content (using cheerio/readability)
- **Display**: Reader-friendly format with clean typography
- **Storage**: `data/crawls.json` caches fetched content

## Data Layout

```
data/
  cards.json       # FSRS flashcard data
  crawls.json      # Cached crawl results
```

## Navigation

Sidebar or top nav with 4 sections: Agent | Forest | Study | Crawl
