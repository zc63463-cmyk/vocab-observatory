"use client";

import {
  useCallback,
  startTransition,
  useDeferredValue,
  useEffect,
  useReducer,
  useState,
} from "react";
import { normalizeObsidianMarkdown } from "@/lib/markdown";
import { sanitizeHtmlSync } from "@/lib/sanitize";
import { excerpt, formatDateTime } from "@/lib/utils";

interface NoteRevision {
  content_md: string;
  created_at: string;
  id: string;
  version: number;
}

/**
 * Lazy-loaded markdown renderer — moves `marked` (~50KB gzip) out of the main bundle.
 * The import is deferred until the user actually switches to preview mode.
 */
async function renderMarkdownOnClient(text: string): Promise<string> {
  const { marked } = await import("marked");
  marked.setOptions({ breaks: true, gfm: true });
  const raw = marked.parse(text) as string;
  return sanitizeHtmlSync(raw);
}

// ── Reducer: consolidate 9 useState into a single state object ──

interface WordNotesState {
  content: string;
  history: NoteRevision[];
  lastSavedContent: string;
  previewHtml: string;
  restoringVersion: number | null;
  saveState: "error" | "idle" | "saved" | "saving";
  updatedAt: string | null;
  version: number;
  view: "edit" | "preview";
}

type WordNotesAction =
  | { payload: string; type: "SET_CONTENT" }
  | { payload: NoteRevision[]; type: "SET_HISTORY" }
  | { type: "MARK_SAVED"; updatedAt: string | null; version: number }
  | { payload: string; type: "SET_PREVIEW_HTML" }
  | { payload: number | null; type: "SET_RESTORING_VERSION" }
  | { payload: WordNotesState["saveState"]; type: "SET_SAVE_STATE" }
  | { payload: WordNotesState["view"]; type: "SET_VIEW" }
  | { payload: { content: string; updatedAt: string | null; version: number }; type: "RESTORE_REVISION" };

