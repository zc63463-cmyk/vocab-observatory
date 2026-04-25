import { SkeletonBlock } from "@/components/ui/Skeleton";

export default function PublicLoading() {
  return (
    <div className="space-y-8">
      {/* Hero skeleton */}
      <section className="panel-strong rounded-[2rem] p-8">
        <SkeletonBlock className="h-4 w-32" />
        <SkeletonBlock className="mt-5 h-14 w-3/4" />
        <SkeletonBlock className="mt-4 h-5 w-full" />
        <SkeletonBlock className="mt-3 h-5 w-2/3" />
        <div className="mt-8 flex gap-3">
          <SkeletonBlock className="h-14 flex-1" />
          <SkeletonBlock className="h-14 w-32" />
        </div>
      </section>

      {/* Card grid skeleton */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <section key={index} className="panel rounded-[1.75rem] p-6">
            <SkeletonBlock className="h-10 w-1/2" />
            <SkeletonBlock className="mt-4 h-4 w-1/3" />
            <SkeletonBlock className="mt-6 h-4 w-full" />
            <SkeletonBlock className="mt-3 h-4 w-4/5" />
            <div className="mt-5 flex gap-2">
              <SkeletonBlock className="h-7 w-14 rounded-full" />
              <SkeletonBlock className="h-7 w-16 rounded-full" />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
