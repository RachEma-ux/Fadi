/**
 * Icônes de l'enveloppe (barre latérale, accueil) : traits simples, 24 × 24,
 * dessinés ici plutôt qu'empruntés à une bibliothèque — même épaisseur de
 * trait partout, couleur héritée du texte (`currentColor`).
 */
export type IconName =
  | "home"
  | "folder"
  | "route"
  | "atelier"
  | "file"
  | "book"
  | "sparkle"
  | "gear"
  | "upload"
  | "plus"
  | "cube"
  | "arrow-right"
  | "chevron-right"
  | "chevron-down"
  | "check"
  | "site"
  | "programme"
  | "design"
  | "proof"
  | "scale"
  | "flag"
  | "stairs"
  | "drop"
  | "search"
  | "people"
  | "studio"
  | "studio-pointer"
  | "studio-line"
  | "studio-rectangle"
  | "studio-dimension"
  | "studio-move"
  | "studio-edit"
  | "studio-delete"
  | "studio-layer-add"
  | "studio-layer-edit"
  | "studio-layer-assign"
  | "studio-undo"
  | "studio-redo"
  | "studio-cancel"
  | "studio-save"
  | "studio-frame"
  | "studio-fullscreen"
  | "studio-select-all"
  | "studio-zoom-in"
  | "studio-zoom-out"
  | "studio-snap-vertex"
  | "studio-snap-grid"
  | "studio-export-svg"
  | "studio-export-dxf"
  | "studio-catalog"
  | "studio-palette";

const PATHS: Record<IconName, string> = {
  search: "M10.5 3.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 5 5",
  people: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2",
  home: "M3 11.5 12 4l9 7.5M5.5 10.5V20h13v-9.5M10 20v-5h4v5",
  folder: "M3 7a1.5 1.5 0 0 1 1.5-1.5H9l2 2h8.5A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V7Z",
  route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12-10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8 17h6.5a3.5 3.5 0 0 0 0-7H10a3 3 0 0 1 0-6h5",
  atelier: "M12 3 3 20h18L12 3Zm0 6v7m-3 1h6",
  file: "M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm7 0v5h5M9 13h6M9 17h6",
  book: "M4 5.5A2.5 2.5 0 0 1 6.5 3H12v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5Zm16 0A2.5 2.5 0 0 0 17.5 3H12v15h5.5a2.5 2.5 0 0 1 2.5 2.5V5.5Z",
  sparkle: "M12 3v4m0 10v4M3 12h4m10 0h4M12 7c0 3 2 5 5 5-3 0-5 2-5 5 0-3-2-5-5-5 3 0 5-2 5-5Z",
  gear: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-2.1.2-1.4-.2-1.4-2-.6-.8-1.9 1-1.8-2-2-1.8 1-1.9-.8-.6-2h-2.6l-.6 2-1.9.8-1.8-1-2 2 1 1.8-.8 1.9-2 .6-.2 1.4.2 1.4 2 .6.8 1.9-1 1.8 2 2 1.8-1 1.9.8.6 2h2.6l.6-2 1.9-.8 1.8 1 2-2-1-1.8.8-1.9 2-.6Z",
  upload: "M12 16V4m0 0-4 4m4-4 4 4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3",
  plus: "M12 5v14M5 12h14",
  cube: "M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Zm0 18V12M4 7.5 12 12l8-4.5",
  "arrow-right": "M4 12h16m-6-6 6 6-6 6",
  "chevron-right": "m9 6 6 6-6 6",
  "chevron-down": "m6 9 6 6 6-6",
  check: "m5 12.5 4.5 4.5L19 7.5",
  site: "M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10Zm0-8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  programme: "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z",
  design: "m4 20 4-1L19.5 7.5a2.1 2.1 0 0 0-3-3L5 16l-1 4Zm10.5-13.5 3 3",
  proof: "M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm2 4h8v3H8V7Zm0 6h2m3 0h2m-5 4h2m3 0h2",
  scale: "M12 3v18M4 7h16M6 7l-3 7a3 3 0 0 0 6 0L6 7Zm12 0-3 7a3 3 0 0 0 6 0l-3-7Z",
  flag: "M5 21V4m0 0h11l-2 4 2 4H5",
  stairs: "M4 20h4v-4h4v-4h4V8h4M4 20V8",
  drop: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z",
  studio: "M3 6h11v11H3V6Zm7 4h11v11H10V10Z",
  // Planche 2D de Studio : une icône propre par outil et par commande (règle d'or, D-202).
  "studio-pointer": "M5 3 19 12 12 13 9 20Z",
  "studio-line": "M5 19 19 5M3 17h4v4H3ZM17 3h4v4h-4Z",
  "studio-rectangle": "M4 6h16v12H4ZM2 4h4v4H2ZM18 16h4v4h-4Z",
  "studio-dimension": "M4 7v10M20 7v10M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3",
  "studio-move": "M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3",
  "studio-edit": "M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4",
  "studio-delete": "M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  "studio-layer-add": "M12 3 2 8l10 5 10-5-10-5ZM2 13l10 5 4-2M18 15v6M15 18h6",
  "studio-layer-edit": "M12 3 2 8l10 5 10-5-10-5ZM2 13l10 5 2-1M15 21l1-3 4-4 2 2-4 4-3 1Z",
  "studio-layer-assign": "M12 3 2 8l10 5 10-5-10-5ZM2 13l10 5 10-5M12 22v-6M9 19l3 3 3-3",
  "studio-undo": "M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-3",
  "studio-redo": "M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10h3",
  "studio-cancel": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM8 8l8 8M16 8l-8 8",
  "studio-save": "M5 4h11l3 3v13H5V4ZM8 4v5h7V4M8 20v-6h8v6",
  "studio-frame": "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M9 9h6v6H9Z",
  "studio-fullscreen": "M3 8V3h5M3 3l6 6M21 8V3h-5M21 3l-6 6M3 16v5h5M3 21l6-6M21 16v5h-5M21 21l-6-6",
  "studio-select-all": "M3 3h4M10 3h4M17 3h4v4M21 10v4M21 17v4h-4M14 21h-4M7 21H3v-4M3 14v-4M3 7V3M8 8h8v8H8Z",
  "studio-zoom-in": "M10.5 3.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 5 5M10.5 7.5v6M7.5 10.5h6",
  "studio-zoom-out": "M10.5 3.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 5 5M7.5 10.5h6",
  "studio-snap-vertex": "M4 20 12 6l8 14M9 3h6v6H9ZM12 9v2",
  "studio-snap-grid": "M3 3h18v18H3ZM9 3v18M15 3v18M3 9h18M3 15h18M13 13h4v4h-4Z",
  "studio-export-svg": "M6 3h8l4 4v6M14 3v4h4M6 3v18h6M8 11c2-3 6 3 8 0M17 15v6M14 18l3 3 3-3",
  "studio-export-dxf": "M6 3h8l4 4v6M14 3v4h4M6 3v18h6M8 9h6M8 12h3M11 9v6M17 15v6M14 18l3 3 3-3",
  "studio-catalog": "M4 4h7v7H4ZM13 4h7v7h-7ZM4 13h7v7H4ZM13 16.5h7M16.5 13v7",
  "studio-palette": "M3 5h18v14H3ZM3 9h18M6 13l3 2-3 2M11 17h5",
};

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
