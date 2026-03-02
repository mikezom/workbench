# Study Section Features Design

## Features

1. **Card Groups** (hierarchical)
2. **Study Settings** (per-group daily limits)
3. **Anki Import** (.apkg file parsing with template rendering)

## 1. Card Groups

### Data Model

**New file: `data/groups.json`**

```json
{
  "groups": [
    {
      "id": "uuid",
      "name": "Group Name",
      "parent_id": null,
      "settings": {
        "dailyNewLimit": 20,
        "dailyReviewLimit": 100
      },
      "created_at": "ISO date"
    }
  ]
}
```

**Change to `data/cards.json`**: Add `group_id` field to each card (nullable for ungrouped cards).

### API Endpoints

- `GET /api/groups` - list all groups
- `POST /api/groups` - create group `{ name, parent_id? }`
- `PUT /api/groups/[id]` - update group name/settings
- `DELETE /api/groups/[id]` - delete group (and reassign cards to ungrouped)
- `GET /api/cards?group_id=X` - filter cards by group (include children)

### UI

**Review tab**:
- Group selector dropdown/tree at top
- Shows due cards from selected group (includes all descendant groups)
- Respects per-group daily limits

**Cards tab**:
- Group tree sidebar
- Click group to see its cards
- "Add Group" / "Edit Group" / "Delete Group" actions
- Cards list shows cards in selected group

### Hierarchy

Groups use `parent_id` to form trees. The `::` separator from Anki decks maps to parent-child relationships. Studying a parent group includes all descendant cards.

## 2. Study Settings

### Per-Group Settings

Each group has:
- `dailyNewLimit` (default: 20) - max new cards introduced per day
- `dailyReviewLimit` (default: 100) - max review cards per day

### Daily Tracking

**New file: `data/study_log.json`**

```json
{
  "2026-03-02": {
    "group-uuid": {
      "new": 5,
      "review": 23
    }
  }
}
```

### Review Logic

When starting a review session for a group:
1. Load study log for today + this group
2. Calculate remaining new/review budget
3. Filter due cards: separate new (state=0) from review (state>0)
4. Limit each pool to remaining budget
5. After each card review, update the study log

### Settings UI

Accessible from the group management area. Edit `dailyNewLimit` and `dailyReviewLimit` per group.

## 3. Anki Import

### Processing Pipeline

1. User uploads `.apkg` file via the UI
2. Server receives file at `POST /api/import/anki`
3. Extract ZIP (using `adm-zip`)
4. Read `collection.anki2` SQLite DB (using `better-sqlite3`)
5. Parse: models (templates + fields), decks, notes, cards
6. Map Anki decks to hierarchical groups
7. Render each card by substituting note fields into templates
8. Create cards in `cards.json` and groups in `groups.json`
9. For testing: limit to 10 notes per subdeck

### Anki Template Rendering

Handle these Anki template constructs:
- `{{fieldName}}` - simple field substitution
- `{{#fieldName}}...{{/fieldName}}` - conditional block (render if field non-empty)
- `{{FrontSide}}` - replaced with rendered front template
- `{{hint:fieldName}}` - render as field value
- `[sound:filename]` - strip (no audio support)
- HTML comments - strip

### Anki Deck to Group Mapping

Anki uses `::` for hierarchy:
- `考研词汇5500` -> root group
- `考研词汇5500::1 Recite` -> child group

Each deck becomes a group with appropriate `parent_id`.

### Dependencies

- `better-sqlite3` - read SQLite in Node.js
- `adm-zip` - extract .apkg ZIP files

### Import Limits (Testing)

For the sample file, import only 10 notes per subdeck to keep data manageable during development.

## File Changes Summary

### New Files
- `data/groups.json` - group definitions with settings
- `data/study_log.json` - daily study progress tracking
- `src/lib/groups.ts` - group data access layer
- `src/lib/study-log.ts` - study log data access
- `src/lib/anki-import.ts` - Anki file parsing and template rendering
- `src/app/api/groups/route.ts` - group CRUD endpoints
- `src/app/api/groups/[id]/route.ts` - single group endpoints
- `src/app/api/import/anki/route.ts` - Anki import endpoint

### Modified Files
- `src/lib/cards.ts` - add group_id support, filter by group
- `src/app/study/page.tsx` - group selector, settings UI, import UI
- `data/cards.json` - cards gain group_id field
