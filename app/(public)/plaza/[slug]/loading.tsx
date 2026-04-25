import { SkeletonLine } from "@/components/ui/Skeleton";

export default function PlazaDetailLoading() {
  return (
    <div className="space-y-6">
      <section className="panel-strong rounded-[2rem] p-8">
        <SkeletonLine className="h-4 w-28" />
        <div className="mt-5 flex gap-3">
          <SkeletonLine className="h-8 w-28" />
          <SkeletonLine className="h-8 w-36" />
          <SkeletonLine className="h-8 w-32" />
        </div>
        <SkeletonLine className="mt-6 h-14 w-1/2" />
        <SkeletonLine className="mt-4 h-5 w-full" />
        <SkeletonLine className="mt-3 h-5 w-3/4" />
      </section>

      <section className="panel rounded-[1.75rem] p-6">
        <SkeletonLine className="h-8 w-40" />
        <SkeletonLine className="mt-5 h-4 w-full" />
        <SkeletonLine className="mt-3 h-4 w-5/6" />
        <SkeletonLine className="mt-3 h-4 w-4/5" />
      </section>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <section key={index} className="panel rounded-[1.75rem] p-6">
            <SkeletonLine className="h-10 w-1/2" />
            <SkeletonLine className="mt-4 h-4 w-1/3" />
            <SkeletonLine className="mt-6 h-4 w-full" />
            <SkeletonLine className="mt-3 h-4 w-4/5" />
          </section>
        ))}
      </div>
    </div>
  );
}
