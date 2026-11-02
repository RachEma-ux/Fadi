/**
 * Entrées de la scène de rendu de la vue 3D (lot C.2, extraites de `Vue3DStudio.tsx` pour être partagées avec la
 * comparaison avant / après optimisation, AC-005) : ce que la scène incrémentale (`scene-rendu.ts`) reçoit pour chaque
 * objet affiché — volumes en lots (murs, objets extrudés), objets construits seuls (solides libres et exacts, surfaces
 * libres NURBS et leurs pôles, ouvertures,
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
  // Surfaces libres NURBS (X.1-05) : nappe ouverte (deux faces), bords ; sélectionnée, son polygone de contrôle et un
  // repère par pôle (désignable : `userData.pole`, édition des points de contrôle).
  const surfaces = (l.mesh.surfaces ?? []).filter((s) => l.present(s.id)).map((s): EntreeRendu => {
    const choisie = s.id === l.selection;
    const aspect = aspectDe(l.doc, l.mode, s, 0xa8d8b9, choisie, true);
    return {
      id: s.id, signature: `${l.cle(s.id)}|${cleAspect(aspect)}|${choisie ? "poles" : ""}`, construire: () => {
        const objets = volumeSeul(s, aspect, s.id, { solide: s.id, surface: s.id });
        if (!choisie) return objets;
        const reseau = new THREE.BufferGeometry();
        reseau.setAttribute("position", new THREE.BufferAttribute(new Float32Array(s.controle.segments.flatMap(([a, b]) => { const p = s.controle.points[a]!, q = s.controle.points[b]!; return [p.x, p.y, p.z, q.x, q.y, q.z]; })), 3));
        const polygone = new THREE.LineSegments(reseau, new THREE.LineDashedMaterial({ color: 0x1f6f4a, dashSize: 0.1, gapSize: 0.06 }));
        polygone.computeLineDistances();
        objets.push(polygone);
        const taille = Math.max(0.03, Math.min(0.2, 0.02 * Math.max(...s.vertices.map((v) => Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z))), 1) / 4));
        s.controle.points.forEach((p, k) => {
          const repere = new THREE.Mesh(new THREE.SphereGeometry(taille, 10, 8), new THREE.MeshBasicMaterial({ color: 0x1f6f4a }));
          repere.position.set(p.x, p.y, p.z);
          repere.name = `${s.id}#pole-${k}`;
          Object.assign(repere.userData, { surface: s.id, pole: k });
          objets.push(repere);
        });
        return objets;
      },
    };
  });
  // Surfaces de subdivision (X.1-05) : maillage subdivisé (deux faces si ouvert) ; sélectionnée, son maillage de contrôle
  // et un repère désignable par sommet (`userData.sommet`).
  const subdivisions = (l.mesh.subdivisions ?? []).filter((s) => l.present(s.id)).map((s): EntreeRendu => {
    const choisie = s.id === l.selection;
    const aspect = aspectDe(l.doc, l.mode, s, 0xd8c5a8, choisie, !s.fermee);
    return {
      id: s.id, signature: `${l.cle(s.id)}|${cleAspect(aspect)}|${choisie ? "sommets" : ""}`, construire: () => {
        const objets = volumeSeul(s, aspect, s.id, { solide: s.id, subdivision: s.id });
        if (!choisie) return objets;
        const reseau = new THREE.BufferGeometry();
        reseau.setAttribute("position", new THREE.BufferAttribute(new Float32Array(s.controle.segments.flatMap(([a, b]) => { const p = s.controle.points[a]!, q = s.controle.points[b]!; return [p.x, p.y, p.z, q.x, q.y, q.z]; })), 3));
        const polygone = new THREE.LineSegments(reseau, new THREE.LineDashedMaterial({ color: 0x7a4f1f, dashSize: 0.1, gapSize: 0.06 }));
        polygone.computeLineDistances();
        objets.push(polygone);
        const taille = Math.max(0.03, Math.min(0.2, 0.02 * Math.max(...s.vertices.map((v) => Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z))), 1) / 4));
        s.controle.points.forEach((p, k) => {
          const repere = new THREE.Mesh(new THREE.SphereGeometry(taille, 10, 8), new THREE.MeshBasicMaterial({ color: 0x7a4f1f }));
          repere.position.set(p.x, p.y, p.z);
          repere.name = `${s.id}#sommet-${k}`;
          Object.assign(repere.userData, { subdivision: s.id, sommet: k });
          objets.push(repere);
        });
        return objets;
      },
    };
  });
  return [...libres, ...exacts, ...surfaces, ...subdivisions];
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
    if (a.type !== "opening") {
      // Échelle d'accès (EX-027) : montants et échelons, teinte propre, même désignation que le mur ; poteaux, poutres et
      // dalles (lot W3-B) : en lots, teinte propre par type.
      const teinte = a.type === "ladder" ? 0x9c8a6e : a.type === "column" ? 0xa9a396 : a.type === "beam" ? 0xbfb49c : a.type === "slab" ? 0xe3dccd : 0xd8d2c4;
      const aspect = aspectDe(l.doc, l.mode, a, teinte, choisi);
      out.push(choisi
        ? { id: a.id, signature: `${l.cle(a.id)}|${cleAspect(aspect)}`, construire: () => volumeSeul(a, aspect, a.id, { architecture: a.id }) }
        : { id: a.id, signature: l.cle(a.id), lot: a.type === "ladder" ? "echelle" : a.type === "wall" ? "mur" : "structure", geometrie: a, aspect });
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
  // Occurrences de composants (lot W3-B) : géométrie de leur définition placée ; admises à l'instanciation (C.2-02) — les
  // occurrences de même forme deviennent un seul InstancedMesh dont la table de désignation rend l'occurrence.
  for (const o of l.mesh.occurrences ?? []) {
    if (!l.present(o.id)) continue;
    out.push({ id: o.id, signature: l.cle(o.id), lot: "occurrence", instanciable: true, geometrie: o, aspect: aspectDe(l.doc, l.mode, o, 0x8fb3a0, false) });
  }
  return out;
}
