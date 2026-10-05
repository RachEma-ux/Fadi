/**
 * Rendu SVG d'un niveau du modèle typé (plan de travail, cahier §5.7) : chaque classe a son dessin, calculé
 * depuis les paramètres canoniques (`polygoneMur`, contours, arcs, splines). Les calques masqués ne sont pas
 * dessinés ; la sélection et le survol sont des états d'affichage.
 */
import { memo } from "react";
import { pointsPolyligne, battantPorte, centroide, symbolePorte, croisementsDuNiveau, extremitesCotation, facesMur, geometrieToiture, pointsArc, pointsSpline, polygoneMurRaccorde, separationsCouches, type ModeleAtelier, type Occurrence, type OccurrenceQuelconque } from "@parcours/atelier-model";
import { chemin, type Projecteur } from "./projecteur";

export interface PropsObjet {
  o: OccurrenceQuelconque;
  etat: ModeleAtelier;
  pr: Projecteur;
  selectionne: boolean;
  survole: boolean;
}

const COULEURS: Record<string, string> = {
  mur: "#315b4b",
  cloison: "#5a7b6d",
  dalle: "#c9b99a",
  toiture: "#a6ad91",
  piece: "#ead9b4",
  espace: "#d9e5dc",
  zone: "#b7c9d4",
  solide: "#9fb3a8",
  poteau: "#2d4a40",
  escalier: "#6b8f7f",
  esquisse: "#355e52",
  cotation: "#8a6a2a",
  texte: "#183d32",
};

function classes(base: string, selectionne: boolean, survole: boolean): string {
  return `${base}${selectionne ? " est-selectionne" : ""}${survole ? " est-survole" : ""}`;
}

