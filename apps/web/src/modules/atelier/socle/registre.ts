/** Registre des outils du nouvel Atelier (contrat `RegistreOutils`, figé au lot 3a). */
import { NIVEAUX_AFFICHAGE, type DefinitionOutil, type NiveauAffichage, type RegistreOutils } from "./contrats";

/** Minuscules sans accents, pour la recherche de palette. */
export function normaliser(texte: string): string {
  return texte.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

export function creerRegistre(): RegistreOutils {
  const outils = new Map<string, DefinitionOutil>();
  const raccourcis = new Map<string, string>();
  return {
    enregistrer(outil) {
      if (outils.has(outil.id)) throw new Error(`Registre des outils : identifiant « ${outil.id} » déjà enregistré`);
      if (outil.raccourci) {
        const pris = raccourcis.get(outil.raccourci.toLowerCase());
        if (pris) throw new Error(`Registre des outils : raccourci « ${outil.raccourci} » déjà pris par « ${pris} »`);
        raccourcis.set(outil.raccourci.toLowerCase(), outil.id);
      }
      outils.set(outil.id, outil);
    },
    lister: () => [...outils.values()],
    trouver: (id) => outils.get(id) ?? null,
    rechercher(texte: string, niveau: NiveauAffichage) {
      const rang = NIVEAUX_AFFICHAGE.indexOf(niveau);
      const visibles = [...outils.values()].filter((o) => NIVEAUX_AFFICHAGE.indexOf(o.niveau) <= rang);
      const q = normaliser(texte);
      if (!q) return visibles;
      const score = (o: DefinitionOutil): number => {
        const libelle = normaliser(o.libelle);
        if (libelle.startsWith(q)) return 0;
        if (libelle.includes(q)) return 1;
        if (o.synonymes.some((s) => normaliser(s).includes(q))) return 2;
        if (normaliser(`${o.aide.action} ${o.aide.exemple}`).includes(q)) return 3;
        return -1;
      };
      return visibles
        .map((o) => [o, score(o)] as const)
        .filter(([, s]) => s >= 0)
        .sort((a, b) => a[1] - b[1] || a[0].libelle.localeCompare(b[0].libelle, "fr"))
        .map(([o]) => o);
    },
  };
}