function wordNotesReducer(state: WordNotesState, action: WordNotesAction): WordNotesState {
  switch (action.type) {
    case "SET_CONTENT":
      return { ...state, content: action.payload };
    case "SET_HISTORY":
      return { ...state, history: action.payload };
    case "MARK_SAVED":
      return {
        ...state,
        lastSavedContent: state.content,
        saveState: "saved",
        updatedAt: action.updatedAt,
        version: action.version,
      };
    case "SET_PREVIEW_HTML":
      return { ...state, previewHtml: action.payload };
    case "SET_RESTORING_VERSION":
      return { ...state, restoringVersion: action.payload };
    case "SET_SAVE_STATE":
      return { ...state, saveState: action.payload };
    case "SET_VIEW":
      return { ...state, view: action.payload };
    case "RESTORE_REVISION":
      return {
        ...state,
        content: action.payload.content,
        lastSavedContent: action.payload.content,
        saveState: "saved",
        updatedAt: action.payload.updatedAt,
        version: action.payload.version,
        view: "edit",
      };
    default:
      return state;
  }
}

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
  const [state, dispatch] = useReducer(wordNotesReducer, {
    content: initialContent,
    history: initialHistory,
    lastSavedContent: initialContent,
    previewHtml: "",
    restoringVersion: null,
    saveState: "idle",
    updatedAt: initialUpdatedAt,
    version: initialVersion,
    view: "edit",
  });

  const deferredContent = useDeferredValue(state.content);

  // Lazy-render markdown only when preview mode is active — keeps `marked` out of the main bundle
  useEffect(() => {
    if (state.view !== "preview") return;

    let cancelled = false;
    void renderMarkdownOnClient(normalizeObsidianMarkdown(deferredContent)).then((html) => {
      if (!cancelled) dispatch({ payload: html, type: "SET_PREVIEW_HTML" });
    });

    return () => {
      cancelled = true;
    };
  }, [deferredContent, state.view]);

  const loadHistory = useCallback(async () => {
    const response = await fetch(`/api/notes/${wordId}/history`);
    const payload = (await response.json()) as {
      error?: string;
      revisions?: NoteRevision[];
    };
    if (!response.ok) {
      throw new Error(payload.error ?? "加载历史失败");
    }
    dispatch({ payload: payload.revisions ?? [], type: "SET_HISTORY" });
  }, [wordId]);

  const persist = useCallback(async (force = false) => {
    if (!force && state.content === state.lastSavedContent) {
      return;
    }

    dispatch({ payload: "saving", type: "SET_SAVE_STATE" });
    try {
      const response = await fetch(`/api/notes/${wordId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ contentMd: state.content }),
      });
      const payload = (await response.json()) as {
        error?: string;
        updatedAt?: string;
        version?: number;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "保存失败");
      }

      dispatch({
        type: "MARK_SAVED",
        updatedAt: payload.updatedAt ?? null,
        version: payload.version ?? state.version,
      });
      await loadHistory();
    } catch {
      dispatch({ payload: "error", type: "SET_SAVE_STATE" });
    }
  }, [state.content, state.lastSavedContent, state.version, loadHistory, wordId]);

  const restoreRevision = useCallback(
    async (revisionId: string, revisionVersion: number) => {
      dispatch({ payload: revisionVersion, type: "SET_RESTORING_VERSION" });
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

        dispatch({
          type: "RESTORE_REVISION",
          payload: {
            content: payload.contentMd ?? "",
            updatedAt: payload.updatedAt ?? null,
            version: payload.version ?? state.version,
          },
        });
        await loadHistory();
      } catch {
        dispatch({ payload: "error", type: "SET_SAVE_STATE" });
      } finally {
        dispatch({ payload: null, type: "SET_RESTORING_VERSION" });
      }
    },
    [loadHistory, state.version, wordId],
  );

  useEffect(() => {
    if (state.content === state.lastSavedContent) {
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
  }, [state.content, state.lastSavedContent, persist]);

  return (
    <section className="panel rounded-[1.75rem] p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="section-title text-2xl font-semibold">个人笔记</h2>
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
            {state.saveState === "saving"
              ? "保存中..."
              : state.saveState === "saved"
                ? `已保存 · 版本 ${state.version}`
                : state.saveState === "error"
                  ? "自动保存失败，请手动重试"
                  : "编辑后会自动保存"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void persist(true)}
          className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-soft)]"
        >
          立即保存
        </button>
      </div>

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => dispatch({ payload: "edit", type: "SET_VIEW" })}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            state.view === "edit"
              ? "bg-[var(--color-accent)] text-white"
              : "border border-[var(--color-border)] text-[var(--color-ink-soft)]"
          }`}
        >
          编辑
        </button>
        <button
          type="button"
          onClick={() => dispatch({ payload: "preview", type: "SET_VIEW" })}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            state.view === "preview"
              ? "bg-[var(--color-accent)] text-white"
              : "border border-[var(--color-border)] text-[var(--color-ink-soft)]"
          }`}
        >
          预览
        </button>
      </div>

      {state.view === "edit" ? (
        <textarea
          value={state.content}
          onChange={(event) => dispatch({ payload: event.target.value, type: "SET_CONTENT" })}
          rows={10}
          className="mt-4 w-full rounded-[1.5rem] border border-[var(--color-border)] bg-[var(--color-surface-input)] p-4 text-sm leading-7 outline-none transition focus:border-[var(--color-accent)]"
          placeholder="记录你的例句、误区、联想和复习提示。"
        />
      ) : (
        <div
          className="prose-obsidian mt-4 rounded-[1.5rem] border border-[var(--color-border)] bg-[var(--color-surface-glass)] p-4"
          dangerouslySetInnerHTML={{ __html: state.previewHtml }}
        />
      )}

      <div className="mt-5 rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 text-sm text-[var(--color-ink-soft)]">
        <p>当前版本：{state.version}</p>
        <p>最后保存：{formatDateTime(state.updatedAt)}</p>
      </div>

      {state.history.length > 0 ? (
        <div className="mt-5 space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
            最近版本快照
          </h3>
          {state.history.map((revision) => (
            <div
              key={revision.id}
              className="rounded-[1.2rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4"
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
                  disabled={state.restoringVersion !== null || revision.version === state.version}
                  onClick={() => void restoreRevision(revision.id, revision.version)}
                  className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-soft)] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {revision.version === state.version
                    ? "当前版本"
                    : state.restoringVersion === revision.version
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
