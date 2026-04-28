"use client";

import dynamic from "next/dynamic";

const OmniPalette = dynamic(
  () => import("./OmniPalette").then((m) => m.OmniPalette),
  { ssr: false },
);

export { OmniPalette };
