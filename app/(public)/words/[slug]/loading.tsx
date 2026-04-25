import "../skeleton.css";

function SkeletonLine({ className }: { className: string }) {
  return (
    <div
      className={`skeleton-shimmer rounded-full ${className}`}
      style={{ minHeight: "1em" }}
    />
  );
}

export default function WordDetailLoading() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <section className="panel-strong rounded-[2rem] p-8">
          <SkeletonLine className="h-4 w-20" />
          <SkeletonLine className="mt-4 h-14 w-48" />
          <SkeletonLine className="mt-4 h-5 w-40" />
          <SkeletonLine className="mt-6 h-5 w-full" />
          <SkeletonLine className="mt-3 h-5 w-3/4" />
        </section>

        {Array.from({ length: 4 }).map((_, index) => (
          <section key={index} className="panel rounded-[1.75rem] p-6">
            <SkeletonLine className="h-8 w-36" />
            <SkeletonLine className="mt-5 h-4 w-full" />
            <SkeletonLine className="mt-3 h-4 w-5/6" />
            <SkeletonLine className="mt-3 h-4 w-2/3" />
          </section>
        ))}
      </div>

      <aside className="space-y-6">
        {Array.from({ length: 2 }).map((_, index) => (
          <section key={index} className="panel rounded-[1.75rem] p-6">
            <SkeletonLine className="h-8 w-32" />
            <SkeletonLine className="mt-5 h-10 w-full" />
            <SkeletonLine className="mt-4 h-4 w-4/5" />
            <SkeletonLine className="mt-3 h-4 w-2/3" />
          </section>
        ))}
      </aside>
    </div>
  );
}
