# Mobile Responsive Navigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Adapt workbench navigation to display as a fixed bottom bar with icons on portrait-oriented devices.

**Architecture:** CSS-only responsive approach using Tailwind's custom portrait breakpoint. Single Nav component adapts layout via responsive classes. No JavaScript needed for layout switching.

**Tech Stack:** Next.js 14, React 18, Tailwind CSS 3.4, TypeScript 5

---

## Task 1: Add Custom Portrait Breakpoint to Tailwind

**Files:**
- Modify: `workbench/tailwind.config.ts:1-21`

**Step 1: Add portrait breakpoint to Tailwind config**

Update the config to include a custom screen breakpoint for portrait orientation:

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      screens: {
        'portrait': { 'raw': '(orientation: portrait)' },
      },
    },
  },
  plugins: [],
};
export default config;
```

**Step 2: Verify Tailwind config syntax**

Run: `cd workbench && npm run build`
Expected: Build succeeds without errors

**Step 3: Commit**

```bash
cd /Users/ccnas/DEVELOPMENT/workbench
git add workbench/tailwind.config.ts
git commit -m "feat: add portrait orientation breakpoint to Tailwind

Add custom portrait breakpoint for responsive navigation.
Uses orientation media query to detect portrait mode.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Update Root Layout for Portrait Mode

**Files:**
- Modify: `workbench/src/app/layout.tsx:46-49`

**Step 1: Add portrait-responsive classes to layout**

Update the flex container and main element:

```tsx
<div className="flex h-screen portrait:flex-col">
  <Nav />
  <main className="flex-1 overflow-auto bg-white dark:bg-neutral-900 portrait:pb-16">{children}</main>
</div>
```

**Step 2: Verify the app still runs**

Run: `cd workbench && npm run dev`
Expected: Dev server starts without errors
Action: Open http://localhost:5090 and verify page loads

**Step 3: Commit**

```bash
cd /Users/ccnas/DEVELOPMENT/workbench
git add workbench/src/app/layout.tsx
git commit -m "feat: add portrait layout support to root layout

Add flex-col on portrait to stack nav below content.
Add bottom padding to main to prevent content overlap.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Add Icons to Navigation Sections

**Files:**
- Modify: `workbench/src/components/nav.tsx:8-15`

**Step 1: Add icon property to sections array**

Update the sections array to include emoji icons:

```tsx
const sections = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/agent", label: "Agent", icon: "🤖" },
  { href: "/forest", label: "Forest", icon: "🌲" },
  { href: "/study", label: "Study", icon: "📚" },
  { href: "/crawl", label: "Crawl", icon: "🕷️" },
  { href: "/clipboard", label: "Clipboard", icon: "📋" },
];
```

**Step 2: Verify TypeScript compiles**

Run: `cd workbench && npm run build`
Expected: Build succeeds without type errors

**Step 3: Commit**

```bash
cd /Users/ccnas/DEVELOPMENT/workbench
git add workbench/src/components/nav.tsx
git commit -m "feat: add icons to navigation sections

Add emoji icons for each navigation item.
Preparation for mobile bottom nav bar.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Update Nav Container for Portrait Mode

**Files:**
- Modify: `workbench/src/components/nav.tsx:32-35`

**Step 1: Update nav container classes**

Replace the nav element's className with portrait-responsive classes:

```tsx
<nav className="w-48 shrink-0 border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 min-h-screen p-4 flex flex-col portrait:w-full portrait:h-auto portrait:min-h-0 portrait:fixed portrait:bottom-0 portrait:left-0 portrait:right-0 portrait:flex-row portrait:border-r-0 portrait:border-t portrait:py-2 portrait:px-0 portrait:z-50">
```

**Step 2: Verify the nav renders**

Run: `cd workbench && npm run dev`
Expected: Dev server starts, nav still visible on desktop
Action: Open http://localhost:5090 and verify nav appears

**Step 3: Commit**

```bash
cd /Users/ccnas/DEVELOPMENT/workbench
git add workbench/src/components/nav.tsx
git commit -m "feat: add portrait-responsive classes to nav container

Transform sidebar to fixed bottom bar on portrait.
Maintain desktop sidebar behavior on landscape.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Hide Branding Text on Portrait

**Files:**
- Modify: `workbench/src/components/nav.tsx:33-35`

**Step 1: Add portrait:hidden to branding div**

Update the "Workbench" branding div:

```tsx
<div className="text-sm font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-3 px-2 portrait:hidden">
  Workbench
</div>
```

**Step 2: Verify branding still shows on desktop**

Run: `cd workbench && npm run dev`
Expected: "Workbench" text visible on desktop
Action: Resize browser to portrait to verify it hides

**Step 3: Commit**

```bash
cd /Users/ccnas/DEVELOPMENT/workbench
git add workbench/src/components/nav.tsx
git commit -m "feat: hide branding text on portrait mode

Remove Workbench header on mobile to save space.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Update Navigation Items Container

**Files:**
- Modify: `workbench/src/components/nav.tsx:36`

**Step 1: Add portrait-responsive classes to items container**

Update the navigation items container div:

```tsx
<div className="flex flex-col gap-1 flex-1 portrait:flex-row portrait:justify-around portrait:gap-0 portrait:flex-none">
```

**Step 2: Verify items still render**

