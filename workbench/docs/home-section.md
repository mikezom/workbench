# Home Section

## Overview

The home section is a personal dashboard with a masonry-grid layout for posts. Each post can contain text content and an optional image.

## Architecture

### Data Storage

**Database**: SQLite (`data/workbench.db`)

**Table**: `home_posts`
```sql
CREATE TABLE home_posts (
  id          TEXT PRIMARY KEY,
  content     TEXT NOT NULL,
  image_url   TEXT,
  created_at  TEXT NOT NULL
);
```

**Images**: Stored in `data/images/` directory (gitignored)

### API Routes

- `GET /api/home` - List all posts (ordered by created_at DESC)
- `POST /api/home` - Create new post
- `GET /api/home/[id]` - Get single post
- `PUT /api/home/[id]` - Update post
- `DELETE /api/home/[id]` - Delete post
- `POST /api/home/upload` - Upload image (returns URL)
- `GET /api/home/images/[filename]` - Serve image from data/images

### Frontend

**Page**: `src/app/page.tsx`

**Layout**: Masonry grid (1 column mobile, 2 columns tablet, 3 columns desktop)

**Features**:
- Create/edit/delete posts
- Optional image upload
- Modal form for post creation/editing
- Responsive masonry layout

## Image Storage

Images are stored in `data/images/` instead of `public/uploads/` to prevent deletion during development builds.

**Upload flow**:
1. User selects image in post form
2. Image uploaded to `POST /api/home/upload`
3. File saved to `data/images/{timestamp}-{random}.{ext}`
4. API returns URL: `/api/home/images/{filename}`
5. URL stored in `home_posts.image_url`

**Serving flow**:
1. Frontend requests `/api/home/images/{filename}`
2. API route reads file from `data/images/`
3. Returns file with proper content-type header
4. Browser displays image

## Database Module

**File**: `src/lib/home-db.ts`

**Functions**:
- `initHomeSchema(db)` - Create table if not exists
- `createHomePost(data)` - Insert new post
- `getAllHomePosts()` - Get all posts
- `getHomePost(id)` - Get single post
- `updateHomePost(id, updates)` - Update post
- `deleteHomePost(id)` - Delete post

## Testing

**Test files**:
- `src/app/api/home/route.test.ts`
- `src/app/api/home/[id]/route.test.ts`
- `src/app/api/home/upload/route.test.ts`
- `src/app/api/home/images/[filename]/route.test.ts`

Run tests: `npm test`
