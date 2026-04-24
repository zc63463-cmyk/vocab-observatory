"use client";

import { startTransition, useState } from "react";

export function WordNotes({
  initialContent,
  wordId,
}: {
  initialContent: string;
  wordId: string;
}) {
  const [content, setContent] = useState(initialContent);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  function handleSave() {
    setPending(true);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/notes/${wordId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ contentMd: content }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "保存失败");
        }
        setMessage("笔记已保存。");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "保存失败");
      } finally {
        setPending(false);
      }
    });
  }

  return (
    <section className="panel rounded-[1.75rem] p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="section-title text-2xl font-semibold">个人笔记</h2>
        <button
          type="button"
          disabled={pending}
          onClick={handleSave}
          className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold transition hover:border-[var(--color-border-strong)] hover:bg-[rgba(255,255,255,0.45)] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending ? "保存中..." : "保存"}
        </button>
      </div>
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={10}
        className="mt-4 w-full rounded-[1.5rem] border border-[var(--color-border)] bg-[rgba(255,255,255,0.72)] p-4 text-sm leading-7 outline-none transition focus:border-[var(--color-accent)]"
        placeholder="记录你的例句、误区、联想和复习提示。"
      />
      {message ? <p className="mt-3 text-sm text-[var(--color-ink-soft)]">{message}</p> : null}
    </section>
  );
}
