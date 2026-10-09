/**
 * Graphes de génération du projet (P2-8) : définitions `graphe` du modèle — versionnées avec lui, disponibles hors ligne
 * et sur le serveur, jamais exécutées ici (la proposition passe par `proposerGraphe` et la boucle contrôlée).
 */
import type { Definition, ModeleAtelier } from "../modele.js";
import { effetsVides, ErreurCommande, lire, type Reducteur } from "./base.js";
import { ErreurScript } from "../automatisation/scripts.js";
import { GRAPHES_INTEGRES, validerGraphe, type GrapheGeneration } from "../automatisation/graphes.js";

type Brut = Record<string, unknown>;

/** Graphes du projet (définitions `graphe`), avec leur version de définition. */
export function graphesDuProjet(etat: Pick<ModeleAtelier, "definitions">): GrapheGeneration[] {
  return Object.values(etat.definitions)
    .filter((d) => d.classe === "graphe")
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((d) => ({ ...(d.params as unknown as Omit<GrapheGeneration, "id" | "nom" | "version">), id: d.id, nom: d.nom, version: d.version }));
}

/** Graphe intégré ou du projet par identifiant. */
export function grapheDe(etat: Pick<ModeleAtelier, "definitions">, id: string): GrapheGeneration | null {
  return GRAPHES_INTEGRES.find((g) => g.id === id) ?? graphesDuProjet(etat).find((g) => g.id === id) ?? null;
}

export const reducteursGraphes: Record<string, Reducteur> = {
  "graphe.definir": (etat, p) => {
    let g: GrapheGeneration;
    try {
      g = validerGraphe({ ...(p as Brut), version: 1 });
    } catch (err) {
      if (err instanceof ErreurScript) throw new ErreurCommande("invalide", err.chemin, err.message);
      throw err;
    }
    if (GRAPHES_INTEGRES.some((x) => x.id === g.id)) throw new ErreurCommande("precondition", "id", "identifiant réservé à un graphe intégré");
    const existante = etat.definitions[g.id];
    if (existante && existante.classe !== "graphe") throw new ErreurCommande("precondition", "id", `${g.id} n'est pas un graphe`);
    const def: Definition = { id: g.id, classe: "graphe", nom: g.nom, params: { description: g.description, noeuds: g.noeuds, liens: g.liens } as unknown as Record<string, unknown>, version: (existante?.version ?? 0) + 1 };
    const effets = effetsVides();
    (existante ? effets.modifies : effets.crees).push(g.id);
    return { etat: { ...etat, definitions: { ...etat.definitions, [g.id]: def } }, effets };
  },
  "graphe.supprimer": (etat, p) => {
    const id = lire.chaine(p, "id");
    const d = etat.definitions[id];
    if (!d || d.classe !== "graphe") throw new ErreurCommande("precondition", "id", `graphe inconnu : ${id}`);
    const definitions = { ...etat.definitions };
    delete definitions[id];
    const effets = effetsVides();
    effets.supprimes.push(id);
    return { etat: { ...etat, definitions }, effets };
  },
};
