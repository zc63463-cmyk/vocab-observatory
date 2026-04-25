import { revalidateTag } from "next/cache";

export const PUBLIC_CACHE_TAGS = {
  landing: "public:landing",
  plazaDetail: "public:plaza:detail",
  plazaIndex: "public:plaza:index",
  wordDetail: "public:words:detail",
  wordIndex: "public:words:index",
} as const;

export function getAllPublicCacheTags() {
  return Object.values(PUBLIC_CACHE_TAGS);
}

export function revalidatePublicContent() {
  for (const tag of getAllPublicCacheTags()) {
    revalidateTag(tag, "max");
  }
}
