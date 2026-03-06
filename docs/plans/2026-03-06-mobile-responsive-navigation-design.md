# Mobile Responsive Navigation Design

**Date:** 2026-03-06
**Objective:** Adapt the workbench web page for mobile views by moving the sidebar to the bottom in portrait orientation.

## Requirements

- Trigger mobile layout when screen width < height (portrait orientation)
- Display navigation as a horizontal bottom bar with icons and labels
- Fixed at bottom (always visible)
- Hide theme toggle on mobile (rely on system preference)
- Hide "Workbench" branding text on mobile

## Architecture & Structure

The solution uses a **single Nav component** that adapts its rendering based on Tailwind's custom `portrait` breakpoint. The DOM structure in `layout.tsx` remains mostly the same, with CSS handling visual reordering.

**Key structural decisions:**
- Keep the flex container in `layout.tsx` but make it responsive
- On portrait: flex-col (vertical stack) with nav ordered last
- On landscape/desktop: flex-row (horizontal) with nav first (current behavior)
- Nav component has two visual modes controlled purely by Tailwind classes

**Why this approach:**
- Single source of truth (one Nav component)
- No hydration issues since it's CSS-only
- Maintains accessibility (DOM order doesn't affect screen readers negatively)
- Clean separation: layout.tsx handles positioning, nav.tsx handles appearance

## Tailwind Configuration

Add a custom `portrait` breakpoint to `tailwind.config.ts`:

```typescript
module.exports = {
  theme: {
    extend: {
      screens: {
        'portrait': { 'raw': '(orientation: portrait)' },
      },
    },
  },
}
```

**How it works:**
- The `raw` property allows any media query
- `portrait:` prefix works like `md:` or `lg:` in classes
- Example: `portrait:flex-col` applies flex-col only in portrait mode

**Usage pattern:**
- Default classes = landscape/desktop behavior
- `portrait:` prefix = mobile/portrait overrides
- Example: `flex-row portrait:flex-col` means row by default, column in portrait

## Nav Component Changes

The Nav component adapts its layout using the `portrait:` prefix while keeping the same structure.

**Icon additions:**
Add icons to each section:
- Home: 🏠
- Agent: 🤖
- Forest: 🌲
- Study: 📚
- Crawl: 🕷️
- Clipboard: 📋

(Can use React Icons library for more professional icons, or keep emojis for simplicity)

**Layout changes:**
- Desktop (default): Vertical sidebar, full height, left side
- Portrait: Horizontal bottom bar, fixed position, full width

**Key class changes:**
- Container: `flex flex-col portrait:flex-row` (vertical sidebar → horizontal bar)
- Width: `w-48 portrait:w-full` (fixed width → full width)
- Position: `portrait:fixed portrait:bottom-0 portrait:left-0 portrait:right-0`
- Height: `min-h-screen portrait:h-auto` (full height → auto height)
- Navigation items: `flex-col portrait:flex-row portrait:justify-around` (stack → spread horizontally)
- Theme toggle: `portrait:hidden` (hide on mobile)

**Visual structure on portrait:**
- Items spread evenly across the width
- Icon above label (flex-col for each item)
- Compact padding for mobile
- Bottom border instead of right border

## Layout Changes (layout.tsx)

Minimal changes to support portrait reordering:

**Current structure:**
```tsx
<div className="flex h-screen">
  <Nav />
  <main className="flex-1 overflow-auto">{children}</main>
</div>
```

**Updated structure:**
```tsx
<div className="flex h-screen portrait:flex-col">
  <Nav />
  <main className="flex-1 overflow-auto portrait:pb-16">{children}</main>
</div>
```

**Key changes:**
- Add `portrait:flex-col` to container (stacks nav below main)
- Add `portrait:pb-16` to main (padding-bottom to prevent content from being hidden behind fixed nav)
- Nav naturally appears at bottom due to flex-col ordering

**Why this works:**
- In landscape: `flex` (row) keeps nav on left, main on right
- In portrait: `flex-col` stacks them vertically, nav appears below
- Fixed positioning on nav in portrait makes it stick to bottom
- Padding on main ensures content isn't obscured

## Styling Details

**Mobile bottom nav appearance:**
- Background: Same as desktop sidebar (`bg-neutral-50 dark:bg-neutral-900`)
- Border: Top border instead of right (`border-t portrait:border-r-0`)
- Padding: Reduced vertical padding for compactness (`portrait:py-2`)
- Shadow: Optional subtle shadow for elevation (`portrait:shadow-lg`)

**Navigation items on portrait:**
- Layout: Icon stacked above label (`flex flex-col items-center`)
- Spacing: Minimal gap between icon and label (`gap-1`)
- Icon size: Larger for touch targets (`text-xl` or `text-2xl`)
- Label size: Smaller text (`text-xs`)
- Active state: Bottom border accent instead of background (`portrait:border-b-2 portrait:border-blue-500`)
- Touch target: Ensure minimum 44x44px for accessibility

**Responsive behavior:**
- Smooth transition between layouts (optional `transition-all duration-200`)
- Z-index to ensure nav stays above content (`portrait:z-50`)
- Safe area insets for devices with notches/home indicators (`portrait:pb-safe` if using Tailwind plugin)

**Accessibility considerations:**
- Maintain focus states for keyboard navigation
- Ensure color contrast meets WCAG standards
- Keep aria-labels on interactive elements
- Touch targets meet minimum size requirements

## Implementation Summary

1. Update `tailwind.config.ts` with custom portrait breakpoint
2. Modify `layout.tsx` to add portrait-responsive classes
3. Update `nav.tsx` component with icons and portrait-responsive layout
4. Test on various devices and orientations
5. Verify accessibility with keyboard navigation and screen readers
