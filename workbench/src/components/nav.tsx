"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  { href: "/", label: "Home" },
  { href: "/agent", label: "Agent" },
  { href: "/forest", label: "Forest" },
  { href: "/study", label: "Study" },
  { href: "/crawl", label: "Crawl" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="w-48 shrink-0 border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 min-h-screen p-4 flex flex-col gap-1">
      <div className="text-sm font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-3 px-2">
        Workbench
      </div>
      {sections.map(({ href, label }) => {
        const active =
          href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`block px-2 py-1.5 rounded text-sm transition-colors ${
              active
                ? "bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-medium"
                : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/50"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
