# Study Section (FSRS) - Design Document

## Overview

FSRS spaced repetition flashcard system at `/study`, using `ts-fsrs` for scheduling and JSON file storage.

## Layout

Single page with two tabs: **Review** (default) and **Cards**.

## Review Tab

- Shows count of due cards
- Displays one card at a time: front visible, click/button to reveal back
- After revealing: four rating buttons (Again / Hard / Good / Easy)
- Rating submits to API, FSRS calculates next review date, advances to next card
- When no cards due: "All caught up" message with next review time

## Cards Tab

- List of all cards showing truncated front text + Edit / Delete buttons
- "Add Card" button at top opens inline form
- Inline form: two textareas (Front / Back) + Save / Cancel
- Edit replaces card row with pre-filled inline form
- Delete with confirm prompt

## Content Format

Plain text only for v1. No markdown or HTML rendering.

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/cards` | List all cards |
| POST | `/api/cards` | Create card |
| PUT | `/api/cards/[id]` | Update card |
| DELETE | `/api/cards/[id]` | Delete card |
| POST | `/api/cards/[id]/review` | Submit rating, return updated FSRS schedule |

## Data Model

Stored in `data/cards.json` as an array:

```json
{
  "id": "uuid",
  "front": "plain text question",
  "back": "plain text answer",
  "source": null,
  "fsrs": {
    "due": "ISO date",
    "stability": 0,
    "difficulty": 0,
    "elapsed_days": 0,
    "scheduled_days": 0,
    "reps": 0,
    "lapses": 0,
    "state": 0,
    "last_review": "ISO date"
  },
  "created_at": "ISO date",
  "updated_at": "ISO date"
}
```

## Tech

- **ts-fsrs**: Server-side scheduling calculations
- **Storage**: JSON file read/write in `workbench/data/cards.json`
- **UUID**: `crypto.randomUUID()` for card IDs

## Deferred

- Import from Forest (Phase 3b)
- Markdown/HTML content rendering