export const Objet2D = memo(function Objet2D({ o, etat, pr, selectionne, survole }: PropsObjet) {
  switch (o.classe) {
    case "mur":
      return <Mur2D o={o} etat={etat} pr={pr} selectionne={selectionne} survole={survole} />;
    case "porte":
    case "fenetre":
    case "ouverture":
      return <Ouverture2D o={o} etat={etat} pr={pr} selectionne={selectionne} survole={survole} />;
    case "toiture": {
      const d = chemin(pr, o.params.contour) + o.params.trous.map((t) => " " + chemin(pr, t)).join("");
      const g = o.params.type !== "plate" && o.params.pente ? geometrieToiture(o.params.contour, o.params.type, o.params.pente.value) : null;
      return (
        <g className={classes("obj-toiture", selectionne, survole)} data-objet={o.id}>
          <path d={d} fill={COULEURS["toiture"]} fillOpacity={0.25} fillRule="evenodd" stroke={COULEURS["toiture"]} strokeWidth={selectionne ? 2.5 : 1} />
          {g?.faitage && <path d={chemin(pr, g.faitage, false)} stroke={COULEURS["toiture"]} strokeWidth={1.4} fill="none" />}
          {g?.type === "monopente" && <path d={chemin(pr, [o.params.contour[0]!, o.params.contour[1]!], false)} stroke={COULEURS["toiture"]} strokeWidth={2.4} fill="none" />}
        </g>
      );
    }
    case "garde-corps": {
      const ep = Math.max(2, o.params.epaisseur.value * pr.echelle);
      return <path d={chemin(pr, o.params.points, o.params.ferme)} className={classes("obj-garde-corps", selectionne, survole)} fill="none" stroke={selectionne ? "#b3872f" : "#4f625b"} strokeWidth={ep} strokeDasharray={o.params.remplissage === "barreaudage" ? `${Math.max(1, ep / 2)} ${Math.max(1, ep / 2)}` : undefined} data-objet={o.id} />;
    }
    case "objet-importe": {
      // Représentation importée : emprise (enveloppe convexe) en tirets, classe IFC d'origine au survol.
      if (o.params.empreinte.length < 2) return null;
      const espace = o.params.ifcClasse.toLowerCase() === "ifcspace";
      return (
        <path
          d={chemin(pr, o.params.empreinte)}
          className={classes(`obj-objet-importe${espace ? " obj-espace-importe" : ""}`, selectionne, survole)}
          fill={espace ? "none" : "#96a8b4"}
          fillOpacity={0.14}
          stroke={selectionne ? "#b3872f" : espace ? "#8d9ca6" : "#5f717d"}
          strokeDasharray={espace ? "2 4" : "7 4"}
          strokeWidth={selectionne ? 2.5 : 1}
          data-objet={o.id}
        >
          <title>{`${o.params.ifcClasse}${o.params.nom ? ` · ${o.params.nom}` : ""} (importé)`}</title>
        </path>
      );
    }
    case "dalle":
    case "zone":
    case "reference-plan": {
      const d = chemin(pr, o.params.contour) + o.params.trous.map((t) => " " + chemin(pr, t)).join("");
      return <path d={d} className={classes(`obj-${o.classe}`, selectionne, survole)} fill={o.classe === "zone" || o.classe === "reference-plan" ? "none" : COULEURS[o.classe]} fillOpacity={0.25} fillRule="evenodd" stroke={COULEURS[o.classe] ?? "#666"} strokeDasharray={o.classe === "dalle" ? "6 4" : o.classe === "zone" ? "2 3" : undefined} strokeWidth={selectionne ? 2.5 : 1} data-objet={o.id} />;
    }
    case "piece": {
      const d = chemin(pr, o.params.contour) + o.params.trous.map((t) => " " + chemin(pr, t)).join("");
      const c = pr.vers(o.params.etiquette ?? centroide(o.params.contour));
      const taille = Math.max(9, Math.min(14, pr.echelle * 0.45));
      return (
        <g className={classes("obj-piece", selectionne, survole)} data-objet={o.id}>
          <path d={d} fill={COULEURS["piece"]} fillOpacity={selectionne ? 0.6 : 0.35} fillRule="evenodd" stroke="#b89a5a" strokeWidth={selectionne ? 2 : 0.8} />
          {pr.echelle >= 6 && (
            <text x={c.x} y={c.y} fontSize={taille} textAnchor="middle" fill="#5a4a20" pointerEvents="none">
              {o.params.code ? `${o.params.code} · ${o.params.nom}` : o.params.nom}
            </text>
          )}
        </g>
      );
    }
    case "espace":
      return (
        <g className={classes("obj-espace", selectionne, survole)} data-objet={o.id}>
          {o.params.polygones.map((pg, i) => (
            <path key={i} d={chemin(pr, pg.contour) + pg.trous.map((t) => " " + chemin(pr, t)).join("")} fill="none" stroke="#5b7468" strokeDasharray="4 3" strokeWidth={selectionne ? 2 : 0.8} fillRule="evenodd" />
          ))}
        </g>
      );
    case "solide": {
      const d = chemin(pr, o.params.contour, o.params.ferme) + o.params.trous.map((t) => " " + chemin(pr, t)).join("");
      return <path d={d} className={classes("obj-solide", selectionne, survole)} fill={o.params.ferme ? (o.params.couleur ?? COULEURS["solide"]) : "none"} fillOpacity={0.35} fillRule="evenodd" stroke={o.params.couleur ?? COULEURS["solide"]} strokeWidth={selectionne ? 2 : 0.8} data-objet={o.id} />;
    }
    case "poteau": {
      const c = pr.vers(o.params.point);
      const w = o.params.largeur.value * pr.echelle;
      const h = o.params.profondeur.value * pr.echelle;
      return <rect x={c.x - w / 2} y={c.y - h / 2} width={w} height={h} transform={`rotate(${-o.params.angle.value} ${c.x} ${c.y})`} className={classes("obj-poteau", selectionne, survole)} fill={COULEURS["poteau"]} stroke={selectionne ? "#b3872f" : COULEURS["poteau"]} strokeWidth={selectionne ? 2.5 : 1} data-objet={o.id} />;
    }
    case "escalier": {
      const { a, b, largeur } = o.params;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      const nx = (-dy / l) * (largeur.value / 2);
      const ny = (dx / l) * (largeur.value / 2);
      const quad = [{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }, { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny }];
      const n = Math.max(2, o.params.contremarches ?? o.params.marches ?? 10);
      const marches: string[] = [];
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const p1 = pr.vers({ x: a.x + dx * t + nx, y: a.y + dy * t + ny });
        const p2 = pr.vers({ x: a.x + dx * t - nx, y: a.y + dy * t - ny });
        marches.push(`M${p1.x.toFixed(1)} ${p1.y.toFixed(1)} L${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`);
      }
      const fa = pr.vers(a);
      const fb = pr.vers(b);
      return (
        <g className={classes("obj-escalier", selectionne, survole)} data-objet={o.id} opacity={o.params.referencePlanSeulement ? 0.5 : 1}>
          <path d={chemin(pr, quad)} fill="#eef3ee" stroke={COULEURS["escalier"]} strokeWidth={selectionne ? 2.5 : 1} />
          <path d={marches.join(" ")} stroke={COULEURS["escalier"]} strokeWidth={0.7} fill="none" />
          <line x1={fa.x} y1={fa.y} x2={fb.x} y2={fb.y} stroke={COULEURS["escalier"]} strokeWidth={1} markerEnd="url(#fleche-escalier)" />
        </g>
      );
    }
    case "esquisse":
      return <Esquisse2D o={o} pr={pr} selectionne={selectionne} survole={survole} />;
    case "cotation": {
      // Cote associative : une extrémité rattachée suit sa caractéristique ; « à réparer » est signalé, jamais masqué.
      const ext = extremitesCotation(etat, o.id) ?? { a: o.params.a, b: o.params.b, aReparer: false, rattachees: 0 };
      const { a, b } = ext;
      const { decalage } = o.params;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      const nx = (-dy / l) * decalage.value;
      const ny = (dx / l) * decalage.value;
      const a2 = { x: a.x + nx, y: a.y + ny };
      const b2 = { x: b.x + nx, y: b.y + ny };
      const sa = pr.vers(a);
      const sb = pr.vers(b);
      const sa2 = pr.vers(a2);
      const sb2 = pr.vers(b2);
      const mid = { x: (sa2.x + sb2.x) / 2, y: (sa2.y + sb2.y) / 2 };
      const angle = (Math.atan2(sb2.y - sa2.y, sb2.x - sa2.x) * 180) / Math.PI;
      const texte = `${l.toFixed(2).replace(".", ",")} m${ext.aReparer ? " · à réparer" : ""}`;
      const couleur = ext.aReparer ? "#b42318" : COULEURS["cotation"];
      return (
        <g className={classes(`obj-cotation${ext.aReparer ? " cotation-a-reparer" : ""}`, selectionne, survole)} data-objet={o.id} data-rattachees={ext.rattachees} stroke={couleur} strokeWidth={selectionne ? 2 : 0.8} fill="none">
          <line x1={sa.x} y1={sa.y} x2={sa2.x} y2={sa2.y} />
          <line x1={sb.x} y1={sb.y} x2={sb2.x} y2={sb2.y} />
          <line x1={sa2.x} y1={sa2.y} x2={sb2.x} y2={sb2.y} />
          <text x={mid.x} y={mid.y - 3} fontSize={10} textAnchor="middle" fill={couleur} stroke="none" transform={`rotate(${angle > 90 || angle < -90 ? angle + 180 : angle} ${mid.x} ${mid.y})`}>
            {texte}
          </text>
        </g>
      );
    }
    case "texte":
    case "etiquette": {
      const p = pr.vers(o.params.position);
      return (
        <text x={p.x} y={p.y} fontSize={Math.max(9, Math.min(14, pr.echelle * 0.4))} className={classes("obj-texte", selectionne, survole)} fill={selectionne ? "#b3872f" : COULEURS["texte"]} data-objet={o.id}>
          {o.params.texte}
        </text>
      );
    }
    case "bloc-occurrence":
      return <Bloc2D o={o} etat={etat} pr={pr} selectionne={selectionne} survole={survole} />;
  }
});

