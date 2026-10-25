/**
 * Réexamen des observations Studio lors du contrôle d'une nouvelle révision (EX-086, REF-02 w:p 820) : « Un contrôle de
 * nouvelle révision rapproche les observations antérieures par identité/source/règle et produit un statut de suivi ;
 * la fermeture automatique sur simple disparition d'un objet est interdite. » Règles pures (ni base, ni DOM) : le
 * serveur (`apps/api/src/lib/studio-observations-rapprochement.ts`) les applique à chaque contrôle d'exigences
 * enregistré et sur demande, et consigne chaque résultat (journal en ajout seul) ; l'interface en relit le suivi.
 *
 * Rapprochement, élément par élément de l'observation (jamais deviné) :
 *  - **identité** : objets d'ancrage du commentaire d'origine et liens `objet` — l'identifiant existe-t-il encore dans
 *    la nouvelle révision (forme, cote, annotation, objet architectural, solide) ?
 *  - **source** : liens `metre` (`objet#grandeur`) — l'objet et sa grandeur figurent-ils au métré de la nouvelle révision ?
 *  - **règle** : liens `exigence` — statut de cette exigence dans le contrôle de la nouvelle révision (s'il y en a un et
 *    qu'il a tourné) ; sans contrôle de cette révision, la règle n'est pas réexaminée (jamais supposée satisfaite).
 *  - les liens `revue` (publication figée) ne dépendent pas d'une révision ultérieure : sans objet ici.
 *
 * Statut de suivi de l'observation (priorité décroissante) :
 *  - `objet-disparu` : un élément suivi est absent de la nouvelle révision. L'observation **reste dans son statut** :
 *    elle est marquée explicitement, et seule une décision explicite (recontrôle, clôture motivée) peut la résoudre ;
 *  - `persiste` : une exigence liée reste non satisfaite dans le contrôle de la nouvelle révision ;
 *  - `a-recontroler` : tous les éléments sont retrouvés et aucune règle ne reste non satisfaite (règle satisfaite, non
 *    évaluée ou non réexaminée) : un recontrôle humain tranche ;
 *  - `non-rapprochable` : l'observation ne suit aucun élément identifiable dans une révision.
 * Une observation clôturée n'est pas rapprochée. Aucun statut d'observation n'est modifié ici (`statut` est recopié).
 */
import type { StudioDocument } from "./document-2d.js";
import { quantitesStudio } from "./quantites.js";
import type { ResultatControle, StatutExigence } from "./composition/ecarts.js";

export type DomaineRapprochement = "ancrage" | "objet" | "metre" | "exigence" | "revue";
export type IssueElement = "retrouve" | "disparu" | "regle-non-satisfaite" | "regle-satisfaite" | "regle-non-evaluee" | "regle-non-reexaminee" | "sans-objet";
export type SuiviRapprochement = "objet-disparu" | "persiste" | "a-recontroler" | "non-rapprochable";
export const SUIVIS_RAPPROCHEMENT: readonly SuiviRapprochement[] = ["objet-disparu", "persiste", "a-recontroler", "non-rapprochable"];

export interface ObservationARapprocher {
  readonly id: string;
  /** Statut courant (`ouverte`, `rouverte`, `corrigee`, `recontrolee`, `cloturee`) : recopié, jamais modifié. */
  readonly statut: string;
  /** Objets d'ancrage du commentaire d'origine. */
  readonly objectIds: readonly string[];
  readonly liens: readonly { readonly domaine: "objet" | "metre" | "exigence" | "revue"; readonly ref: string }[];
}

export interface ElementRapproche { readonly domaine: DomaineRapprochement; readonly ref: string; readonly issue: IssueElement }
export interface ResultatRapprochement {
  readonly observationId: string;
  /** Statut de l'observation, inchangé (EX-086 : aucune fermeture automatique). */
  readonly statut: string;
  readonly revisionId: string;
  /** Contrôle d'exigences de la révision employé pour la règle, sinon null. */
  readonly controleId: string | null;
  readonly suivi: SuiviRapprochement;
  readonly elements: readonly ElementRapproche[];
}

/** Identifiants présents dans une révision : formes, cotes, annotations, objets architecturaux, solides. */
export function identitesDuDocument(doc: StudioDocument): Set<string> {
  return new Set([...doc.objects, ...(doc.dimensions ?? []), ...(doc.annotations ?? []), ...(doc.architecture ?? []), ...(doc.solides ?? [])].map((o) => o.id));
}

const issueRegle = (statut: StatutExigence | undefined): IssueElement => {
  switch (statut) {
    case "non-satisfaite": return "regle-non-satisfaite";
    case "satisfaite": return "regle-satisfaite";
    case "non-evaluee": return "regle-non-evaluee";
    // Exigence non utilisée ou absente du contrôle : non réexaminée (jamais supposée satisfaite).
    default: return "regle-non-reexaminee";
  }
};

/**
 * Rapproche les observations (non clôturées) de la nouvelle révision `revision`, avec le contrôle d'exigences de
 * CETTE révision s'il existe (`controle` d'une autre révision : ignoré pour la règle).
 */
export function rapprocherObservations(
  observations: readonly ObservationARapprocher[],
  revision: { id: string; document: StudioDocument },
  controle: { id: string; result: Pick<ResultatControle, "revisionId" | "execution" | "ecarts"> } | null,
): ResultatRapprochement[] {
  const ids = identitesDuDocument(revision.document);
  const metre = quantitesStudio(revision.document);
  const regleValide = controle !== null && controle.result.revisionId === revision.id && controle.result.execution === "execute";
  const out: ResultatRapprochement[] = [];
  for (const o of observations) {
    if (o.statut === "cloturee") continue;
    const elements: ElementRapproche[] = [];
    for (const id of [...new Set(o.objectIds)]) elements.push({ domaine: "ancrage", ref: id, issue: ids.has(id) ? "retrouve" : "disparu" });
    for (const l of o.liens) {
      if (l.domaine === "objet") elements.push({ domaine: "objet", ref: l.ref, issue: ids.has(l.ref) ? "retrouve" : "disparu" });
      else if (l.domaine === "metre") {
        const i = l.ref.lastIndexOf("#");
        const objet = i > 0 ? metre.objets.find((x) => x.objetId === l.ref.slice(0, i)) : undefined;
        const present = objet !== undefined && objet.valeurs.some((v) => v.grandeur === l.ref.slice(i + 1));
        elements.push({ domaine: "metre", ref: l.ref, issue: present ? "retrouve" : "disparu" });
      } else if (l.domaine === "exigence") {
        elements.push({ domaine: "exigence", ref: l.ref, issue: regleValide ? issueRegle(controle!.result.ecarts.find((e) => e.exigenceId === l.ref)?.statut) : "regle-non-reexaminee" });
      } else elements.push({ domaine: "revue", ref: l.ref, issue: "sans-objet" });
    }
    const suivis = elements.filter((e) => e.issue !== "sans-objet");
    const suivi: SuiviRapprochement = suivis.length === 0 ? "non-rapprochable"
      : suivis.some((e) => e.issue === "disparu") ? "objet-disparu"
        : suivis.some((e) => e.issue === "regle-non-satisfaite") ? "persiste"
          : "a-recontroler";
    out.push({ observationId: o.id, statut: o.statut, revisionId: revision.id, controleId: regleValide ? controle!.id : null, suivi, elements });
  }
  return out;
}
