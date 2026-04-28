"use client";

import { useCallback, useRef } from "react";
import { Search } from "lucide-react";

interface OmniSearchInputProps {
  query: string;
  onQueryChange: (query: string) => void;
  onArrowUp: () => void;
  onArrowDown: () => void;
  onEnter: () => void;
  /** aria-activedescendant — id of the currently highlighted option */
  activeDescendant?: string;
}

export function OmniSearchInput({
  query,
  onQueryChange,
  onArrowUp,
  onArrowDown,
  onEnter,
  activeDescendant,
}: OmniSearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef(false);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        onArrowDown();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        onArrowUp();
      } else if (e.key === "Enter") {
        // Don't trigger during IME composition
        if (isComposingRef.current || e.nativeEvent.isComposing) return;
        e.preventDefault();
        onEnter();
      }
    },
    [onArrowDown, onArrowUp, onEnter],
  );

  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <Search className="h-5 w-5 shrink-0 text-[var(--color-ink-soft)]" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
        }}
        role="combobox"
        aria-label="搜索词条、功能或命令"
        aria-controls="omni-results"
        aria-activedescendant={activeDescendant || undefined}
        aria-expanded="true"
        aria-autocomplete="list"
        placeholder="搜索词条、功能或命令..."
        className="flex-1 bg-transparent text-[var(--color-ink)] placeholder:text-[var(--color-ink-soft)] focus:outline-none text-base"
        autoComplete="off"
        spellCheck={false}
      />
      <kbd className="hidden sm:inline-flex items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-0.5 text-xs text-[var(--color-ink-soft)] font-mono">
        Esc
      </kbd>
    </div>
  );
}

/** Expose input ref for auto-focus */
OmniSearchInput.displayName = "OmniSearchInput";