/** Occurrence de bloc ou de composant : contenu 2D de sa définition, placé (position, angle, échelle). */
function Bloc2D({ o, etat, pr, selectionne, survole }: { o: Occurrence<"bloc-occurrence">; etat: ModeleAtelier; pr: Projecteur; selectionne: boolean; survole: boolean }) {
  const def = o.definitionId ? etat.definitions[o.definitionId] : undefined;
  const contenu = (def?.params["contenu"] as { classe: string; params: Record<string, unknown> }[] | undefined) ?? [];
  const ang = (o.params.angle.value * Math.PI) / 180;
  const k = o.params.echelle;
  const tr = (p: { x: number; y: number }) => ({ x: o.params.position.x + k * (p.x * Math.cos(ang) - p.y * Math.sin(ang)), y: o.params.position.y + k * (p.x * Math.sin(ang) + p.y * Math.cos(ang)) });
  const couleur = selectionne ? "#b3872f" : def?.classe === "composant" ? "#6b4f2a" : "#355e52";
  const c = pr.vers(o.params.position);
  return (
    <g className={classes(`obj-bloc${def ? "" : " bloc-absent"}`, selectionne, survole)} data-objet={o.id} stroke={couleur} fill="none" strokeWidth={selectionne ? 2 : 1}>
      {contenu.map((e, i) => {
        const pts = (Array.isArray(e.params["points"]) ? e.params["points"] : Array.isArray(e.params["contour"]) ? e.params["contour"] : []) as { x: number; y: number }[];
        if (e.params["forme"] === "cercle" && e.params["centre"] && e.params["rayon"]) {
          const q = pr.vers(tr(e.params["centre"] as { x: number; y: number }));
          return <circle key={i} cx={q.x} cy={q.y} r={(e.params["rayon"] as { value: number }).value * k * pr.echelle} />;
        }
        if (e.params["forme"] === "rectangle" && pts.length === 2) {
          const [p1, p2] = [pts[0]!, pts[1]!];
          return <path key={i} d={chemin(pr, [p1, { x: p2.x, y: p1.y }, p2, { x: p1.x, y: p2.y }].map(tr))} />;
        }
        return pts.length >= 2 ? <path key={i} d={chemin(pr, pts.map(tr), e.params["ferme"] === true || "contour" in e.params)} /> : null;
      })}
      <circle cx={c.x} cy={c.y} r={3} fill="#fff" />
      {!def && <text x={c.x + 6} y={c.y} fontSize={10} fill="#b42318" stroke="none">définition absente</text>}
    </g>
  );
}

