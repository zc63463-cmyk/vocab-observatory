"use client";

import { marked } from "marked";
import {
  useCallback,
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
} from "react";
import { normalizeObsidianMarkdown } from "@/lib/markdown";
import { excerpt, formatDateTime } from "@/lib/utils";

interface NoteRevision {
  content_md: string;
  created_at: string;
  id: string;
  version: number;
}

marked.setOptions({
  breaks: true,
  gfm: true,
});

export function WordNotes({
  initialContent,
  initialHistory,
  initialUpdatedAt,
  initialVersion,
  wordId,
}: {
  initialContent: string;
  initialHistory: NoteRevision[];
  initialUpdatedAt: string | null;
  initialVersion: number;
  wordId: string;
}) {
  const [content, setContent] = useState(initialContent);
  const [history, setHistory] = useState<NoteRevision[]>(initialHistory);
  const [lastSavedContent, setLastSavedContent] = useState(initialContent);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "saving" | "error">(
    "idle",
  );
  const [updatedAt, setUpdatedAt] = useState<string | null>(initialUpdatedAt);
  const [version, setVersion] = useState(initialVersion);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
  const deferredContent = useDeferredValue(content);

  const previewHtml = marked.parse(normalizeObsidianMarkdown(deferredContent)) as string;

  const loadHistory = useCallback(async () => {
    const response = await fetch(`/api/notes/${wordId}/history`);
    const payload = (await response.json()) as {
      error?: string;
      revisions?: NoteRevision[];
    };
    if (!response.ok) {
      throw new Error(payload.error ?? "加载历史失败");
    }
    setHistory(payload.revisions ?? []);
  }, [wordId]);

  const persist = useCallback(async (force = false) => {
    if (!force && content === lastSavedContent) {
      return;
    }

    setSaveState("saving");
    try {
      const response = await fetch(`/api/notes/${wordId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ contentMd: content }),
      });
      const payload = (await response.json()) as {
        error?: string;
        updatedAt?: string;
        version?: number;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "保存失败");
      }

      setLastSavedContent(content);
      setUpdatedAt(payload.updatedAt ?? null);
      setVersion(payload.version ?? version);
      setSaveState("saved");
      await loadHistory();
    } catch {
      setSaveState("error");
    }
  }, [content, lastSavedContent, loadHistory, version, wordId]);

  const restoreRevision = useCallback(
    async (revisionId: string, revisionVersion: number) => {
      setRestoringVersion(revisionVersion);
      try {
        const response = await fetch(`/api/notes/${wordId}/restore`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ revisionId }),
        });
        const payload = (await response.json()) as {
          contentMd?: string;
          error?: string;
          restoredFromVersion?: number;
          updatedAt?: string;
          version?: number;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "恢复失败");
        }

        setContent(payload.contentMd ?? "");
        setLastSavedContent(payload.contentMd ?? "");
        setUpdatedAt(payload.updatedAt ?? null);
        setVersion(payload.version ?? version);
        setSaveState("saved");
        setView("edit");
        await loadHistory();
      } catch {
        setSaveState("error");
      } finally {
        setRestoringVersion(null);
      }
    },
    [loadHistory, version, wordId],
  );

  useEffect(() => {
    if (content === lastSavedContent) {
      return;
    }

    const timer = window.setTimeout(() => {
      void startTransition(async () => {
        await persist(false);
      });
    }, 1200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [content, lastSavedContent, persist]);

  return (
    <section className="panel rounded-[1.75rem] p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="section-title text-2xl font-semibold">个人笔记</h2>
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
            {saveState === "saving"
              ? "保存中..."
              : saveState === "saved"
                ? `已保存 · 版本 ${version}`
                : saveState === "error"
                  ? "自动保存失败，请手动重试"
                  : "编辑后会自动保存"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void persist(true)}
          className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold transition hover:border-[var(--color-border-strong)] hover:bg-[rgba(255,255,255,0.45)]"
        >
          立即保存
        </button>
      </div>

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => setView("edit")}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            view === "edit"
              ? "bg-[var(--color-accent)] text-white"
              : "border border-[var(--color-border)] text-[var(--color-ink-soft)]"
          }`}
        >
          编辑
        </button>
        <button
          type="button"
          onClick={() => setView("preview")}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            view === "preview"
              ? "bg-[var(--color-accent)] text-white"
              : "border border-[var(--color-border)] text-[var(--color-ink-soft)]"
          }`}
        >
          预览
        </button>
      </div>

      {view === "edit" ? (
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={10}
          className="mt-4 w-full rounded-[1.5rem] border border-[var(--color-border)] bg-[rgba(255,255,255,0.72)] p-4 text-sm leading-7 outline-none transition focus:border-[var(--color-accent)]"
          placeholder="记录你的例句、误区、联想和复习提示。"
        />
      ) : (
        <div
          className="prose-obsidian mt-4 rounded-[1.5rem] border border-[var(--color-border)] bg-[rgba(255,255,255,0.55)] p-4"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      )}

      <div className="mt-5 rounded-[1.25rem] border border-[var(--color-border)] bg-[rgba(255,255,255,0.45)] p-4 text-sm text-[var(--color-ink-soft)]">
        <p>当前版本：{version}</p>
        <p>最后保存：{formatDateTime(updatedAt)}</p>
      </div>

      {history.length > 0 ? (
        <div className="mt-5 space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
            最近版本快照
          </h3>
          {history.map((revision) => (
            <div
              key={revision.id}
              className="rounded-[1.2rem] border border-[var(--color-border)] bg-[rgba(255,255,255,0.45)] p-4"
            >
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-semibold">Version {revision.version}</p>
                <p className="text-xs text-[var(--color-ink-soft)]">
                  {formatDateTime(revision.created_at)}
                </p>
              </div>
              <p className="mt-2 text-sm leading-7 text-[var(--color-ink-soft)]">
                {excerpt(revision.content_md || "空白笔记", 160)}
              </p>
              <div className="mt-3">
                <button
                  type="button"
                  disabled={restoringVersion !== null || revision.version === version}
                  onClick={() => void restoreRevision(revision.id, revision.version)}
                  className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold transition hover:border-[var(--color-border-strong)] hover:bg-[rgba(255,255,255,0.45)] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {revision.version === version
                    ? "当前版本"
                    : restoringVersion === revision.version
                      ? "恢复中..."
                      : "恢复此版本"}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
