"use client";

/**
 * WebGL renderer for the Mastery Network.
 *
 * Lives behind a `next/dynamic({ ssr: false })` boundary in the orchestrator
 * because `three` touches `window` / `WebGLRenderingContext` at import time.
 *
 * Responsibilities (and ONLY these — all HTML / tooltip / modal state lives
 * in the parent orchestrator):
 *
 *   - One `<Canvas>` with a perspective camera.
 *   - One `<instancedMesh>` holding every node as a shaded sphere instance.
 *     Position is interpolated each frame between the pre-computed 2D grid
 *     target and 3D Fibonacci-sphere target via a morph scalar.
 *   - One `<lineSegments>` holding the pruned top-K edge buffer.
 *   - Pointer pick via r3f's built-in raycaster: reports `instanceId` on
 *     hover / click, translated back to node slug + DOM-client coords for
 *     the parent to render an HTML overlay against.
 *
 * No React state is written during the frame loop — all per-frame updates
 * go through `ref.current` + `attribute.needsUpdate = true`, so the parent
 * component never rerenders during the morph animation.
 */

import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import type { MotionValue } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";

import {
  computeSphereLayout,
  computeStructuredGrid,
  getRetrievabilityColor,
  type MasteryNetworkNode,
  type Vec3,
} from "@/lib/mastery-network-layout";

/* ─── Layout constants ──────────────────────────────────────────
   These world-space sizes were picked so:
   - The 2D grid (GRID_WIDTH × GRID_HEIGHT) sits comfortably inside
     the camera frustum at CAMERA_Z with FOV 35°.
   - The sphere (SPHERE_RADIUS) maxes out to roughly the shorter
     grid edge so the morph has matched visual weight.
   Change CAMERA_Z rather than the others if you need to rebalance.
   ─────────────────────────────────────────────────────────────── */
const GRID_WIDTH = 6.5;
const GRID_HEIGHT = 3.6;
const SPHERE_RADIUS = 1.9;
const CAMERA_Z = 6.5;
const FOV = 35;
const NODE_SPHERE_SEGMENTS = 10; // 10×10 = 100 tris/instance — cheap
const BASE_NODE_RADIUS = 0.022;
const ROTATION_SPEED = 0.12; // rad/s, applied when morph ≈ 1

/**
 * Screen-space position of a tracked label, in CSS pixels relative
 * to the canvas element's top-left. `visible=false` when the node's
 * NDC z falls outside [-1, 1] (behind camera or beyond far plane) —
 * the HTML overlay should hide the label in that case.
 */
export interface LabelPosition {
  x: number;
  y: number;
  visible: boolean;
}
export type LabelPositionMap = Map<string, LabelPosition>;

interface MasteryNetworkCanvasProps {
  nodes: MasteryNetworkNode[];
  /** Flat `[a0, b0, a1, b1, ...]` pairs of node indices (see `toEdgeIndexBuffer`). */
  edgeIndices: Uint32Array;
  /**
   * Per-frame morph scalar from framer-motion. 0 = flat 2D grid, 1 = 3D
   * rotating globe. We read `.get()` in `useFrame` so the parent never
   * needs to rerender during the 800ms transition.
   */
  morph: MotionValue<number>;
  /**
   * Per-frame uniform zoom applied to the whole scene graph. 1 = default,
   * >1 zooms in. Driven by the orchestrator's +/- buttons.
   */
  zoom: MotionValue<number>;
  /**
   * 2D-mode pan (world units, applied to group.position). Multiplied by
   * `(1 - morph)` internally so pan smoothly fades out while the sphere
   * forms — the globe should rotate in place, not slide.
   */
  panX: MotionValue<number>;
  panY: MotionValue<number>;
  /**
   * 3D-mode user rotation (radians). Multiplied by `morph` internally so
   * the flat grid stays flat while the user drags. Axis X tilts the
   * globe forward/back, Y spins around vertical. Auto-rotation is a
   * separate additive term tracked inside the canvas.
   */
  userRotX: MotionValue<number>;
  userRotY: MotionValue<number>;
  /**
   * Gate for auto-rotation accumulation. Orchestrator toggles this off
   * during drag (and for ~1.5s after release) so the globe doesn't wrench
   * out from under the user's hand. Ref rather than state so orchestrator
   * can mutate it cheaply without rerendering.
   */
  autoRotateEnabledRef: RefObject<boolean>;
  hoveredSlug: string | null;
  highlightedSlugs: ReadonlySet<string> | null;
  onHoverChange: (payload: { slug: string; clientX: number; clientY: number } | null) => void;
  onSelect: (slug: string) => void;
  /**
   * Which node slugs the orchestrator wants labels projected for. The
   * canvas writes screen-space positions for each into `labelPositionsRef`
   * on every frame the scene moves. Everything else (which slugs belong
   * in this set, how to render the DOM) lives in the orchestrator.
   */
  labelSlugs: readonly string[];
  labelPositionsRef: RefObject<LabelPositionMap>;
}

