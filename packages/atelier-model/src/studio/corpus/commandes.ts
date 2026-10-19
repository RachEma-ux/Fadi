import type { StudioCommand, StudioDocument } from "../document-2d.js";

/**
 * Commandes `studio-commands/1` qui recréent un document du corpus depuis un document vide, dans un ordre où toute
 * référence précède ce qui la vise : calques, objets, architecture (dans l'ordre du document), cotes, annotations, solides. Sert aux
 * recettes qui posent un corpus par l'API (S6, S7) ; un test contrôle que leur application rend le document à l'identique.
 */
export function commandesDuDocument(doc: StudioDocument): StudioCommand[] {
  const out: StudioCommand[] = [];
  for (const l of doc.layers ?? []) out.push({ toolId: "studio.calque.creer", params: l });
  for (const o of doc.objects) {
    switch (o.type) {
      case "line": out.push({ toolId: "studio.dessin.ligne", params: o }); break;
      case "rectangle": out.push({ toolId: "studio.dessin.rectangle", params: o }); break;
      case "circle": out.push({ toolId: "studio.dessin.cercle", params: o }); break;
      case "arc": out.push({ toolId: "studio.dessin.arc", params: o }); break;
      case "polyline": out.push({ toolId: "studio.dessin.polyligne", params: o }); break;
    }
  }
  // Ordre du document : dans le corpus, un mur précède toujours ses ouvertures.
  for (const a of doc.architecture ?? []) out.push(a.type === "wall" ? { toolId: "studio.architecture.mur", params: a } : { toolId: "studio.architecture.ouverture", params: a });
  for (const d of doc.dimensions ?? []) out.push({ toolId: "studio.dessin.cote", params: d });
  for (const a of doc.annotations ?? []) out.push(a.type === "text" ? { toolId: "studio.dessin.texte", params: a } : { toolId: "studio.dessin.cote-angulaire", params: a });
  for (const s of doc.solides ?? []) out.push(s.type === "box" ? { toolId: "studio.solide.boite", params: s } : { toolId: "studio.solide.prisme", params: s });
  return out;
}
