// Extraction de la scène de mesure depuis les données P.118 du dépôt (aucune valeur inventée).
// Source : apps/api/src/data/examples/p118-native-model.json (domaines floorDesign + levels).
// Le banc ne modifie jamais la source ; il en dérive une scène géométrique minimale, en repère local (m).
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const ici = dirname(fileURLToPath(import.meta.url));
export const racineDepot = resolve(ici, "../../../..");
export const cheminSource = resolve(racineDepot, "apps/api/src/data/examples/p118-native-model.json");

/** Lit P.118 et retourne la scène de mesure + les comptages vérifiés. */
export function chargerSceneP118() {
  const brut = readFileSync(cheminSource);
  const modele = JSON.parse(brut.toString("utf8"));
  const niveauxDecl = modele.domains.levels;
  const fd = modele.domains.floorDesign.levels;
  const niveaux = [];
  const comptes = { niveaux: 0, murs: 0, portes: 0, fenetres: 0, ouvertures: 0, poteaux: 0, escaliers: 0, traces: 0, tracesSolides: 0, tracesAvecHauteur: 0, textes: 0, cotations: 0, pieces: 0 };
  for (const decl of niveauxDecl) {
    const n = fd[decl.id];
    if (!n) throw new Error(`Niveau ${decl.id} absent de floorDesign`);
    const murs = n.walls.map((w) => ({ id: w.id, a: w.a, b: w.b, epaisseur: w.thickness, hauteur: w.height }));
    const ouvertures = [
      ...n.doors.map((o) => ({ id: o.id, genre: "porte", murHoteId: o.hostWallId, t: o.t, largeur: o.width, hauteur: o.height, allege: o.sill ?? 0 })),
      ...n.windows.map((o) => ({ id: o.id, genre: "fenetre", murHoteId: o.hostWallId, t: o.t, largeur: o.width, hauteur: o.height, allege: o.sill ?? 0 })),
    ];
    const poteaux = n.columns.map((c) => ({ id: c.id, p: c.p, largeur: c.width, profondeur: c.depth, hauteur: c.height, angle: c.angle ?? 0 }));
    const escaliers = n.stairs.map((s) => ({ id: s.id, a: s.a, b: s.b, largeur: s.width, hauteur: s.height, decalageBase: s.baseOffset ?? 0, planSeulement: !!s.planReferenceOnly }));
    const traces = n.paths.map((p) => ({
      id: p.id, points: p.points, trous: (p.holes ?? []).map((h) => h.poly ?? h.points ?? []),
      ferme: !!p.closed, solide: !!p.cadSolid, hauteur: p.height, decalageBase: p.baseOffset ?? 0, role: p.role, couleur: p.color,
    }));
    niveaux.push({ id: decl.id, nom: decl.name, elevation: decl.elevation, hauteur: decl.height, murs, ouvertures, poteaux, escaliers, traces });
    comptes.niveaux++;
    comptes.murs += murs.length;
    comptes.portes += n.doors.length;
    comptes.fenetres += n.windows.length;
    comptes.ouvertures += ouvertures.length;
    comptes.poteaux += poteaux.length;
    comptes.escaliers += escaliers.length;
    comptes.traces += traces.length;
    comptes.tracesSolides += traces.filter((t) => t.ferme && t.solide).length;
    comptes.tracesAvecHauteur += traces.filter((t) => t.ferme && t.solide && t.hauteur > 0).length;
    comptes.textes += n.texts.length;
    comptes.cotations += n.dims.length;
    comptes.pieces += n.rooms.length;
  }
  const textes = [];
  for (const decl of niveauxDecl) for (const t of fd[decl.id].texts) textes.push({ id: t.id, texte: t.text });
  return {
    source: {
      chemin: relative(racineDepot, cheminSource),
      sha256: createHash("sha256").update(brut).digest("hex"),
      octets: brut.length,
      version: modele.sourceVersion,
      crs: modele.domains.nativeParcel?.crs ?? null,
    },
    comptes,
    niveaux,
    textes,
  };
}
