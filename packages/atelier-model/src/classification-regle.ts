/**
 * Classification en lot par règle (D-112, DA-06-08) : une règle (classe Fadi, type facultatif, niveau facultatif)
 * désigne des objets ; la proposition liste les cibles et les commandes `classification.affecter` d'un seul lot, que
 * l'utilisateur valide ou non — jamais appliquée d'office (R3). Les objets déjà classés dans ce système sont écartés
 * sauf demande explicite ; les objets verrouillés le sont toujours. Pur.
 */
import type { Commande } from "./commandes/index.js";
import { raisonVerrou } from "./commandes/verrous.js";
import type { ModeleAtelier } from "./modele.js";
import type { Classe } from "./ontologie.js";

export interface RegleClassification {
  systeme: string;
  code: string;
  classe: Classe;
  /** Type (définition) des objets visés ; absent : tous les types. */
  definitionId?: string | null;
  niveauId?: string | null;
  /** Remplacer un code déjà posé dans ce système (par défaut : objets déjà classés écartés). */
  remplacer?: boolean;
}

export interface PropositionClassification {
  cibles: string[];
  dejaClasses: string[];
  verrouilles: string[];
  commandes: Commande[];
  label: string;
}

export function proposerClassification(etat: ModeleAtelier, r: RegleClassification): PropositionClassification {
  const systeme = r.systeme.trim();
  const code = r.code.trim();
  const cibles: string[] = [];
  const dejaClasses: string[] = [];
  const verrouilles: string[] = [];
  for (const o of Object.values(etat.objets).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (o.classe !== r.classe) continue;
    if (r.definitionId !== undefined && r.definitionId !== null && o.definitionId !== r.definitionId) continue;
    if (r.niveauId && o.niveauId !== r.niveauId) continue;
    if (raisonVerrou(etat, o)) {
      verrouilles.push(o.id);
      continue;
    }
    const actuel = o.proprietes[`classification:${systeme}`]?.valeur;
    if (actuel !== undefined && !r.remplacer) {
      dejaClasses.push(o.id);
      continue;
    }
    if (actuel === code) continue;
    cibles.push(o.id);
  }
  const commandes: Commande[] = systeme && code && cibles.length ? [{ type: "classification.affecter", params: { ids: cibles, systeme, code } }] : [];
  return { cibles, dejaClasses, verrouilles, commandes, label: `Classer ${cibles.length} objet(s) ${r.classe} : ${systeme} ${code}` };
}
