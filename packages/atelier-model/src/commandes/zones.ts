/**
 * Appartenance aux zones (D-056, fiche DA-07-17) : `zone.affecter` { zoneId, ajouter?, retirer? } crée ou retire
 * des relations « contient » d'une zone vers des pièces, des espaces ou d'autres zones (zones imbriquées), de
 * n'importe quel niveau (zones sur plusieurs niveaux). Refus nominatifs : objet inconnu, classe non admise, zone
 * dans elle-même, cycle d'imbrication, membre déjà présent ou absent. Aucune règle d'affectation n'est appliquée :
 * l'appartenance est déclarée, jamais déduite.
 */
import type { ModeleAtelier, Relation } from "../modele.js";
import { effetsVides, ErreurCommande, lire, type ContexteCommande, type ResultatCommande } from "./base.js";

type Brut = Record<string, unknown>;

const MEMBRES = ["piece", "espace", "zone"];

/** Zones contenues (directement ou non) par `zoneId`, via les relations « contient ». */
export function sousZones(etat: ModeleAtelier, zoneId: string): string[] {
  const vues = new Set<string>();
  const pile = [zoneId];
  while (pile.length) {
    const z = pile.pop()!;
    for (const r of Object.values(etat.relations)) {
      if (r.kind !== "contient" || r.sourceId !== z || etat.objets[r.targetId]?.classe !== "zone" || vues.has(r.targetId) || r.targetId === zoneId) continue;
      vues.add(r.targetId);
      pile.push(r.targetId);
    }
  }
  return [...vues];
}

export function affecterZone(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande): ResultatCommande {
  const zoneId = lire.chaine(p, "zoneId");
  if (etat.objets[zoneId]?.classe !== "zone") throw new ErreurCommande("precondition", "zoneId", `zone inconnue : ${zoneId}`);
  const liste = (cle: string): string[] => {
    const v = p[cle];
    if (v === undefined) return [];
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw new ErreurCommande("invalide", cle, `« ${cle} » : liste d'identifiants`);
    return [...new Set(v as string[])];
  };
  const ajouter = liste("ajouter");
  const retirer = liste("retirer");
  if (!ajouter.length && !retirer.length) throw new ErreurCommande("invalide", "ajouter", "rien à ajouter ni à retirer");
  const lien = (cible: string) => Object.values(etat.relations).find((r) => r.kind === "contient" && r.sourceId === zoneId && r.targetId === cible);
  let relations = { ...etat.relations };
  const effets = effetsVides();
  for (const id of retirer) {
    const r = lien(id);
    if (!r) throw new ErreurCommande("precondition", "retirer", `${id} n'appartient pas à la zone ${zoneId}`);
    delete relations[r.id];
    effets.supprimes.push(r.id);
  }
  for (const id of ajouter) {
    const o = etat.objets[id];
    if (!o) throw new ErreurCommande("precondition", "ajouter", `objet inconnu : ${id}`);
    if (!MEMBRES.includes(o.classe)) throw new ErreurCommande("precondition", "ajouter", `${id} (${o.classe}) : une zone contient des pièces, des espaces ou d'autres zones`);
    if (id === zoneId) throw new ErreurCommande("precondition", "ajouter", "une zone ne se contient pas elle-même");
    if (lien(id)) throw new ErreurCommande("precondition", "ajouter", `${id} appartient déjà à la zone ${zoneId}`);
    if (o.classe === "zone" && sousZones({ ...etat, relations }, id).includes(zoneId)) throw new ErreurCommande("precondition", "ajouter", `${id} contient déjà ${zoneId} : l'imbrication ferait un cycle`);
    const rid = ctx.ids.nouveau("relation");
    const r: Relation = { id: rid, kind: "contient", sourceId: zoneId, targetId: id, params: {} };
    relations = { ...relations, [rid]: r };
    effets.crees.push(rid);
  }
  effets.modifies.push(zoneId);
  return { etat: { ...etat, relations }, effets };
}
