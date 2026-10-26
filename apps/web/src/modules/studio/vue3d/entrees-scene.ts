/**
 * Entrées de la scène de rendu de la vue 3D (lot C.2, extraites de `Vue3DStudio.tsx` pour être partagées avec la
 * comparaison avant / après optimisation, AC-005) : ce que la scène incrémentale (`scene-rendu.ts`) reçoit pour chaque
 * objet affiché — volumes en lots (murs, objets extrudés), objets construits seuls (solides libres et exacts, ouvertures,
 * contours, sélection), avec leur aspect (sélection, apparence d'affichage, défaut). Ni React ni DOM : three.js seulement.
 */
import * as THREE from "three";
import { studioApparenceResolue, type StudioDocument, type StudioMesh3d, type StudioModeAffichage } from "@parcours/atelier-model";
import { cleAspect, objetsVolume, preparer, type AspectVolume, type EntreeRendu, type GeometrieObjet } from "./scene-rendu";
import { couleurEntiere } from "./scenes/scenes-ui";

/** Aspect d'un volume : la sélection l'emporte, puis l'apparence d'affichage (objet, sinon calque), puis le défaut. */
export function aspectDe(doc: StudioDocument, mode: StudioModeAffichage, o: { id: string; layerId?: string }, defaut: number, choisi: boolean, double = false): AspectVolume {
  const a = studioApparenceResolue(doc, o.id, o.layerId);
  if (choisi) return { couleur: 0xf0b44c, mode, apparence: false, double };
  return a ? { couleur: couleurEntiere(a.color), ...(a.finish ? { finition: a.finish } : {}), mode, apparence: true, double } : { couleur: defaut, mode, apparence: false, double };
}

/** Volume construit seul : surface (nommée, données de désignation) et arêtes selon le mode. */
export function volumeSeul(g: GeometrieObjet, aspect: AspectVolume, nom: string, donnees: Record<string, string>): THREE.Object3D[] {
  const { surface, aretes } = objetsVolume([preparer(g)], aspect);
  surface.name = nom;
  const objets: THREE.Object3D[] = aretes ? [surface, aretes] : [surface];
  for (const o of objets) Object.assign(o.userData, donnees);
  return objets;
}

/** Ce que la scène de rendu lit : maillage affiché, clés de contenu de ses morceaux, document et réglages courants. */
export interface Lecture {
  mesh: StudioMesh3d;
  /** Clé de projection de chaque morceau affiché (signature de son objet three.js). */
  cle: (id: string) => string;
  doc: StudioDocument;
  mode: StudioModeAffichage;
  selection: string | null;
  selectionArchitecture: string | null;
  /** Objet encore présent dans le document courant (un objet supprimé disparaît sans attendre le maillage suivant). */
  present: (id: string) => boolean;
}

/** Volumes des objets 2D extrudés (en lots) et contours plats (seuls). */
export function entreesContenu(l: Lecture): EntreeRendu[] {
  const out: EntreeRendu[] = [];
  for (const s of l.mesh.solids) {
    if (!l.present(s.id)) continue;
    out.push({ id: s.id, signature: l.cle(s.id), lot: "contenu", instanciable: true, geometrie: s, aspect: aspectDe(l.doc, l.mode, s, s.type === "line" ? 0xd9d2c3 : 0xb9d3cf, false, s.kind === "wall-surface") });
  }
  for (const o of l.mesh.outlines) {
    if (!l.present(o.id)) continue;
    out.push({
      id: o.id, signature: l.cle(o.id), construire: () => {
        const g = new THREE.BufferGeometry().setFromPoints(o.points.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
        const mat = new THREE.LineDashedMaterial({ color: 0x8a6a3a, dashSize: 0.15, gapSize: 0.1 });
        const ligne = o.closed ? new THREE.LineLoop(g, mat) : new THREE.Line(g, mat);
        ligne.computeLineDistances();
        return [ligne];
      },
    });
  }
  return out;
}

/** Solides libres et solides exacts (lot F2), construits seuls et désignables. */
export function entreesLibres(l: Lecture): EntreeRendu[] {
  const libres = (l.mesh.freeSolids ?? []).filter((s) => l.present(s.id)).map((s): EntreeRendu => {
    // Un solide lié « à résoudre » garde sa dernière géométrie, dans une teinte distincte (jamais comme à jour).
    const aspect = aspectDe(l.doc, l.mode, s, s.lien?.etat === "a-resoudre" ? 0xe0a8a0 : 0xc9bde3, s.id === l.selection);
    return { id: s.id, signature: `${l.cle(s.id)}|${cleAspect(aspect)}`, construire: () => volumeSeul(s, aspect, s.id, { solide: s.id }) };
  });
  const exacts = (l.mesh.exacts ?? []).filter((s) => l.present(s.id)).map((s): EntreeRendu => {
    const aspect = aspectDe(l.doc, l.mode, s, 0xa9c7e8, s.id === l.selection);
    return { id: s.id, signature: `${l.cle(s.id)}|${cleAspect(aspect)}`, construire: () => volumeSeul(s, aspect, s.id, { solide: s.id }) };
  });
  return [...libres, ...exacts];
}

/**
 * Murs opaques (en lots, sauf le mur sélectionné, construit seul à sa couleur de sélection) et ouvertures (boîte du
 * vide, translucide, seule) ; chaque objet seul porte l'identifiant de son objet, chaque lot sa table de désignation.
 */
export function entreesArchitecture(l: Lecture): EntreeRendu[] {
  const out: EntreeRendu[] = [];
  for (const a of l.mesh.architecture ?? []) {
    if (!l.present(a.id)) continue;
    const choisi = a.id === l.selectionArchitecture;
    if (a.type === "wall") {
      const aspect = aspectDe(l.doc, l.mode, a, 0xd8d2c4, choisi);
      out.push(choisi
        ? { id: a.id, signature: `${l.cle(a.id)}|${cleAspect(aspect)}`, construire: () => volumeSeul(a, aspect, a.id, { architecture: a.id }) }
        : { id: a.id, signature: l.cle(a.id), lot: "mur", geometrie: a, aspect });
      continue;
    }
    // Le vide d'une ouverture ne prend que l'apparence de l'ouverture elle-même (pas celle du calque de son mur).
    const propre = studioApparenceResolue(l.doc, a.id, undefined);
    const teinte = choisi ? 0xf0b44c : propre?.source === "object" ? couleurEntiere(propre.color) : 0x7fb2d6;
    out.push({
      id: a.id, signature: `${l.cle(a.id)}|${teinte.toString(16)}|${choisi ? 1 : 0}`, construire: () => {
        const g = new THREE.BufferGeometry();
        const p = preparer(a);
        g.setAttribute("position", new THREE.BufferAttribute(p.positions, 3));
        g.setIndex(new THREE.BufferAttribute(p.index, 1));
        const vide = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: teinte, transparent: true, opacity: choisi ? 0.45 : 0.2, depthWrite: false }));
        vide.name = a.id;
        vide.userData.architecture = a.id;
        return [vide];
      },
    });
  }
  return out;
}
