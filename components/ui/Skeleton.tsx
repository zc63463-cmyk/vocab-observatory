import "./skeleton.css";

// ── Skeleton primitives ─────────────────────────────────────────────────────

export function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <div
      className={`skeleton-shimmer rounded-full ${className}`}
      style={{ minHeight: "1em" }}
    />
  );
}

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`skeleton-shimmer rounded-[1.5rem] ${className}`}
      style={{ minHeight: "1em" }}
    />
  );
}

export function SkeletonCircle({ className = "" }: { className?: string }) {
  return (
    <div
      className={`skeleton-shimmer rounded-full ${className}`}
      style={{ minHeight: "1em" }}
    />
  );
}
