import { SkeletonLine } from "@/components/ui/Skeleton";

export default function AppLoading() {
  return (
    <div className="space-y-8">
      <section className="panel-strong rounded-[2rem] p-8">
        <SkeletonLine className="h-4 w-28" />
        <SkeletonLine className="mt-4 h-14 w-56" />
        <SkeletonLine className="mt-4 h-5 w-full" />
      </section>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <section key={index} className="panel rounded-[1.75rem] p-6">
            <SkeletonLine className="h-4 w-20" />
            <SkeletonLine className="mt-4 h-10 w-16" />
          </section>
        ))}
      </div>
    </div>
  );
}
