"use client";

/**
 * Orchestrator for the Mastery Network visualization.
 *
 * Replaces the legacy SVG `MasteryHeatmap` when rendered under
 * `@/components/dashboard/lab/bodies/MasteryNetworkBody`. Same public prop
 * shape (`cells`, `relationGraph`, `chromeless`) so the three call sites
 * don't need touching.
 *
 * What this file owns:
 *   - Toggle button (2D grid ⇌ 3D globe) + framer-motion morph driver.
 *   - Tooltip + preview modal HTML overlays.
 *   - Navigation / prefetch side effects.
 *   - Dynamic import of the r3f canvas (WebGL modules are client-only).
 *
 * What it DOESN'T own: anything inside the WebGL scene graph. That's
 * `MasteryNetworkCanvas`, which in turn reads `morph` every frame via
 * `useFrame` without forcing this component to rerender.
 */

import { animate, useMotionValue, useMotionValueEvent } from "framer-motion";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  buildAdjacency,
  flattenRelationGraph,
  getRetrievabilityColor,
  getRetrievabilityLabel,
  pruneTopKEdges,
  toEdgeIndexBuffer,
  type MasteryNetworkNode,
} from "@/lib/mastery-network-layout";
import type { LabelPositionMap } from "./MasteryNetworkCanvas";

interface MasteryCell {
  cefr: string;
  lemma: string;
  metadata: unknown;
  slug: string;
  retrievability: number;
  dueAt: string | null;
  ipa: string | null;
  shortDefinition: string | null;
  pos: string | null;
  title: string | null;
}

interface MasteryGlobeProps {
  cells: MasteryCell[];
  relationGraph?: Record<string, { slug: string; lemma: string; relation: string }[]>;
  chromeless?: boolean;
}

/* Per-node cap on visible edges. Matches the spec we agreed on for the
   6000+ node scale: max degree 3 keeps the globe from looking like a
   hairball while still communicating "this word has connections". */
const EDGE_TOP_K = 3;

/* Zoom parameters. Multiplier per +/- click and clamp bounds. The range
   is deliberately asymmetric: 0.6 lets the user see the whole grid with
   breathing room on all sides; 3.5 lets them read individual lemma
   labels even at 6000-node density. Each click scales by ~1.35. */
const ZOOM_STEP = 1.35;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 3.5;

/* Above this zoom we flip to "bulk labels" LOD (all interesting nodes
   get a visible lemma label instead of only the hovered / preview pair).
   Interesting = retrievability < 0.4 OR has a visible edge. Capped below. */
const LABEL_ZOOM_THRESHOLD = 1.5;
const LABEL_MAX_COUNT = 150;

/* Drag gesture parameters. A click counts as a click while the pointer
   moves less than DRAG_THRESHOLD_PX between down and up; past that we
   switch the gesture into pan-or-rotate mode and suppress the eventual
   click so releasing over a node doesn't also open its preview.

   CAMERA_VIEW_HEIGHT_WORLD is the world-space height of the camera's
   viewport at our fixed camera distance (FOV 35° at z=6.5). It feeds
   pixel ↔ world conversion for the pan gesture. Independent of canvas
   dpr or width — height alone determines it because the aspect ratio
   is implicit in the renderer. */
const DRAG_THRESHOLD_PX = 4;
const CAMERA_VIEW_HEIGHT_WORLD = 2 * Math.tan((35 * Math.PI) / 360) * 6.5; // ≈ 4.10
const ROTATION_SENSITIVITY_RAD_PER_PX = 0.008; // ∼ half-turn per 400px drag
const AUTO_ROTATE_RESUME_MS = 1500; // pause after user finishes dragging globe

/* Dynamic import: three.js + r3f touch `window` at import time and are
   roughly 170 KB gzipped of client code we don't want on the first paint.
   `ssr: false` is only allowed inside a Client Component (Next.js 16 rule),
   which this file is. */
const MasteryNetworkCanvas = dynamic(
  () =>
    import("./MasteryNetworkCanvas").then(
      (m) => m.MasteryNetworkCanvas,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-[11px] text-[var(--color-ink-soft)] opacity-60">
        加载 3D 图形引擎…
      </div>
    ),
  },
);

