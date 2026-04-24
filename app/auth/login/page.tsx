import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="panel rounded-[2rem] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
          Access Model
        </p>
        <h2 className="section-title mt-3 text-4xl font-semibold">公开浏览，私有学习层</h2>
        <p className="mt-5 text-sm leading-7 text-[var(--color-ink-soft)]">
          第一版固定为访客可浏览公开词条；只有 owner 账号可进入复习、笔记和导入管理。这样能保持 Obsidian
          内容公开，同时把个人学习状态留在 Supabase 私有表中。
        </p>
      </div>
      <LoginForm
        next={next}
        initialError={
          error === "unauthorized"
            ? "当前邮箱不是允许登录的 owner 邮箱。"
            : error
        }
      />
    </div>
  );
}
