import { cn } from "@/lib/utils";

export function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "warm";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-wide",
        tone === "default" ? "pill" : "pill-warm",
      )}
    >
      {children}
    </span>
  );
}
