export const BACK_TO_TOP_VISIBILITY_THRESHOLD = 360;

export const BACK_TO_TOP_SCROLL_OPTIONS = {
  behavior: "smooth",
  top: 0,
} as const;

export function shouldShowBackToTop(scrollY: number) {
  return scrollY > BACK_TO_TOP_VISIBILITY_THRESHOLD;
}
