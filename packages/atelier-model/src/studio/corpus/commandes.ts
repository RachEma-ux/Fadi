import type { StudioCommand, StudioDocument } from "../document-2d.js";
import type { StudioSolid } from "../objets-3d/solides.js";

/**
 * Commandes `studio-commands/1` qui recréent un document du corpus depuis un document vide, dans un ordre où toute
 * référence précède ce qui la vise : calques, objets, architecture (dans l'ordre du document), cotes, annotations, solides,
 * solides exacts (opérandes posés comme solides, puis le booléen avec le résultat du noyau, que le serveur recalcule),
 * graphismes, sources déclarées. Sert aux recettes qui posent un corpus par l'API (S6, S7, références visuelles) ; un test
 * contrôle que leur application rend le document à l'identique.
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
  const solide = (s: StudioSolid): StudioCommand => (s.type === "box" ? { toolId: "studio.solide.boite", params: s } : { toolId: "studio.solide.prisme", params: s });
  for (const s of doc.solides ?? []) out.push(solide(s));
  for (const e of doc.exacts ?? []) {
    const [a, b] = e.operandes;
    if (a.type === "exact" || b.type === "exact") throw new Error(`corpus : opérande exact imbriqué non pris en charge (${e.id})`);
    out.push(solide(a), solide(b), { toolId: "studio.solide.booleen", params: { id: e.id, operation: e.operation, operandes: [a.id, b.id], resultat: e.resultat } });
  }
  for (const g of doc.graphismes ?? []) out.push({ toolId: "studio.graphisme.creer", params: g });
  for (const src of doc.sources ?? []) out.push({ toolId: "studio.source.declarer", params: src });
  return out;
}
