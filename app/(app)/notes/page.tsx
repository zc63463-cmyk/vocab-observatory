import Link from "next/link";
import { getDashboardSummary } from "@/lib/dashboard";
import { formatDateTime } from "@/lib/utils";

export default async function NotesPage() {
  const summary = await getDashboardSummary();

  return (
    <div className="space-y-8">
      <section className="panel-strong rounded-[2rem] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
          Personal Notes
        </p>
        <h1 className="section-title mt-3 text-5xl font-semibold">笔记列表</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--color-ink-soft)]">
          这里展示你最近编辑过的词条笔记，方便从一个入口回到具体词条继续整理。
        </p>
      </section>

      <section className="space-y-4">
        {summary.notes.length === 0 ? (
          <div className="panel rounded-[1.75rem] p-8 text-sm text-[var(--color-ink-soft)]">
            还没有笔记。进入任意词条详情页后即可开始记录。
          </div>
        ) : (
          summary.notes.map((note, index) => (
            <div key={`${note.updated_at}-${index}`} className="panel rounded-[1.75rem] p-6">
              <div className="flex items-center justify-between gap-4">
                {note.words ? (
                  <Link
                    href={`/words/${note.words.slug}`}
                    className="section-title text-2xl font-semibold text-[var(--color-accent)]"
                  >
                    {note.words.lemma}
                  </Link>
                ) : (
                  <h2 className="section-title text-2xl font-semibold">已删除词条</h2>
                )}
                <p className="text-sm text-[var(--color-ink-soft)]">
                  {formatDateTime(note.updated_at)}
                </p>
              </div>
              <p className="mt-4 text-sm leading-7 text-[var(--color-ink-soft)]">
                {note.content_md || "空白笔记"}
              </p>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
