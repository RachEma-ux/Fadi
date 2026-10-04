/**
 * Effets de bord des exports dans le navigateur (seul fichier du module qui touche le DOM) : téléchargement par
 * lien `download`, rastérisation d'un SVG en PNG (image → canvas → `toBlob`, fond blanc), fenêtre d'impression,
 * enregistrement au catalogue des documents (`api.registerDrawingExport`, mécanisme existant). Mince par choix :
 * tout ce qui se teste est dans `exports/` (pur).
 */
import { api } from "../../../lib/api";
import type { EffetsExport } from "./outils/exports";

function telecharger(nom: string, contenu: Blob): void {
  const url = URL.createObjectURL(contenu);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function rasteriser(svg: string, largeur: number, hauteur: number): Promise<Blob> {
  return new Promise((resoudre, rejeter) => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = largeur;
      canvas.height = hauteur;
      const g = canvas.getContext("2d");
      if (!g) return rejeter(new Error("canvas 2D indisponible"));
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, largeur, hauteur);
      g.drawImage(image, 0, 0, largeur, hauteur);
      canvas.toBlob((b) => (b ? resoudre(b) : rejeter(new Error("rastérisation refusée par le navigateur"))), "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      rejeter(new Error("SVG illisible par le navigateur"));
    };
    image.src = url;
  });
}

function imprimer(html: string): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  // Laisse le temps au SVG d'être mis en page avant la boîte d'impression.
  w.setTimeout(() => w.print(), 100);
  return true;
}

export const EFFETS_NAVIGATEUR: EffetsExport = {
  telecharger,
  rasteriser,
  imprimer,
  enregistrer: (projetId, e) => api.registerDrawingExport(projetId, e),
  maintenant: () => new Date(),
};
