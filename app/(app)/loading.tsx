import "../skeleton.css";

function SkeletonStrip({ className }: { className: string }) {
  return (
    <div
      className={`skeleton-shimmer rounded-full ${className}`}
      style={{ minHeight: "1em" }}
    />
  );
}

export default function AppLoading() {
  return (
    <div className="space-y-8">
      <section className="panel-strong rounded-[2rem] p-8">
        <SkeletonStrip className="h-4 w-28" />
        <SkeletonStrip className="mt-4 h-14 w-56" />
        <SkeletonStrip className="mt-4 h-5 w-full" />
      </section>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <section key={index} className="panel rounded-[1.75rem] p-6">
            <SkeletonStrip className="h-4 w-20" />
            <SkeletonStrip className="mt-4 h-10 w-16" />
          </section>
        ))}
      </div>
    </div>
  );
}
