import Link from "next/link";
import type { Route } from "next";
import { ChevronRight, Home } from "lucide-react";

interface BreadcrumbItem {
  href?: Route<string>;
  label: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="面包屑导航" className="mb-4 flex items-center gap-1.5 text-sm text-[var(--color-ink-soft)]">
      <Link
        href="/"
        className="flex items-center gap-1 transition-colors hover:text-[var(--color-ink)]"
      >
        <Home className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">首页</span>
      </Link>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3 opacity-40" />
            {isLast || !item.href ? (
              <span className={isLast ? "font-medium text-[var(--color-ink)]" : ""}>
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="transition-colors hover:text-[var(--color-ink)]"
              >
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