/**
 * Croisements de murs qui se traversent (D-034) : la zone commune est peinte d'un seul tenant par-dessus les deux
 * murs, ce qui efface les traits intérieurs (comme l'union des contours des documents). Seulement si les deux murs
 * sont dessinés.
 */
export function Croisements2D({ etat, niveauId, visibles, pr }: { etat: ModeleAtelier; niveauId: string | null; visibles: ReadonlySet<string>; pr: Projecteur }) {
  const c = croisementsDuNiveau(etat, niveauId).filter((x) => visibles.has(x.murs[0]) && visibles.has(x.murs[1]));
  if (!c.length) return null;
  return (
    <g className="plan-croisements" pointerEvents="none" aria-hidden="true">
      {c.map((x) => {
        const m = etat.objets[x.murs[0]] as Occurrence<"mur">;
        const type = m.definitionId === "cloison" ? "cloison" : "mur";
        return <path key={`${x.murs[0]}|${x.murs[1]}`} data-croisement={`${x.murs[0]}|${x.murs[1]}`} d={chemin(pr, x.polygone)} fill={m.params.hauteur ? COULEURS[type] : "#fff"} fillOpacity={0.94} stroke="none" />;
      })}
    </g>
  );
}

function Mur2D({ o, etat, pr, selectionne, survole }: { o: Occurrence<"mur">; etat: ModeleAtelier; pr: Projecteur; selectionne: boolean; survole: boolean }) {
  const { a, b, epaisseur, alignement } = o.params;
  // Contour raccordé aux murs voisins (onglets, tés) : géométrie dérivée, paramètres inchangés.
  const poly = polygoneMurRaccorde(etat, o);
  const type = o.definitionId === "cloison" ? "cloison" : "mur";
  const fill = o.params.hauteur ? COULEURS[type] : "#fff";
  // Ouvertures : vides dans le mur (rectangle de la largeur, sur toute l'épaisseur).
  const ouvertures = Object.values(etat.objets).filter((x): x is Occurrence<"porte" | "fenetre" | "ouverture"> => (x.classe === "porte" || x.classe === "fenetre" || x.classe === "ouverture") && x.params.murHoteId === o.id);
  const f = facesMur(a, b, epaisseur.value, alignement);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const nx = f.gauche[0].x - f.droite[0].x;
  const ny = f.gauche[0].y - f.droite[0].y;
  return (
    <g className={classes(`obj-mur obj-mur-${type}`, selectionne, survole)} data-objet={o.id}>
      <path d={chemin(pr, poly)} fill={fill} fillOpacity={selectionne ? 0.85 : 0.75} stroke={selectionne ? "#b3872f" : o.params.exterieur ? "#11302a" : COULEURS[type]} strokeWidth={selectionne ? 2.5 : o.params.exterieur ? 1.4 : 0.9} />
      {ouvertures.map((ouv) => {
        const c = { x: a.x + dx * ouv.params.position, y: a.y + dy * ouv.params.position };
        const w = ouv.params.largeur.value / 2;
        const p1 = { x: c.x - ux * w, y: c.y - uy * w };
        const p2 = { x: c.x + ux * w, y: c.y + uy * w };
        const quad = [{ x: p1.x + (f.droite[0].x - a.x), y: p1.y + (f.droite[0].y - a.y) }, { x: p2.x + (f.droite[0].x - a.x), y: p2.y + (f.droite[0].y - a.y) }, { x: p2.x + (f.droite[0].x - a.x) + nx, y: p2.y + (f.droite[0].y - a.y) + ny }, { x: p1.x + (f.droite[0].x - a.x) + nx, y: p1.y + (f.droite[0].y - a.y) + ny }];
        return <path key={ouv.id} d={chemin(pr, quad)} fill="#fff" stroke="none" />;
      })}
      {separationsCouches(etat, o, ouvertures.map((ouv) => { const c = ouv.params.position * Math.hypot(dx, dy); return [c - ouv.params.largeur.value / 2, c + ouv.params.largeur.value / 2] as [number, number]; })).map((sep, i) => (
        <path key={`couche-${i}`} className="mur-couche" d={chemin(pr, [sep.a, sep.b], false)} fill="none" stroke="#11302a" strokeWidth={0.6} strokeOpacity={0.55} />
      ))}
    </g>
  );
}

