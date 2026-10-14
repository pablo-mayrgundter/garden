"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Today", match: (p: string) => p === "/" },
  { href: "/trays", label: "Planters", match: (p: string) => p.startsWith("/trays") || p.startsWith("/plantings") },
  { href: "/plants", label: "Seed library", match: (p: string) => p.startsWith("/plants") },
  { href: "/settings", label: "Settings", match: (p: string) => p.startsWith("/settings") },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={l.match(pathname) ? "active" : ""}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
