"use client";

export function OmniFooter() {
  return (
    <div className="flex items-center gap-4 border-t border-[var(--color-border)] px-5 py-2.5 text-xs text-[var(--color-ink-soft)]">
      <span className="flex items-center gap-1">
        <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-1 py-0.5 font-mono text-[10px]">
          ↑
        </kbd>
        <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-1 py-0.5 font-mono text-[10px]">
          ↓
        </kbd>
        <span>选择</span>
      </span>
      <span className="flex items-center gap-1">
        <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-1.5 py-0.5 font-mono text-[10px]">
          ↵
        </kbd>
        <span>打开</span>
      </span>
      <span className="flex items-center gap-1">
        <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-1.5 py-0.5 font-mono text-[10px]">
          Esc
        </kbd>
        <span>关闭</span>
      </span>
    </div>
  );
}