function Ouverture2D({ o, etat, pr, selectionne, survole }: { o: Occurrence<"porte" | "fenetre" | "ouverture">; etat: ModeleAtelier; pr: Projecteur; selectionne: boolean; survole: boolean }) {
  const hote = etat.objets[o.params.murHoteId];
  if (!hote || hote.classe !== "mur") return null;
  const { a, b, epaisseur, alignement } = hote.params;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const f = facesMur(a, b, epaisseur.value, alignement);
  const c = { x: a.x + dx * o.params.position, y: a.y + dy * o.params.position };
  const w = o.params.largeur.value;
  const p1 = { x: c.x - ux * (w / 2), y: c.y - uy * (w / 2) };
  const p2 = { x: c.x + ux * (w / 2), y: c.y + uy * (w / 2) };
  const dec = (p: { x: number; y: number }, k: number) => ({ x: p.x + (f.gauche[0].x - a.x) * k + (f.droite[0].x - a.x) * (1 - k), y: p.y + (f.gauche[0].y - a.y) * k + (f.droite[0].y - a.y) * (1 - k) });
  const couleur = selectionne ? "#b3872f" : survole ? "#8a6a2a" : "#2d4a40";
  if (o.classe === "fenetre") {
    const l1 = [dec(p1, 0.35), dec(p2, 0.35)];
    const l2 = [dec(p1, 0.65), dec(p2, 0.65)];
    return (
      <g className={classes("obj-fenetre", selectionne, survole)} data-objet={o.id} stroke={couleur} strokeWidth={selectionne ? 2 : 1} fill="none">
        <path d={chemin(pr, l1, false)} />
        <path d={chemin(pr, l2, false)} />
        <path d={chemin(pr, [dec(p1, 0), dec(p1, 1)], false)} />
        <path d={chemin(pr, [dec(p2, 0), dec(p2, 1)], false)} />
      </g>
    );
  }
  if (o.classe === "porte") {
    // Battant ouvert à 90° avec son arc de débattement : sens renseigné (D-037), sinon convention de l'Atelier.
    const bt = battantPorte(etat, o as Occurrence<"porte">);
    const sym = symbolePorte(etat, o as Occurrence<"porte">);
    if (!bt || !sym) return null;
    return (
      <g className={classes("obj-porte", selectionne, survole)} data-objet={o.id} data-ouvrant={bt.explicite ? `${bt.ouvrant.charniere}-${bt.ouvrant.cote}${bt.ouvrant.type && bt.ouvrant.type !== "battante" ? `-${bt.ouvrant.type}` : ""}` : "non-renseigne"} stroke={couleur} strokeWidth={selectionne ? 2 : 1} fill="none">
        {sym.vantaux.map((v, i) => <path key={`v${i}`} d={chemin(pr, v, false)} />)}
        {sym.arcs.map((a, i) => <path key={`a${i}`} d={chemin(pr, a, false)} strokeDasharray={bt.explicite ? undefined : "2 2"} strokeWidth={0.8} />)}
      </g>
    );
  }
  return <path d={chemin(pr, [dec(p1, 0), dec(p2, 0), dec(p2, 1), dec(p1, 1)])} className={classes("obj-ouverture", selectionne, survole)} fill="#fff" stroke={couleur} strokeDasharray="3 2" strokeWidth={selectionne ? 2 : 1} data-objet={o.id} />;
}