Run: `cd workbench && npm run dev`
Expected: Nav items visible and functional

**Step 3: Commit**

```bash
cd /Users/ccnas/DEVELOPMENT/workbench
git add workbench/src/components/nav.tsx
git commit -m "feat: make nav items container portrait-responsive

Switch to horizontal layout with even spacing on portrait.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Update Navigation Link Rendering with Icons

**Files:**
- Modify: `workbench/src/components/nav.tsx:37-53`

**Step 1: Update link rendering to include icons**

Replace the sections.map block with icon support:

```tsx
{sections.map(({ href, label, icon }) => {
  const active =
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      key={href}
      href={href}
      className={`block px-2 py-1.5 rounded text-sm transition-colors portrait:flex portrait:flex-col portrait:items-center portrait:gap-1 portrait:py-2 portrait:px-1 portrait:rounded-none ${
        active
          ? "bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-medium portrait:bg-transparent portrait:border-b-2 portrait:border-blue-500"
          : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 portrait:hover:bg-neutral-100/50"
      }`}
    >
      <span className="portrait:text-xl">{icon}</span>
      <span className="portrait:text-xs">{label}</span>
    </Link>
  );
})}
```

**Step 2: Verify links render with icons**

Run: `cd workbench && npm run dev`
Expected: Icons appear next to labels on desktop
Action: Check that links are still clickable

**Step 3: Commit**

```bash
cd /Users/ccnas/DEVELOPMENT/workbench
git add workbench/src/components/nav.tsx
git commit -m "feat: add icons to navigation links with portrait styling

Display icons with labels on desktop.
Stack icons above labels on portrait with larger icons.
Use bottom border for active state on portrait.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Hide Theme Toggle on Portrait

**Files:**
- Modify: `workbench/src/components/nav.tsx:55-62`

**Step 1: Add portrait:hidden to theme toggle button**

Update the theme toggle button:

```tsx
<button
  onClick={handleToggleTheme}
  className="mt-4 px-2 py-1.5 rounded text-sm transition-colors text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 text-left portrait:hidden"
  aria-label="Toggle theme"
>
  {theme === "light" ? "🌙 Dark" : "☀️ Light"}
</button>
```

**Step 2: Verify theme toggle works on desktop**

Run: `cd workbench && npm run dev`
Expected: Theme toggle visible and functional on desktop
Action: Click toggle to verify it switches themes

**Step 3: Commit**

```bash
cd /Users/ccnas/DEVELOPMENT/workbench
git add workbench/src/components/nav.tsx
git commit -m "feat: hide theme toggle on portrait mode

Remove theme toggle on mobile, rely on system preference.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Manual Testing on Multiple Orientations

**Files:**
- None (testing only)

**Step 1: Test desktop/landscape view**

Run: `cd workbench && npm run dev`
Action: Open http://localhost:5090 in browser
Expected:
- Sidebar visible on left
- Navigation items vertical with icons
- Theme toggle visible
- "Workbench" branding visible

**Step 2: Test portrait view**

Action: Resize browser window to portrait (width < height) or use DevTools device emulation
Expected:
- Nav bar fixed at bottom
- Navigation items horizontal, evenly spaced
- Icons above labels
- Active item has blue bottom border
- Theme toggle hidden
- "Workbench" branding hidden
- Main content has bottom padding (not obscured by nav)

**Step 3: Test navigation functionality**

Action: Click each navigation item in both orientations
Expected: Navigation works, active states update correctly

**Step 4: Test theme switching**

Action: Toggle theme on desktop, verify dark mode works
Expected: Theme persists, colors update correctly

**Step 5: Document any issues**

If issues found, create follow-up tasks to address them.

---

## Task 10: Build and Verify Production

**Files:**
- None (verification only)

**Step 1: Run production build**

Run: `cd workbench && npm run build`
Expected: Build completes without errors or warnings

**Step 2: Start production server**

Run: `cd workbench && npm start`
Expected: Server starts successfully

**Step 3: Test production build**

Action: Open http://localhost:3000 and test both orientations
Expected: Same behavior as dev mode

**Step 4: Final commit if needed**

If any fixes were needed, commit them:

```bash
cd /Users/ccnas/DEVELOPMENT/workbench
git add .
git commit -m "fix: address production build issues

[Describe any fixes made]

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Success Criteria

- ✅ Portrait orientation triggers mobile layout (width < height)
- ✅ Navigation displays as fixed bottom bar on portrait
- ✅ Icons appear above labels on mobile
- ✅ Active state uses bottom border on portrait
- ✅ Theme toggle hidden on portrait
- ✅ Branding text hidden on portrait
- ✅ Desktop sidebar behavior unchanged
- ✅ Navigation functional in both orientations
- ✅ No console errors or warnings
- ✅ Production build succeeds

## Testing Checklist

- [ ] Desktop view (landscape) shows sidebar on left
- [ ] Portrait view shows bottom nav bar
- [ ] Navigation items clickable in both modes
- [ ] Active states display correctly
- [ ] Theme toggle works on desktop
- [ ] No content obscured by fixed nav on portrait
- [ ] Smooth transition when rotating device/resizing
- [ ] Dark mode works correctly
- [ ] Touch targets meet 44x44px minimum on mobile
- [ ] Keyboard navigation works