export function MasteryGlobe({
  cells,
  relationGraph = {},
  chromeless = false,
}: MasteryGlobeProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  /* View state. The motion value is what the canvas consumes per-frame;
     `mode` is what the button reflects. They stay in sync via animate()
     on click. Separating them means the button label flips immediately
     even though the visual transition takes ~800ms. */
  const [mode, setMode] = useState<"flat" | "globe">("flat");
  /* Interaction level. "locked" = no drag, no auto-rotate, click always
     works (safest, default). "manual" = drag enabled, click only on
     near-stationary release. "auto" = manual + the 3D globe spins on
     its own when idle. User-facing ladder: more features = more chance
     of gesture conflicts, so we start at the safe end. */
  const [interactionMode, setInteractionMode] = useState<
    "locked" | "manual" | "auto"
  >("locked");
  const morph = useMotionValue(0);
  const zoom = useMotionValue(1);
  /* Pan (world units, 2D mode) and user-rotation (radians, 3D mode).
     Canvas reads them via MotionValue.get() per frame; we update them
     imperatively from pointer handlers without triggering rerenders. */
  const panX = useMotionValue(0);
  const panY = useMotionValue(0);
  const userRotX = useMotionValue(0);
  const userRotY = useMotionValue(0);

  /* Mirror of the zoom scalar as React state: bulk-label LOD threshold,
     button-disabled flags, and the live display string. All four are
     set from one MotionValue event handler, guarded so identical
     values don't restart the useState machinery. During a 280ms animate()
     this handler may fire ~17 times; the guards ensure most of those are
     no-ops (display only changes when the rounded value changes). */
  const [zoomedIn, setZoomedIn] = useState(false);
  const [zoomAtMax, setZoomAtMax] = useState(false);
  const [zoomAtMin, setZoomAtMin] = useState(false);
  const [zoomDisplay, setZoomDisplay] = useState("×1.0");
  useMotionValueEvent(zoom, "change", (v) => {
    const nextZoomedIn = v >= LABEL_ZOOM_THRESHOLD;
    setZoomedIn((prev) => (prev === nextZoomedIn ? prev : nextZoomedIn));
    const nextMax = v >= ZOOM_MAX * 0.999;
    setZoomAtMax((prev) => (prev === nextMax ? prev : nextMax));
    const nextMin = v <= ZOOM_MIN * 1.001;
    setZoomAtMin((prev) => (prev === nextMin ? prev : nextMin));
    const nextDisplay = `×${v.toFixed(1)}`;
    setZoomDisplay((prev) => (prev === nextDisplay ? prev : nextDisplay));
  });

  const [hovered, setHovered] = useState<{
    slug: string;
    clientX: number;
    clientY: number;
  } | null>(null);
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);

  const prefetchedRef = useRef<Set<string>>(new Set());
  const previewPanelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  /* Shared mutable map written by the canvas every frame, read by our
     rAF loop to shuffle label DOM transforms. Never drives rerenders. */
  const labelPositionsRef = useRef<LabelPositionMap>(new Map());
  const labelLayerRef = useRef<HTMLDivElement>(null);

  /* Drag-gesture state. Kept as refs so handlers can mutate them
     synchronously (rAF / pointer timing) without triggering rerenders.

     autoRotateEnabledRef gates the canvas's internal auto-spin while
     the user is dragging (and for ~1.5s after they release) so the
     globe doesn't wrench out from under their hand.

     isDraggingRef: true between down-past-threshold and up.
     justDraggedRef: true briefly after up, to suppress the synthetic
     click that would otherwise open the preview modal at drag end. */
  const autoRotateEnabledRef = useRef(true);
  const autoRotateResumeTimeoutRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const justDraggedRef = useRef(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  /* Live mirror of the hovered node's slug. The canvas reports hover
     changes via `handleHoverChange` which sets React state; this ref
     keeps the latest slug available to pointerdown/up closures without
     going through a stale closure capture. It's the primary input to
     the manual click-fallback in `onWrapperPointerDown` below. */
  const hoveredSlugRef = useRef<string | null>(null);

  /* Derive the renderer inputs. Everything is memoised on `cells` /
     `relationGraph` identity so a parent rerender with the same data
     doesn't cause the canvas to rebuild its Float32Arrays. */
  const nodes = useMemo<MasteryNetworkNode[]>(
    () =>
      cells
        .filter((c) => c.lemma && c.lemma.trim().length > 0)
        .map((c) => ({
          slug: c.slug,
          lemma: c.lemma,
          cefr: c.cefr,
          retrievability: c.retrievability,
          dueAt: c.dueAt,
        })),
    [cells],
  );

  const { edgeIndices, adjacency } = useMemo(() => {
    const visible = new Set(nodes.map((n) => n.slug));
    const raw = flattenRelationGraph(relationGraph, visible);
    const pruned = pruneTopKEdges(raw, nodes, EDGE_TOP_K);
    return {
      edgeIndices: toEdgeIndexBuffer(pruned, nodes),
      adjacency: buildAdjacency(pruned),
    };
  }, [nodes, relationGraph]);

  const cellBySlug = useMemo(() => {
    const m = new Map<string, MasteryCell>();
    for (const c of cells) m.set(c.slug, c);
    return m;
  }, [cells]);

  /* Compute highlight set once per hovered slug using the O(1) adjacency
     map. Replaces the legacy O(N·E) `simEdges.some()` scan. */
  const highlightedSlugs = useMemo<Set<string> | null>(() => {
    if (!hovered) return null;
    const set = adjacency.get(hovered.slug);
    return set && set.size > 0 ? set : new Set();
  }, [hovered, adjacency]);

  /* Prefetch routes for the word detail pages as the user interacts.
     Deduped via a ref-backed Set to avoid thrashing the router cache. */
  const prefetchWord = useCallback(
    (slug: string) => {
      if (!slug || prefetchedRef.current.has(slug)) return;
      prefetchedRef.current.add(slug);
      router.prefetch(`/words/${slug}`);
    },
    [router],
  );

  useEffect(() => {
    // When cells identity changes, invalidate prefetch memo so newly-seen
    // slugs get their turn.
    prefetchedRef.current = new Set();
  }, [cells]);

  const navigateToWord = useCallback(
    (slug: string) => {
      setPreviewSlug(null);
      startTransition(() => {
        router.push(`/words/${slug}`);
      });
    },
    [router],
  );

  const handleHoverChange = useCallback(
    (payload: { slug: string; clientX: number; clientY: number } | null) => {
      /* Suppress hover reports while the user is mid-drag. Otherwise the
         tooltip would flicker under the pointer as the raycast hits
         different nodes during a pan. */
      if (isDraggingRef.current) return;
      setHovered(payload);
      hoveredSlugRef.current = payload?.slug ?? null;
      if (payload) prefetchWord(payload.slug);
    },
    [prefetchWord],
  );

  const handleSelect = useCallback(
    (slug: string) => {
      /* If the user just finished dragging, the subsequent synthetic
         click gets squashed — they meant to pan/rotate, not to open a
         word. `justDraggedRef` is set by the pointerup handler and
         cleared on the next microtask. */
      if (justDraggedRef.current) return;
      setHovered(null);
      hoveredSlugRef.current = null;
      prefetchWord(slug);
      setPreviewSlug(slug);
    },
    [prefetchWord],
  );

  const toggleMode = useCallback(() => {
    const next = mode === "flat" ? "globe" : "flat";
    setMode(next);
    /* 800ms cubic ease. Out-and-in curve (not a spring) keeps the
       duration deterministic regardless of target distance and avoids
       overshoot on a sphere which would look like the globe "bouncing". */
    animate(morph, next === "globe" ? 1 : 0, {
      duration: 0.8,
      ease: [0.65, 0, 0.35, 1],
    });
  }, [mode, morph]);

  const stepZoom = useCallback(
    (direction: 1 | -1) => {
      const current = zoom.get();
      const target =
        direction > 0 ? Math.min(current * ZOOM_STEP, ZOOM_MAX) : Math.max(current / ZOOM_STEP, ZOOM_MIN);
      if (Math.abs(target - current) < 0.001) return;
      animate(zoom, target, { duration: 0.28, ease: [0.4, 0, 0.2, 1] });
    },
    [zoom],
  );

  /* "Reset view" (bound to the 1:1 button): zoom AND pan AND rotation.
     One button covers every way the user can lose their bearings. */
  const resetView = useCallback(() => {
    const needsReset =
      Math.abs(zoom.get() - 1) > 0.001 ||
      Math.abs(panX.get()) > 0.001 ||
      Math.abs(panY.get()) > 0.001 ||
      Math.abs(userRotX.get()) > 0.001 ||
      Math.abs(userRotY.get()) > 0.001;
    if (!needsReset) return;
    const opts = { duration: 0.32, ease: [0.4, 0, 0.2, 1] as const };
    animate(zoom, 1, opts);
    animate(panX, 0, opts);
    animate(panY, 0, opts);
    animate(userRotX, 0, opts);
    animate(userRotY, 0, opts);
  }, [zoom, panX, panY, userRotX, userRotY]);

  /* Mode-switch housekeeping. When the user flips to globe mode we
     animate pan back to 0 (pan makes no sense on a sphere); when they
     flip to grid mode we animate user-rotation back to 0 (the grid has
     no natural tilt). The canvas also fades out each term by (1-m)/m
     internally, but resetting here means the state is clean if they
     zoom or reset next. */
  useEffect(() => {
    const opts = { duration: 0.4, ease: [0.4, 0, 0.2, 1] as const };
    if (mode === "flat") {
      animate(userRotX, 0, opts);
      animate(userRotY, 0, opts);
    } else {
      animate(panX, 0, opts);
      animate(panY, 0, opts);
    }
  }, [mode, userRotX, userRotY, panX, panY]);

  /* Which node slugs should the canvas project to screen-space this frame?
     Rules:
       - Hovered + currently-previewed always labelled.
       - In 2D mode, once the user zooms past the threshold, the top-N
         "interesting" nodes (weak or edge-touching) get labels too.
       - In 3D globe mode, only the hovered + preview pair — dense
         labelling on a rotating sphere is unreadable.
     N capped at LABEL_MAX_COUNT so 6000-node vocab collections don't
     materialise 6000 DOM nodes. */
  const labelSlugs = useMemo<string[]>(() => {
    const set = new Set<string>();
    if (hovered?.slug) set.add(hovered.slug);
    if (previewSlug) set.add(previewSlug);
    if (mode === "flat" && zoomedIn) {
      const interesting = nodes
        .filter((n) => n.retrievability < 0.4 || adjacency.has(n.slug))
        .sort((a, b) => a.retrievability - b.retrievability)
        .slice(0, LABEL_MAX_COUNT);
      for (const n of interesting) set.add(n.slug);
    }
    return Array.from(set);
  }, [mode, zoomedIn, nodes, adjacency, hovered?.slug, previewSlug]);

  /* Look up lemma text for every label slug so we can render them. */
  const labelLemmas = useMemo(() => {
    const out = new Map<string, string>();
    for (const slug of labelSlugs) {
      const cell = cellBySlug.get(slug);
      if (cell?.lemma) out.set(slug, cell.lemma);
    }
    return out;
  }, [labelSlugs, cellBySlug]);

  /* Pointer-down on the canvas wrapper: attach window move/up listeners
     FOR THIS GESTURE ONLY. The older design used always-on window
     listeners, which conflicts with r3f's synthetic click system: when
     the wrapper has `touch-action: none`, some browsers implicitly
     capture the pointer on down, so pointerup never reaches the <canvas>
     element — and r3f's click event (which needs pointerdown+up on the
     same target) never fires. Per-gesture attachment avoids this plus
     keeps the event loop clean when the user is idle. */
  const onWrapperPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      /* Locked mode: no drag at all. Canvas behaves like a plain
         clickable image. This is the escape hatch for when drag
         gestures interfere with click-to-open-preview. */
      if (interactionMode === "locked") return;
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("button")) return;

      const startX = e.clientX;
      const startY = e.clientY;
      const startPan = { x: panX.get(), y: panY.get() };
      const startRot = { x: userRotX.get(), y: userRotY.get() };
      const startMode = mode;
      /* Snapshot the node currently under the pointer. If pointerup
         lands on the SAME node without crossing the drag threshold,
         that's a click — open the preview directly without relying
         on r3f's onClick (which can be flaky when mixed with custom
         pointer gestures on instancedMesh). */
      const startSlug = hoveredSlugRef.current;
      let dragging = false;

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!dragging) {
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
          dragging = true;
          isDraggingRef.current = true;
          setHovered(null);
          autoRotateEnabledRef.current = false;
          if (autoRotateResumeTimeoutRef.current !== null) {
            window.clearTimeout(autoRotateResumeTimeoutRef.current);
            autoRotateResumeTimeoutRef.current = null;
          }
        }
        if (startMode === "flat") {
          const h = wrapperRef.current?.clientHeight ?? 420;
          const worldPerPx = CAMERA_VIEW_HEIGHT_WORLD / h;
          panX.set(startPan.x + dx * worldPerPx);
          panY.set(startPan.y - dy * worldPerPx);
        } else {
          userRotY.set(startRot.y + dx * ROTATION_SENSITIVITY_RAD_PER_PX);
          const nextX = startRot.x - dy * ROTATION_SENSITIVITY_RAD_PER_PX;
          userRotX.set(Math.max(-Math.PI / 2, Math.min(Math.PI / 2, nextX)));
        }
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        if (dragging) {
          justDraggedRef.current = true;
          window.setTimeout(() => {
            justDraggedRef.current = false;
          }, 50);
          if (autoRotateResumeTimeoutRef.current !== null) {
            window.clearTimeout(autoRotateResumeTimeoutRef.current);
          }
          /* Resume auto-rotation after a brief hold — BUT ONLY if the
             user is actually in "auto" mode. Previously this flipped
             on unconditionally, which caused manual-mode drags to
             suddenly start spinning the globe 1.5s later. */
          autoRotateResumeTimeoutRef.current = window.setTimeout(() => {
            if (interactionMode === "auto") {
              autoRotateEnabledRef.current = true;
            }
            autoRotateResumeTimeoutRef.current = null;
          }, AUTO_ROTATE_RESUME_MS);
        } else if (startSlug && hoveredSlugRef.current === startSlug) {
          /* Manual click fallback: pointer went down and up on the same
             hovered node without crossing the drag threshold. r3f's
             onClick may or may not fire in this situation (it competes
             with our pointer listeners), so we take responsibility for
             it explicitly. `handleSelect` itself guards against
             just-dragged state, so this is safe to call unconditionally. */
          handleSelect(startSlug);
        }
        isDraggingRef.current = false;
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [interactionMode, mode, panX, panY, userRotX, userRotY, handleSelect],
  );

  /* Sync auto-rotation gate to interactionMode. Only "auto" lets the
     canvas's useFrame spin the sphere; "manual" and "locked" keep it
     still. Also cancels any pending resume timer (from a drag just
     ending in "auto" mode) if the user downgrades to "manual"/"locked". */
  useEffect(() => {
    autoRotateEnabledRef.current = interactionMode === "auto";
    if (interactionMode !== "auto" && autoRotateResumeTimeoutRef.current !== null) {
      window.clearTimeout(autoRotateResumeTimeoutRef.current);
      autoRotateResumeTimeoutRef.current = null;
    }
  }, [interactionMode]);

  /* Auto-rotation timer cleanup on unmount. Per-gesture listeners clean
     themselves up via the pointerup handler above, but an in-flight
     resume timeout needs this. */
  useEffect(() => {
    return () => {
      if (autoRotateResumeTimeoutRef.current !== null) {
        window.clearTimeout(autoRotateResumeTimeoutRef.current);
      }
    };
  }, []);

  /* rAF loop: positions written by canvas each frame get applied to
     their matching `<div data-slug>` transform directly, bypassing React.
     Only spins when there are labels to render. */
  useEffect(() => {
    if (labelSlugs.length === 0) return;
    let raf = 0;
    const tick = () => {
      const layer = labelLayerRef.current;
      const map = labelPositionsRef.current;
      if (layer && map) {
        const children = layer.children;
        for (let i = 0; i < children.length; i++) {
          const child = children[i] as HTMLElement;
          const slug = child.dataset.slug;
          if (!slug) continue;
          const pos = map.get(slug);
          if (pos && pos.visible) {
            child.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
            child.style.opacity = "1";
          } else {
            child.style.opacity = "0";
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [labelSlugs]);

  /* Preview modal keyboard plumbing — ported verbatim from the legacy
     SVG heatmap so Esc-to-close, Tab-trap, and restore-focus all still
     work. */
  const isPreviewOpen = previewSlug !== null;
  useEffect(() => {
    if (!isPreviewOpen) return;
    const FOCUSABLE =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    previousFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setPreviewSlug(null);
        return;
      }
      if (e.key !== "Tab") return;
      const panel = previewPanelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!active || !panel.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const af = requestAnimationFrame(() => {
      const panel = previewPanelRef.current;
      panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    });

    return () => {
      cancelAnimationFrame(af);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === "function" && document.body.contains(prev)) {
        prev.focus();
      }
      previousFocusRef.current = null;
    };
  }, [isPreviewOpen]);

  /* Idle-time prefetch of neighbor words for the currently open preview.
     Same strategy as the legacy heatmap — we use requestIdleCallback so
     prefetching never steals from the user's interaction. */
  useEffect(() => {
    if (!previewSlug) return;
    const neighbors = relationGraph[previewSlug] ?? [];
    if (neighbors.length === 0) return;
    const win = typeof window !== "undefined" ? window : null;
    const schedule =
      win && "requestIdleCallback" in win
        ? (cb: () => void) =>
            (win as Window & typeof globalThis).requestIdleCallback(cb, { timeout: 1500 })
        : (cb: () => void) => window.setTimeout(cb, 200);
    const cancel =
      win && "cancelIdleCallback" in win
        ? (id: number) => (win as Window & typeof globalThis).cancelIdleCallback(id)
        : (id: number) => window.clearTimeout(id);
    const handle = schedule(() => {
      neighbors.forEach((n) => prefetchWord(n.slug));
    });
    return () => cancel(handle as number);
  }, [previewSlug, relationGraph, prefetchWord]);

  const stats = useMemo(() => {
    const total = cells.length;
    const atRisk = cells.filter((c) => c.retrievability < 0.4).length;
    const solid = cells.filter((c) => c.retrievability >= 0.9).length;
    return { atRisk, solid, total, visible: nodes.length };
  }, [cells, nodes.length]);

  const hoveredCell = hovered ? cellBySlug.get(hovered.slug) ?? null : null;
  const hoveredNeighbors = hovered
    ? (relationGraph[hovered.slug] ?? []).filter((n) => cellBySlug.has(n.slug))
    : [];

  const previewCell = previewSlug ? cellBySlug.get(previewSlug) ?? null : null;

  if (cells.length === 0) return null;

  const outerClassName = chromeless ? "relative" : "panel relative rounded-[1.75rem] p-6";

  return (
    <section className={outerClassName}>
      {!chromeless && (
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
              词汇掌握度
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--color-ink)]">词汇网络图</h2>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[var(--color-ink-soft)]">
            {[
              { color: "#16a34a", label: "牢固" },
              { color: "#84cc16", label: "较好" },
              { color: "#eab308", label: "一般" },
              { color: "#f97316", label: "薄弱" },
              { color: "#ef4444", label: "濒危" },
            ].map((item) => (
              <span key={item.label} className="flex items-center gap-1">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-4 text-[11px] text-[var(--color-ink-soft)]">
        <span>
          总 <strong className="text-[var(--color-ink)]">{stats.total}</strong> 词
        </span>
        <span style={{ color: "#ef4444" }}>
          濒危 <strong>{stats.atRisk}</strong>
        </span>
        <span style={{ color: "#16a34a" }}>
          牢固 <strong>{stats.solid}</strong>
        </span>
      </div>

      <div
        ref={wrapperRef}
        className={`relative mt-4 h-[420px] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] ${
          interactionMode === "locked"
            ? "cursor-auto"
            : "cursor-grab active:cursor-grabbing"
        }`}
        role="img"
        aria-label={`词汇网络交互图，${stats.total} 个词条，${stats.atRisk} 个濒危，${stats.solid} 个牢固。${
          interactionMode === "locked"
            ? "当前为固定视图，可点击节点查看详情。"
            : "悬停或点击节点查看详情，拖拽可平移（3D 模式下为旋转）。"
        }`}
        onPointerDown={onWrapperPointerDown}
        style={{ touchAction: interactionMode === "locked" ? "auto" : "none" }}
      >
        <MasteryNetworkCanvas
          nodes={nodes}
          edgeIndices={edgeIndices}
          morph={morph}
          zoom={zoom}
          panX={panX}
          panY={panY}
          userRotX={userRotX}
          userRotY={userRotY}
          autoRotateEnabledRef={autoRotateEnabledRef}
          hoveredSlug={hovered?.slug ?? null}
          highlightedSlugs={highlightedSlugs}
          onHoverChange={handleHoverChange}
          onSelect={handleSelect}
          labelSlugs={labelSlugs}
          labelPositionsRef={labelPositionsRef}
        />

        {/* Label overlay. Children order / identity is driven by React,
            but their `transform` comes from the per-frame rAF loop above
            so React stays out of the hot path. One div per slug; the
            canvas writes pixel positions for each into labelPositionsRef. */}
        <div
          ref={labelLayerRef}
          className="pointer-events-none absolute inset-0 overflow-hidden"
          aria-hidden="true"
        >
          {labelSlugs.map((slug) => (
            <div
              key={slug}
              data-slug={slug}
              className="absolute left-0 top-0 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium leading-none text-[var(--color-ink)] opacity-0 transition-opacity duration-150"
              style={{
                /* Subtle text halo so labels read over any dot color. */
                textShadow:
                  "0 0 3px var(--color-panel), 0 0 3px var(--color-panel), 0 0 3px var(--color-panel)",
                /* Offset label vertically above its dot via translateY
                   baked into the class (-translate-y-full). We add a
                   small extra nudge here so the label sits just above
                   the sphere surface rather than clipping into it. */
                marginTop: "-6px",
              }}
            >
              {labelLemmas.get(slug) ?? slug}
            </div>
          ))}
        </div>

        {/* Zoom / reset stack, top-left. Non-wheel by explicit request.
            Buttons disable at clamp boundaries so users get clear feedback
            rather than clicks silently doing nothing. */}
        <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1 rounded-full bg-[var(--color-surface-strong)]/85 p-1 shadow ring-1 ring-[var(--color-border)] backdrop-blur-md">
          <button
            type="button"
            onClick={() => stepZoom(1)}
            disabled={zoomAtMax}
            aria-label="放大"
            className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-soft)] hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--color-ink-soft)]"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round">
              <path d="M10 4v12M4 10h12" />
            </svg>
          </button>
          <button
            type="button"
            onClick={resetView}
            aria-label={`当前缩放 ${zoomDisplay}，点击重置视图（缩放/平移/旋转）`}
            title="点击重置视图"
            className="pointer-events-auto flex h-7 min-w-9 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-soft)] hover:text-[var(--color-ink)]"
          >
            {zoomDisplay}
          </button>
          <button
            type="button"
            onClick={() => stepZoom(-1)}
            disabled={zoomAtMin}
            aria-label="缩小"
            className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-soft)] hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--color-ink-soft)]"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round">
              <path d="M4 10h12" />
            </svg>
          </button>
        </div>

        {/* Top-right stack: view mode (flat / globe) above, interaction
            level (locked / manual / auto) below. Interaction defaults to
            "locked" so clicking a node to open its preview is never
            ambiguous; users opt in to richer gestures one step at a time. */}
        <div className="pointer-events-none absolute right-3 top-3 flex flex-col items-end gap-1">
          <div className="flex items-center gap-1 rounded-full bg-[var(--color-surface-strong)]/85 p-1 text-[11px] shadow ring-1 ring-[var(--color-border)] backdrop-blur-md">
            <button
              type="button"
              onClick={toggleMode}
              aria-pressed={mode === "flat"}
              className={`pointer-events-auto rounded-full px-3 py-1 transition ${
                mode === "flat"
                  ? "bg-[var(--color-accent)] text-white"
                  : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
              }`}
              style={{ touchAction: "manipulation" }}
            >
              网络
            </button>
            <button
              type="button"
              onClick={toggleMode}
              aria-pressed={mode === "globe"}
              className={`pointer-events-auto rounded-full px-3 py-1 transition ${
                mode === "globe"
                  ? "bg-[var(--color-accent)] text-white"
                  : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
              }`}
              style={{ touchAction: "manipulation" }}
            >
              球体
            </button>
          </div>
          <div className="flex items-center gap-0.5 rounded-full bg-[var(--color-surface-strong)]/85 p-1 text-[10px] shadow ring-1 ring-[var(--color-border)] backdrop-blur-md">
            {(
              [
                { value: "locked", label: "固定", title: "固定视图：不响应拖拽，点击必开详情" },
                { value: "manual", label: "手动", title: "手动：拖拽平移/旋转，松手不自转" },
                { value: "auto", label: "自动", title: "自动：手动操作 + 3D 球体自动缓慢自转" },
              ] as const
            ).map(({ value, label, title }) => (
              <button
                key={value}
                type="button"
                onClick={() => setInteractionMode(value)}
                aria-pressed={interactionMode === value}
                title={title}
                className={`pointer-events-auto rounded-full px-2 py-0.5 transition ${
                  interactionMode === value
                    ? "bg-[var(--color-accent)] text-white"
                    : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                }`}
                style={{ touchAction: "manipulation" }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {hovered && hoveredCell && (
        <div
          className="pointer-events-none fixed z-50 w-52 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-3 shadow-xl"
          style={{ left: hovered.clientX + 12, top: hovered.clientY - 100 }}
        >
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: getRetrievabilityColor(hoveredCell.retrievability) }}
            />
            <span className="text-sm font-semibold text-[var(--color-ink)]">
              {hoveredCell.lemma}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--color-ink-soft)]">
            {hoveredCell.cefr} · 记忆概率{" "}
            <span
              className="font-semibold"
              style={{ color: getRetrievabilityColor(hoveredCell.retrievability) }}
            >
              {Math.round(hoveredCell.retrievability * 100)}%
            </span>
            <span className="ml-1 opacity-70">
              ({getRetrievabilityLabel(hoveredCell.retrievability)})
            </span>
          </p>
          {hoveredCell.dueAt ? (
            <p className="mt-0.5 text-[10px] text-[var(--color-ink-soft)] opacity-60">
              到期 {hoveredCell.dueAt.slice(0, 10)}
            </p>
          ) : null}
          {hoveredNeighbors.length > 0 && (
            <div className="mt-2 border-t border-[var(--color-border)] pt-2">
              <p className="mb-1 text-[10px] text-[var(--color-ink-soft)] opacity-60">关联词汇</p>
              <div className="flex flex-wrap gap-1">
                {hoveredNeighbors.map((n) => (
                  <span
                    key={n.slug}
                    className="rounded bg-[var(--color-surface-soft)] px-1.5 py-0.5 text-[10px] text-[var(--color-ink-soft)]"
                  >
                    {n.lemma}
                    <span className="ml-0.5 opacity-60">({n.relation})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-ink-soft)] opacity-60">
        每个圆点 = 一个词条，颜色 = FSRS 记忆概率，大小反比于记忆强度（濒危更大）。连线表示近义/反义/词根关联，每个节点最多 {EDGE_TOP_K} 条。右上切换 <strong className="font-semibold text-[var(--color-ink)]">固定 / 手动 / 自动</strong>：固定模式只能点击查看详情；手动模式可拖拽平移/旋转；自动模式额外开启 3D 球体缓慢自转。左上 +/- 缩放（点击倍率一键居中）；放大过 1.5× 时自动显示 interesting 词的标签。
      </p>

      {previewSlug && previewCell && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
            onClick={() => setPreviewSlug(null)}
            aria-hidden="true"
          />
          <div
            ref={previewPanelRef}
            className="fixed left-1/2 top-1/2 z-[61] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[2rem] bg-[var(--color-surface-strong)] p-8 shadow-2xl ring-1 ring-[var(--color-border)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mastery-preview-title"
          >
            <button
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-surface-soft)] text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]"
              onClick={() => setPreviewSlug(null)}
              aria-label="关闭"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-soft)] opacity-60">
              {previewCell.cefr}
            </div>
            <h3 id="mastery-preview-title" className="text-2xl font-bold text-[var(--color-ink)]">
              {previewCell.lemma}
            </h3>

            <div className="mt-4 flex items-center gap-3">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: getRetrievabilityColor(previewCell.retrievability) }}
              />
              <span className="text-sm text-[var(--color-ink-soft)]">
                记忆概率{" "}
                <strong className="text-[var(--color-ink)]">
                  {Math.round(previewCell.retrievability * 100)}%
                </strong>
                <span className="ml-1 opacity-70">
                  ({getRetrievabilityLabel(previewCell.retrievability)})
                </span>
              </span>
            </div>

            {previewCell.dueAt && (
              <p className="mt-1 text-xs text-[var(--color-ink-soft)] opacity-60">
                下次复习：{previewCell.dueAt.slice(0, 10)}
              </p>
            )}

            {(() => {
              const neighbors = relationGraph[previewCell.slug] ?? [];
              return neighbors.length > 0 ? (
                <div className="mt-5">
                  <p className="mb-2 text-xs font-semibold text-[var(--color-ink-soft)]">关联词汇</p>
                  <div className="flex flex-wrap gap-2">
                    {neighbors.map((n) => (
                      <button
                        key={n.slug}
                        className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-1.5 text-xs text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]"
                        onMouseEnter={() => prefetchWord(n.slug)}
                        onFocus={() => prefetchWord(n.slug)}
                        onClick={() => {
                          prefetchWord(n.slug);
                          setPreviewSlug(n.slug);
                        }}
                      >
                        {n.lemma}
                        <span className="ml-1 opacity-60">({n.relation})</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}

            <div className="mt-6 flex gap-3">
              <button
                className="rounded-xl bg-[var(--color-surface-soft)] px-5 py-2.5 text-sm font-medium text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]"
                onClick={() => setPreviewSlug(null)}
              >
                关闭
              </button>
              <button
                className="rounded-xl px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
                style={{ backgroundColor: getRetrievabilityColor(previewCell.retrievability) }}
                onMouseEnter={() => prefetchWord(previewCell.slug)}
                onFocus={() => prefetchWord(previewCell.slug)}
                onClick={() => navigateToWord(previewCell.slug)}
              >
                查看完整详情 →
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