function Esquisse2D({ o, pr, selectionne, survole }: { o: Occurrence<"esquisse">; pr: Projecteur; selectionne: boolean; survole: boolean }) {
  const p = o.params;
  const couleur = selectionne ? "#b3872f" : COULEURS["esquisse"];
  const commun = { className: classes(`obj-esquisse obj-esquisse-${p.forme}`, selectionne, survole), "data-objet": o.id, stroke: couleur, strokeWidth: selectionne ? 2 : 1, fill: "none" as const };
  switch (p.forme) {
    case "cercle": {
      if (!p.centre || !p.rayon) return null;
      const c = pr.vers(p.centre);
      return <circle cx={c.x} cy={c.y} r={p.rayon.value * pr.echelle} {...commun} />;
    }
    case "ellipse": {
      if (!p.centre || !p.rayon || !p.rayonB) return null;
      const c = pr.vers(p.centre);
      // Repère SVG : y vers le bas, la rotation change de signe.
      return <ellipse cx={c.x} cy={c.y} rx={p.rayon.value * pr.echelle} ry={p.rayonB.value * pr.echelle} transform={`rotate(${-(p.rotation?.value ?? 0)} ${c.x} ${c.y})`} {...commun} />;
    }
    case "arc": {
      if (!p.centre || !p.rayon) return null;
      const pts = pointsArc(p.centre, p.rayon.value, p.angleDebut?.value ?? 0, p.angleFin?.value ?? 360);
      return <path d={chemin(pr, pts, false)} {...commun} />;
    }
    case "spline":
      return <path d={chemin(pr, pointsSpline(p.points, 8, p.ferme), p.ferme)} {...commun} />;
    case "construction":
      return <path d={chemin(pr, p.points, false)} {...commun} strokeDasharray="8 4 2 4" strokeWidth={0.8} />;
    case "hachure": {
      return <path d={chemin(pr, p.points)} {...commun} fill="url(#hachure-motif)" />;
    }
    case "rectangle": {
      const pts = p.points.length === 2 ? [p.points[0]!, { x: p.points[1]!.x, y: p.points[0]!.y }, p.points[1]!, { x: p.points[0]!.x, y: p.points[1]!.y }] : p.points;
      return <path d={chemin(pr, pts)} {...commun} />;
    }
    default:
      // Segments en arc (D-063) : dessinés par leurs points discrétisés.
      return <path d={chemin(pr, p.renflements ? pointsPolyligne(p.points, p.ferme, p.renflements) : p.points, p.ferme)} {...commun} />;
  }
}

/** Définitions SVG partagées (marqueurs, motifs). */
export function Definitions2D() {
  return (
    <defs>
      <marker id="fleche-escalier" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
        <path d="M0 0 L8 4 L0 8 Z" fill="#6b8f7f" />
      </marker>
      <pattern id="hachure-motif" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" stroke="#355e52" strokeWidth="1" />
      </pattern>
    </defs>
  );
}
