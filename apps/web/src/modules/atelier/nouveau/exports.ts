/**
 * Exports de l'Atelier (repris de l'ancien moteur à la bascule) : DXF du niveau (repère local, origine cadastrale en
 * commentaire), SVG du plan affiché, CSV des quantités, modèle JSON, PNG de la vue 3D. Chaque export est téléchargé
 * ET enregistré au catalogue des documents (niveau, vue et révision stampés par le serveur).
 */
import { csvQuantites, dxfNiveau, type ModeleAtelier } from "@parcours/atelier-model";
import { api } from "../../../lib/api";

export type TypeExport = "dxf" | "svg" | "csv" | "json" | "png";

declare global {
  interface Window {
    /** Journal des exports enregistrés pendant la session (contrôles de recette). */
    __fadiExports?: { kind: string; fileName: string; id: string }[];
  }
}

const nomFichier = (base: string) => base.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_");

function telecharger(blob: Blob, nom: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function svgDuPlan(): Blob | null {
  const svg = document.querySelector<SVGSVGElement>(".atelier-n .plan2d");
  if (!svg) return null;
  const copie = svg.cloneNode(true) as SVGSVGElement;
  copie.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const r = svg.getBoundingClientRect();
  copie.setAttribute("width", String(Math.round(r.width)));
  copie.setAttribute("height", String(Math.round(r.height)));
  copie.querySelectorAll(".plan-apercu").forEach((n) => n.remove());
  return new Blob([new XMLSerializer().serializeToString(copie)], { type: "image/svg+xml" });
}

export async function exporter(type: TypeExport, contexte: { projectId: string; code: string; etat: ModeleAtelier; niveauId: string | null; mode: "2d" | "3d" | "documents" }): Promise<string> {
  const niveau = contexte.niveauId ? contexte.etat.niveaux[contexte.niveauId] : undefined;
  const base = nomFichier(`Atelier_${contexte.code}${niveau ? `_${niveau.nom}` : ""}`);
  let blob: Blob | null = null;
  let nom = "";
  // Vue au moment de l'export, au format du catalogue (`tech` = dessin technique, `mode` = vue 3D).
  let vue: Record<string, unknown> = {};
  switch (type) {
    case "dxf":
      if (!contexte.niveauId) throw new Error("Choisissez un niveau à exporter.");
      blob = new Blob([dxfNiveau(contexte.etat, contexte.niveauId)], { type: "application/dxf" });
      nom = `${base}.dxf`;
      vue = { tech: "plan" };
      break;
    case "svg":
      blob = svgDuPlan();
      if (!blob) throw new Error("Le plan n'est pas affiché : passez en vue Plan pour l'exporter en SVG.");
      nom = `${base}.svg`;
      vue = { tech: "plan" };
      break;
    case "csv":
      blob = new Blob([csvQuantites(contexte.etat)], { type: "text/csv;charset=utf-8" });
      nom = `${nomFichier(`Atelier_${contexte.code}`)}_quantites.csv`;
      break;
    case "json":
      blob = new Blob([JSON.stringify({ contrat: "modele-atelier/1", modele: contexte.etat }, null, 1)], { type: "application/json" });
      nom = `${nomFichier(`Atelier_${contexte.code}`)}_modele.json`;
      break;
    case "png": {
      const { captureVue3D } = await import("./vue3d/scene3d");
      blob = await captureVue3D();
      if (!blob) throw new Error("La vue 3D n'est pas ouverte : passez en 3D pour exporter l'image.");
      nom = `${base}_vue.png`;
      vue = { mode: "3D" };
      break;
    }
  }
  telecharger(blob, nom);
  const enregistre = await api.registerDrawingExport(contexte.projectId, { blob, fileName: nom, kind: type, levelId: contexte.niveauId, levelName: niveau?.nom ?? null, view: vue });
  window.__fadiExports = [...(window.__fadiExports ?? []), { kind: type, fileName: nom, id: enregistre.id }];
  return nom;
}