/* ─── Scratch objects reused across frames ──────────────────────
   three.js APIs mutate Matrix4 / Vector3 / Color in place. Allocating
   a fresh one per instance per frame would balloon GC cost at 6000+
   nodes × 60fps. Module-level scratch is safe because `useFrame` runs
   one tick at a time.
   ─────────────────────────────────────────────────────────────── */
const _matrix = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _projVec = new THREE.Vector3();

/**
 * Detect light/dark theme via the `data-theme` attribute our globals.css
 * uses as its theme switch. Re-evaluates when the attribute changes so
 * WebGL-side colors / light intensity track the rest of the UI.
 */
function useThemeMode(): "light" | "dark" {
  const [mode, setMode] = useState<"light" | "dark">(() => {
    if (typeof document === "undefined") return "light";
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  });
  useEffect(() => {
    if (typeof document === "undefined") return;
    const update = () => {
      setMode(
        document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light",
      );
    };
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, []);
  return mode;
}

/**
 * Node + edge scene graph. Factored out so we can sit it inside a single
 * `<Canvas>` and share refs cleanly.
 */
function NetworkScene({
  nodes,
  edgeIndices,
  morph,
  zoom,
  panX,
  panY,
  userRotX,
  userRotY,
  autoRotateEnabledRef,
  hoveredSlug,
  highlightedSlugs,
  onHoverChange,
  onSelect,
  labelSlugs,
  labelPositionsRef,
  theme,
}: MasteryNetworkCanvasProps & { theme: "light" | "dark" }) {
  const groupRef = useRef<THREE.Group>(null);
  const instancedRef = useRef<THREE.InstancedMesh>(null);
  const lineRef = useRef<THREE.LineSegments>(null);
  const edgeGeomRef = useRef<THREE.BufferGeometry>(null);
  const edgePosAttrRef = useRef<THREE.BufferAttribute | null>(null);

  const { size } = useThree();

  /* Theme-derived edge params only — node color comes straight from the
     instanceColor buffer via MeshBasicMaterial (see material comment
     below) so it doesn't need ambient/directional light intensities
     anymore. Dark mode still needs slightly brighter edges so the
     connection hints stay visible against the dark panel. */
  const edgeColor = theme === "dark" ? "#c4b294" : "#6b4d2c";
  const edgeOpacity = theme === "dark" ? 0.22 : 0.26;

  const count = nodes.length;

  /* Pre-compute both target layouts. These are pure functions of nodes,
     so we only redo them when the nodes array actually changes. */
  const pos2D = useMemo<Vec3[]>(
    () => computeStructuredGrid(nodes, { width: GRID_WIDTH, height: GRID_HEIGHT }),
    [nodes],
  );
  const pos3D = useMemo<Vec3[]>(
    () => computeSphereLayout(nodes, { radius: SPHERE_RADIUS }),
    [nodes],
  );

  /* Per-instance radii — larger for weak words (matches legacy SVG). */
  const radii = useMemo(() => {
    const arr = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Weak (R≈0) → 2.3×, strong (R=1) → 1×. Slightly narrower spread
      // than the SVG (which went up to 9px vs 4px) so the dense 6000-node
      // view doesn't clump into blobs.
      arr[i] = BASE_NODE_RADIUS * (1 + (1 - nodes[i].retrievability) * 1.3);
    }
    return arr;
  }, [nodes, count]);

  /* Base color attribute — set once on (re)mount. Per-instance highlight
     tinting happens in the frame loop via setColorAt.
     NOTE: three.js r152+ defaults outputColorSpace to SRGBColorSpace, meaning
     the shader expects *linear* inputs and applies linear→sRGB on output.
     `THREE.Color.set("#hex")` parses hex as sRGB and stores it verbatim, so
     we must call `convertSRGBToLinear()` before writing to the instance
     buffer. Without it, the colors render two-stops muted (the "pure black"
     symptom happens when this is combined with `vertexColors=true` pulling
     a missing geometry color attribute of zeros). */
  const baseColors = useMemo(() => {
    const arr = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      c.set(getRetrievabilityColor(nodes[i].retrievability));
      c.convertSRGBToLinear();
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    return arr;
  }, [nodes, count]);

  /* Slug → index reverse map (for instanceId → slug + highlight set lookup). */
  const slugToIndex = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < count; i++) m.set(nodes[i].slug, i);
    return m;
  }, [nodes, count]);

  /* Allocate the edge position buffer sized exactly for our pruned edges.
     It's rewritten every frame during morph, left untouched once settled.
     Stored in a BufferAttribute that we hand to the geometry via the
     `attach="attributes-position"` prop. */
  const edgePositions = useMemo(
    () => new Float32Array((edgeIndices.length / 2) * 2 * 3),
    [edgeIndices],
  );

  const rotationRef = useRef(0);
  const prevMorphRef = useRef(-1);

  useFrame((state, delta) => {
    const mesh = instancedRef.current;
    if (!mesh) return;
    const m = morph.get();
    const z = zoom.get();
    const px = panX.get();
    const py = panY.get();
    const rx = userRotX.get();
    const ry = userRotY.get();

    /* Apply group-level transforms each frame. Scaling is uniform zoom;
       position is pan (2D-mode only, faded out by `1 - m`); rotation is
       user drag (3D-mode only, scaled by `m`). Writes are cheap because
       three.js groups compare against cached values. We explicitly call
       updateMatrixWorld so the label projection below sees a fresh world
       matrix (useFrame runs before the renderer updates world matrices). */
    const group = groupRef.current;
    if (group) {
      group.scale.setScalar(z);
      group.position.set(px * (1 - m), py * (1 - m), 0);
      group.rotation.set(rx * m, ry * m, 0);
      group.updateMatrixWorld();
    }

    /* Advance Y-axis auto-rotation only once the sphere is fully formed
       AND the orchestrator hasn't disabled it (user is dragging, or just
       finished dragging). Multiplying by `m` in the lerp below means
       partial-morph still gets scaled rotation, so there's no jump as
       `m` crosses the threshold. */
    if (m > 0.95 && (autoRotateEnabledRef.current ?? true)) {
      rotationRef.current += delta * ROTATION_SPEED;
    }
    const cosA = Math.cos(rotationRef.current);
    const sinA = Math.sin(rotationRef.current);

    /* Short-circuit: if morph and rotation didn't meaningfully change,
       skip the full instance rewrite. Keeps the idle 2D view at ~0% GPU.
       Group transforms (scale/pan/rot) are handled above and don't need
       per-instance rewrites — only when per-instance positions themselves
       must be recomputed (morph transition or auto-rotation spinning). */
    const rotating = m > 0.95 && (autoRotateEnabledRef.current ?? true);
    const needsRewrite =
      rotating ||
      Math.abs(m - prevMorphRef.current) > 0.0005 ||
      state.clock.elapsedTime < 0.1; // first frame mount
    prevMorphRef.current = m;

    if (needsRewrite) {
      /* Rewrite every instance matrix for this frame's morph value. */
      for (let i = 0; i < count; i++) {
        const a = pos2D[i];
        const b = pos3D[i];
        // Rotate the 3D target around Y before lerping. Multiplying the
        // rotation effect by `m` means `rotation === 0` contribution at
        // m=0 — the 2D grid is unaffected by the running rotation clock.
        const bx = b.x * cosA - b.z * sinA;
        const bz = b.x * sinA + b.z * cosA;
        // Effective 3D position: pre-rotation b blended into post-rotation
        // b by how much we've fully committed to 3D mode. At m=1 it's
        // fully rotated; at m=0 there's no rotation contribution anyway
        // (the lerp fraction of b-channel is 0).
        _pos.set(
          a.x + (bx - a.x) * m,
          a.y + (b.y - a.y) * m,
          a.z + (bz - a.z) * m,
        );
        const r = radii[i];
        _scale.setScalar(r / BASE_NODE_RADIUS);
        _matrix.compose(_pos, _quat, _scale);
        mesh.setMatrixAt(i, _matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      // Rough bounding sphere — expands to cover both grid and rotated globe.
      mesh.computeBoundingSphere();
    }

    /* Rewrite the edge endpoint buffer same way. Reads the instance
       matrix of each endpoint to avoid recomputing the lerp. */
    if (needsRewrite && edgeIndices.length > 0 && edgePosAttrRef.current) {
      const posAttr = edgePosAttrRef.current;
      for (let e = 0; e < edgeIndices.length; e += 2) {
        const ai = edgeIndices[e];
        const bi = edgeIndices[e + 1];
        mesh.getMatrixAt(ai, _matrix);
        const ax = _matrix.elements[12];
        const ay = _matrix.elements[13];
        const az = _matrix.elements[14];
        mesh.getMatrixAt(bi, _matrix);
        const bx = _matrix.elements[12];
        const by = _matrix.elements[13];
        const bz = _matrix.elements[14];
        const base = (e / 2) * 6;
        edgePositions[base] = ax;
        edgePositions[base + 1] = ay;
        edgePositions[base + 2] = az;
        edgePositions[base + 3] = bx;
        edgePositions[base + 4] = by;
        edgePositions[base + 5] = bz;
      }
      posAttr.needsUpdate = true;
    }

    /* Per-instance color highlight: dim non-neighbors when `hoveredSlug`
       is present, full intensity otherwise. We update colors every frame
       because the work is cheap (count × 3 float copies) and short-
       circuiting this would require yet another ref-comparison branch. */
    const color = mesh.instanceColor;
    if (color) {
      const hi = highlightedSlugs;
      for (let i = 0; i < count; i++) {
        const baseR = baseColors[i * 3];
        const baseG = baseColors[i * 3 + 1];
        const baseB = baseColors[i * 3 + 2];
        if (!hi || hi.size === 0) {
          color.setXYZ(i, baseR, baseG, baseB);
        } else {
          const slug = nodes[i].slug;
          const keep = slug === hoveredSlug || hi.has(slug);
          if (keep) {
            color.setXYZ(i, baseR, baseG, baseB);
          } else {
            // 25% brightness of base — matches legacy `opacity(0.25)` filter.
            color.setXYZ(i, baseR * 0.25, baseG * 0.25, baseB * 0.25);
          }
        }
      }
      color.needsUpdate = true;
    }

    /* Project each label slug's current world position to CSS pixels.
       The orchestrator's rAF loop reads this shared map to position HTML
       labels — this function is the only place the canvas writes to it.
       With the cap at ~150 labels this costs under half a millisecond
       per frame even on cold phones. We apply the group's full world
       matrix so pan / rotation / scale are all accounted for. */
    const lpMap = labelPositionsRef.current;
    if (lpMap && labelSlugs.length > 0 && group) {
      const halfW = size.width * 0.5;
      const halfH = size.height * 0.5;
      for (let si = 0; si < labelSlugs.length; si++) {
        const slug = labelSlugs[si];
        const idx = slugToIndex.get(slug);
        if (idx === undefined) continue;
        mesh.getMatrixAt(idx, _matrix);
        _projVec.setFromMatrixPosition(_matrix);
        _projVec.applyMatrix4(group.matrixWorld);
        _projVec.project(state.camera);
        const visible =
          _projVec.x >= -1 &&
          _projVec.x <= 1 &&
          _projVec.y >= -1 &&
          _projVec.y <= 1 &&
          _projVec.z > -1 &&
          _projVec.z < 1;
        lpMap.set(slug, {
          x: halfW + _projVec.x * halfW,
          y: halfH - _projVec.y * halfH,
          visible,
        });
      }
      // Any slug in the map that is NOT in the current labelSlugs should
      // be dropped so stale entries don't keep appearing when the LOD
      // set shrinks (e.g. user hovers off a dot). Small N so O(N) is fine.
      if (lpMap.size > labelSlugs.length) {
        const keep = new Set(labelSlugs);
        for (const k of Array.from(lpMap.keys())) {
          if (!keep.has(k)) lpMap.delete(k);
        }
      }
    } else if (lpMap && lpMap.size > 0) {
      lpMap.clear();
    }
  });

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (event.instanceId === undefined) return;
    const node = nodes[event.instanceId];
    if (!node) return;
    onHoverChange({
      slug: node.slug,
      clientX: event.nativeEvent.clientX,
      clientY: event.nativeEvent.clientY,
    });
  };

  const handlePointerLeave = () => {
    onHoverChange(null);
  };

  /* Robust click detection that does NOT rely on r3f's onClick event
     synthesis. When the orchestrator wraps us with a drag gesture
     listener, r3f's onClick gets unreliable (it races with DOM click
     suppression after pointer moves, or with touch-action capture).
     Instead we pair r3f's onPointerDown + onPointerUp: r3f raycasts
     on both, giving us the exact instance under the pointer at each
     moment. Matching ids = user clicked that specific node. */
  const pointerDownInstanceRef = useRef<number | null>(null);

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (event.instanceId === undefined) return;
    pointerDownInstanceRef.current = event.instanceId;
  };

  const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
    const down = pointerDownInstanceRef.current;
    pointerDownInstanceRef.current = null;
    if (down === undefined || down === null) return;
    if (event.instanceId === undefined) return;
    if (event.instanceId !== down) return;
    const node = nodes[event.instanceId];
    if (!node) return;
    onSelect(node.slug);
  };

  /* Kept as a final fallback. In clean-scene scenarios (locked mode)
     r3f's onClick does fire; keeping it avoids any regression there.
     `onSelect` is idempotent against repeat calls with the same slug
     \u2014 React bails out of rerender when `previewSlug` state is stable. */
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (event.instanceId === undefined) return;
    const node = nodes[event.instanceId];
    if (!node) return;
    event.stopPropagation();
    onSelect(node.slug);
  };

  void slugToIndex; // reserved for keyboard focus routing

  return (
    <>
      <group ref={groupRef}>
        <instancedMesh
          ref={instancedRef}
          args={[undefined, undefined, count]}
          onPointerMove={handlePointerMove}
          onPointerOut={handlePointerLeave}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onClick={handleClick}
        >
          <sphereGeometry args={[BASE_NODE_RADIUS, NODE_SPHERE_SEGMENTS, NODE_SPHERE_SEGMENTS]} />
          {/* MeshBasicMaterial on purpose: the previous MeshStandardMaterial
              ran full PBR with ambient + directional lights, which multiplies
              the instance color by (ambient + NdotL * directional) — under
              typical light setups that's ~0.4–0.6 of the raw color, so a
              saturated `#16a34a` green renders as a dull olive and the five
              retrievability bands collapse into one muddy greenish blob.
              MeshBasicMaterial skips lighting entirely and outputs
              `diffuseColor * instanceColor` directly — 1:1 color reproduction,
              full 5-band contrast, GitHub-heatmap-style flat shading.
              Instance color wiring (USE_INSTANCING_COLOR) works exactly the
              same on basic vs standard material. */}
          <meshBasicMaterial toneMapped={false} />
          <instancedBufferAttribute
            attach="instanceColor"
            args={[baseColors, 3]}
            /* Not using args above for live updates; the frame loop mutates
               instanceColor in place and sets .needsUpdate. The initial
               buffer comes in via the args tuple. */
          />
        </instancedMesh>
        {edgeIndices.length > 0 && (
          <lineSegments ref={lineRef} frustumCulled={false}>
            <bufferGeometry ref={edgeGeomRef}>
              <bufferAttribute
                ref={(attr) => {
                  edgePosAttrRef.current = attr;
                }}
                attach="attributes-position"
                args={[edgePositions, 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial color={edgeColor} transparent opacity={edgeOpacity} />
          </lineSegments>
        )}
      </group>
    </>
  );
}

export function MasteryNetworkCanvas(props: MasteryNetworkCanvasProps) {
  const theme = useThemeMode();
  return (
    <Canvas
      camera={{ position: [0, 0, CAMERA_Z], fov: FOV }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
    >
      <NetworkScene {...props} theme={theme} />
    </Canvas>
  );
}
