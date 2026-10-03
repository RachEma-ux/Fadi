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
  | "drop";

const PATHS: Record<IconName, string> = {
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
};

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
