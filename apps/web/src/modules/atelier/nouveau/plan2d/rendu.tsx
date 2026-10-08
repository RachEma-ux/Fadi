/**
 * Rendu SVG d'un niveau du modèle typé (plan de travail, cahier §5.7) : chaque classe a son dessin, calculé
 * depuis les paramètres canoniques (`polygoneMur`, contours, arcs, splines). Les calques masqués ne sont pas
 * dessinés ; la sélection et le survol sont des états d'affichage.
 */
import { memo } from "react";
import { anneauRetombee, architectureBloc, contoursArchitecture, facesMurRaccordees, traitsMenuiseriePlan, hoteOuverture, longueurAxeMur, polygoneMurCourbe, portionAxeMur, pointsPolyligne, contenuPlace, motifHachure, MOTIFS_HACHURE, battantPorte, centroide, symbolePorte, croisementsDuNiveau, extremitesCotation, facesMur, geometrieToiture, pointsArc, pointsSpline, polygoneMurRaccorde, segmentsTrame, separationsCouches, empriseTole, type ModeleAtelier, type Occurrence, type OccurrenceQuelconque } from "@parcours/atelier-model";
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
    case "solide-exact": {
      // Solide exact (P2-1) : emprise du maillage posé (enveloppe convexe), trait plein bleu-gris, volume au survol.
      if (o.params.emprise.length < 3) return null;
      return (
        <path d={chemin(pr, o.params.emprise)} className={classes("obj-solide-exact", selectionne, survole)} fill="#8fa3b8" fillOpacity={0.22} stroke={selectionne ? "#b3872f" : "#4c6177"} strokeWidth={selectionne ? 2.5 : 1.2} data-objet={o.id}>
          <title>{`Solide exact${o.params.nom ? ` · ${o.params.nom}` : ""} · ${o.params.volume.toFixed(3)} m³`}</title>
        </path>
      );
    }
    case "piece-mecanique": {
      // Pièce mécanique (P2-2) : emprise du maillage posé (enveloppe convexe), gris acier ; numéro au survol.
      if (o.params.emprise.length < 3) return null;
      return (
        <path d={chemin(pr, o.params.emprise)} className={classes("obj-piece-mecanique", selectionne, survole)} fill="#9aa5b1" fillOpacity={0.3} stroke={selectionne ? "#b3872f" : "#55606b"} strokeWidth={selectionne ? 2.5 : 1.2} data-objet={o.id}>
          <title>{`Pièce mécanique · ${o.params.nom}${o.params.reference ? ` · ${o.params.reference}` : ""}`}</title>
        </path>
      );
    }
    case "assemblage": {
      // Assemblage (P2-2) : repère (croix) et nom à sa position ; ses pièces se dessinent elles-mêmes.
      const c = pr.vers(o.params.position);
      const r = 7;
      return (
        <g className={classes("obj-assemblage", selectionne, survole)} data-objet={o.id}>
          <line x1={c.x - r} y1={c.y} x2={c.x + r} y2={c.y} stroke={selectionne ? "#b3872f" : "#55606b"} strokeWidth={selectionne ? 2.5 : 1.5} />
          <line x1={c.x} y1={c.y - r} x2={c.x} y2={c.y + r} stroke={selectionne ? "#b3872f" : "#55606b"} strokeWidth={selectionne ? 2.5 : 1.5} />
          <circle cx={c.x} cy={c.y} r={r + 3} fill="none" stroke={selectionne ? "#b3872f" : "#55606b"} strokeWidth={1} />
          <text x={c.x + r + 5} y={c.y - 4} fontSize={11} fill="#3a4550">{o.params.nom}</text>
          <title>{`Assemblage · ${o.params.nom}${o.params.diagnostic ? ` · ${o.params.diagnostic}` : ""}`}</title>
        </g>
      );
    }
    case "liaison":
      return null;
    // Ontologie structure (P2-3).
    case "poutre": {
      // Élément linéaire : bande de la largeur de section le long de l'axe, trait d'axe ; rôle et section au survol.
      const a = pr.vers(o.params.a), b = pr.vers(o.params.b);
      const w = Math.max(2, o.params.section.largeur.value * pr.echelle);
      const couleur = selectionne ? "#b3872f" : o.params.materiau === "beton" ? "#8a8378" : o.params.materiau === "bois" ? "#a0763f" : "#55606b";
      return (
        <g className={classes("obj-poutre", selectionne, survole)} data-objet={o.id} data-role={o.params.role}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={couleur} strokeOpacity={0.35} strokeWidth={w} strokeLinecap="butt" />
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={couleur} strokeWidth={selectionne ? 2 : 1} strokeDasharray={o.params.role === "poutre" || o.params.role === "longrine" ? undefined : "6 3"} />
          <title>{`Élément de structure · ${o.params.nom ?? o.id} · ${o.params.role} · ${o.params.section.profil?.designation ?? o.params.section.forme}`}</title>
        </g>
      );
    }
    case "trame": {
      // Trame : axes en trait mixte, bulles nommées en bout de chaque file et rang.
      const segs = segmentsTrame(o.params, 1.5);
      const couleur = selectionne ? "#b3872f" : "#7a6a3a";
      return (
        <g className={classes("obj-trame", selectionne, survole)} data-objet={o.id}>
          {segs.map((sg) => {
            const a = pr.vers(sg.a), b = pr.vers(sg.b);
            return (
              <g key={`${sg.genre}-${sg.nom}`}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={couleur} strokeWidth={selectionne ? 1.5 : 0.8} strokeDasharray="12 4 2 4" />
                <circle cx={a.x} cy={a.y} r={9} fill="#fff" stroke={couleur} strokeWidth={1} />
                <text x={a.x} y={a.y + 3.5} fontSize={10} textAnchor="middle" fill="#3a3020">{sg.nom}</text>
              </g>
            );
          })}
          <title>{`Trame · ${o.params.nom} · ${o.params.files.length} file(s) × ${o.params.rangs.length} rang(s)`}</title>
        </g>
      );
    }
    case "plaque":
      return (
        <path d={chemin(pr, o.params.contour) + o.params.trous.map((t) => chemin(pr, t)).join("")} fillRule="evenodd" className={classes("obj-plaque", selectionne, survole)} fill="#7a8794" fillOpacity={0.35} stroke={selectionne ? "#b3872f" : "#4c5a68"} strokeWidth={selectionne ? 2.5 : 1} data-objet={o.id}>
          <title>{`Plaque${o.params.nom ? ` · ${o.params.nom}` : ""} · ${Math.round(o.params.epaisseur.value * 1000)} mm`}</title>
        </path>
      );
    case "assemblage-structurel": {
      // Platine vue en plan : trait de son épaisseur, tourné de l'angle ; carré de repère.
      const c = pr.vers(o.params.position);
      const l = Math.max(6, o.params.platine.largeur.value * pr.echelle), e = Math.max(2, o.params.platine.epaisseur.value * pr.echelle);
      return (
        <g className={classes("obj-assemblage-structurel", selectionne, survole)} data-objet={o.id} transform={`rotate(${-o.params.angle.value} ${c.x} ${c.y})`}>
          <rect x={c.x - e / 2} y={c.y - l / 2} width={e} height={l} fill="#6f7d8c" stroke={selectionne ? "#b3872f" : "#3f4a55"} strokeWidth={selectionne ? 2 : 1} />
          <rect x={c.x - 6} y={c.y - 6} width={12} height={12} fill="none" stroke={selectionne ? "#b3872f" : "#3f4a55"} strokeWidth={0.8} />
          <title>{`Assemblage structurel · ${o.params.nom ?? o.params.type}`}</title>
        </g>
      );
    }
    case "soudure": {
      // Symbole de soudure (triangle plein, convention de dessin) à la position du cordon.
      const c = pr.vers(o.params.position);
      return (
        <g className={classes("obj-soudure", selectionne, survole)} data-objet={o.id}>
          <path d={`M${c.x - 6},${c.y + 5} L${c.x + 6},${c.y + 5} L${c.x},${c.y - 6} Z`} fill={selectionne ? "#b3872f" : "#3f4a55"} />
          <title>{`Soudure · ${o.params.type} · gorge ${Math.round(o.params.gorge.value * 1000)} mm · ${o.params.longueur.value} m`}</title>
        </g>
      );
    }
    case "armature": {
      const pts = o.params.forme === "cadre" || o.params.forme === "etrier" ? [...o.params.points, o.params.points[0]!] : o.params.points;
      return (
        <polyline points={pts.map((q) => { const v = pr.vers(q); return `${v.x},${v.y}`; }).join(" ")} className={classes("obj-armature", selectionne, survole)} fill="none" stroke={selectionne ? "#b3872f" : "#9c6b3c"} strokeWidth={selectionne ? 2 : 1} strokeDasharray="2 3" data-objet={o.id}>
          <title>{`Armature · ${o.params.nombre} × Ø ${Math.round(o.params.diametre.value * 1000)} mm`}</title>
        </polyline>
      );
    }
    case "coulage":
      return null;
    // Ontologies bois et tôlerie (P2-4).
    case "element-bois": {
      const a = pr.vers(o.params.a), b = pr.vers(o.params.b);
      const w = Math.max(2, o.params.section.largeur.value * pr.echelle);
      const vertical = Math.hypot(b.x - a.x, b.y - a.y) < 1;
      if (vertical) {
        const d = Math.max(3, (o.params.section.largeur.value * pr.echelle) / 2), e = Math.max(3, (o.params.section.hauteur.value * pr.echelle) / 2);
        return <rect x={a.x - d} y={a.y - e} width={2 * d} height={2 * e} transform={`rotate(${-o.params.rotation.value} ${a.x} ${a.y})`} className={classes("obj-element-bois", selectionne, survole)} fill="#b8905a" stroke={selectionne ? "#b3872f" : "#6b4f2a"} strokeWidth={selectionne ? 2 : 0.8} data-objet={o.id} data-role={o.params.role}><title>{`Pièce de bois · ${o.params.nom ?? o.id} · ${o.params.role}`}</title></rect>;
      }
      return (
        <g className={classes("obj-element-bois", selectionne, survole)} data-objet={o.id} data-role={o.params.role}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={selectionne ? "#b3872f" : "#b8905a"} strokeOpacity={0.55} strokeWidth={w} strokeLinecap="butt" />
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={selectionne ? "#b3872f" : "#6b4f2a"} strokeWidth={selectionne ? 1.5 : 0.8} />
          <title>{`Pièce de bois · ${o.params.nom ?? o.id} · ${o.params.role}`}</title>
        </g>
      );
    }
    case "ossature": {
      const c = pr.vers(o.params.position);
      return (
        <g className={classes("obj-ossature", selectionne, survole)} data-objet={o.id}>
          <rect x={c.x - 8} y={c.y - 8} width={16} height={16} fill="#fff" stroke={selectionne ? "#b3872f" : "#6b4f2a"} strokeWidth={1} />
          <path d={`M${c.x - 5},${c.y + 5} L${c.x - 5},${c.y - 5} M${c.x},${c.y + 5} L${c.x},${c.y - 5} M${c.x + 5},${c.y + 5} L${c.x + 5},${c.y - 5}`} stroke="#6b4f2a" strokeWidth={1} />
          <text x={c.x + 11} y={c.y - 3} fontSize={11} fill="#4a3a20">{o.params.nom}</text>
          <title>{`Ossature bois · ${o.params.nom} · ${o.params.genre}`}</title>
        </g>
      );
    }
    case "panneau-clt": {
      if (o.params.pose === "mur" && o.params.a && o.params.b) {
        const a = pr.vers(o.params.a), b = pr.vers(o.params.b);
        return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={selectionne ? "#b3872f" : "#c9a877"} strokeWidth={Math.max(3, o.params.epaisseur.value * pr.echelle)} strokeLinecap="butt" className={classes("obj-panneau-clt", selectionne, survole)} data-objet={o.id}><title>{`Panneau CLT · ${o.params.nom ?? o.id}`}</title></line>;
      }
      return (
        <path d={chemin(pr, o.params.contour) + o.params.trous.map((t) => chemin(pr, t)).join("")} fillRule="evenodd" className={classes("obj-panneau-clt", selectionne, survole)} fill="#c9a877" fillOpacity={0.35} stroke={selectionne ? "#b3872f" : "#8a6a3a"} strokeWidth={selectionne ? 2.5 : 1} data-objet={o.id}>
          <title>{`Panneau CLT · ${o.params.nom ?? o.id}`}</title>
        </path>
      );
    }
    case "assemblage-bois": {
      const c = pr.vers(o.params.position);
      return (
        <g className={classes("obj-assemblage-bois", selectionne, survole)} data-objet={o.id}>
          <circle cx={c.x} cy={c.y} r={5} fill={o.params.nature === "bois-metal" ? "#6f7d8c" : "#b8905a"} stroke={selectionne ? "#b3872f" : "#3f4a55"} strokeWidth={1} />
          <title>{`Assemblage bois · ${o.params.nom ?? o.params.type}`}</title>
        </g>
      );
    }
    case "tole": {
      const pts = empriseTole(o.params);
      const c = pr.vers(o.params.position);
      const L = o.params.longueur.value * pr.echelle, W = o.params.largeur.value * pr.echelle;
      return (
        <g className={classes("obj-tole", selectionne, survole)} data-objet={o.id} transform={`rotate(${-o.params.angle.value} ${c.x} ${c.y})`}>
          <path d={chemin(pr, pts)} transform={`rotate(${o.params.angle.value} ${c.x} ${c.y})`} fill="none" stroke="#8c96a0" strokeWidth={0.6} strokeDasharray="3 3" />
          <rect x={c.x - L / 2} y={c.y - W / 2} width={L} height={W} fill="#8c96a0" fillOpacity={0.35} stroke={selectionne ? "#b3872f" : "#4c5a68"} strokeWidth={selectionne ? 2 : 1} />
          <title>{`Tôle pliée · ${o.params.nom ?? o.id} · ${o.params.plis.length} pli(s)`}</title>
        </g>
      );
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
      // Retombée de rive (D-144) : contour intérieur de la bande, sous la dalle, en tirets fins.
      const anneau = o.classe === "dalle" ? anneauRetombee(o.params) : null;
      if (anneau) {
        const d = chemin(pr, o.params.contour) + o.params.trous.map((t) => " " + chemin(pr, t)).join("");
        return (
          <g className={classes("obj-dalle", selectionne, survole)} data-objet={o.id}>
            <path d={d} fill={COULEURS["dalle"]} fillOpacity={0.25} fillRule="evenodd" stroke={COULEURS["dalle"] ?? "#666"} strokeDasharray="6 4" strokeWidth={selectionne ? 2.5 : 1} />
            <path d={chemin(pr, anneau.interieur)} fill="none" stroke={COULEURS["dalle"] ?? "#666"} strokeDasharray="2 3" strokeWidth={0.8} data-retombee />
          </g>
        );
      }
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
      // Section non rectangulaire (D-139) : contour de la section (cercle, profilés I, T, L, U).
      if (o.params.formeId === "cercle" || o.params.formeId === "rond" || o.params.epaisseurProfil) {
        const sec = contoursArchitecture("poteau", o.params as unknown as Record<string, unknown>);
        if (sec) return <path d={chemin(pr, sec.contour)} className={classes("obj-poteau", selectionne, survole)} fill={COULEURS["poteau"]} stroke={selectionne ? "#b3872f" : COULEURS["poteau"]} strokeWidth={selectionne ? 2.5 : 1} data-objet={o.id} data-section={o.params.formeId} />;
      }
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
      // Orientation (D-146) : sens direct du modèle, y écran inversé.
      const angle = o.classe === "texte" ? (o.params.angle?.value ?? 0) : 0;
      return (
        <text x={p.x} y={p.y} transform={angle ? `rotate(${-angle} ${p.x} ${p.y})` : undefined} fontSize={Math.max(9, Math.min(14, pr.echelle * 0.4))} className={classes("obj-texte", selectionne, survole)} fill={selectionne ? "#b3872f" : COULEURS["texte"]} data-objet={o.id}>
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
  // Contenu placé, blocs imbriqués compris (D-078).
  const contenu = contenuPlace(etat, o.definitionId, o.params);
  const arch = architectureBloc(etat, o);
  const couleur = selectionne ? "#b3872f" : def?.classe === "composant" ? "#6b4f2a" : "#355e52";
  const c = pr.vers(o.params.position);
  return (
    <g className={classes(`obj-bloc${def ? "" : " bloc-absent"}`, selectionne, survole)} data-objet={o.id} stroke={couleur} fill="none" strokeWidth={selectionne ? 2 : 1}>
      {contenu.map((e, i) => {
        const { tr, k } = e;
        // Poteaux et dalles d'un bloc (D-108) : section ou contour, avec les trous.
        const archi = contoursArchitecture(e.classe, e.params);
        if (archi) return <path key={i} d={[archi.contour, ...archi.trous].map((x) => chemin(pr, x.map(tr))).join(" ")} />;
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
      {/* Murs et ouvertures du bloc (D-150) : dessinés comme des murs, dans leur modèle virtuel (non sélectionnables à part). */}
      {arch.objets.length > 0 && (
        <g pointerEvents="none" data-bloc-architecture>
          {arch.objets.map((x) => <Objet2D key={x.id} o={x} etat={arch.modele} pr={pr} selectionne={false} survole={false} />)}
        </g>
      )}
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
        // Mur courbe (D-095) : vide le long de l'arc, entre les deux faces.
        if (o.params.renflement) {
          const Lc = longueurAxeMur(o.params);
          const cc = ouv.params.position * Lc;
          const portion = portionAxeMur(o.params, Math.max(0, cc - ouv.params.largeur.value / 2), Math.min(Lc, cc + ouv.params.largeur.value / 2));
          return <path key={ouv.id} d={chemin(pr, polygoneMurCourbe(portion.a, portion.b, epaisseur.value, alignement, portion.renflement!))} fill="#fff" stroke="none" />;
        }
        const c = { x: a.x + dx * ouv.params.position, y: a.y + dy * ouv.params.position };
        const w = ouv.params.largeur.value / 2;
        const p1 = { x: c.x - ux * w, y: c.y - uy * w };
        const p2 = { x: c.x + ux * w, y: c.y + uy * w };
        const quad = [{ x: p1.x + (f.droite[0].x - a.x), y: p1.y + (f.droite[0].y - a.y) }, { x: p2.x + (f.droite[0].x - a.x), y: p2.y + (f.droite[0].y - a.y) }, { x: p2.x + (f.droite[0].x - a.x) + nx, y: p2.y + (f.droite[0].y - a.y) + ny }, { x: p1.x + (f.droite[0].x - a.x) + nx, y: p1.y + (f.droite[0].y - a.y) + ny }];
        // Baie jusqu'à l'extrémité du mur (angle sans poteau, D-106) : le vide prend l'onglet du raccord.
        const debutAuBout = ouv.params.position * l - w <= 1e-6;
        const finAuBout = ouv.params.position * l + w >= l - 1e-6;
        if (debutAuBout || finAuBout) {
          const fr = facesMurRaccordees(etat, o);
          if (debutAuBout) {
            quad[0] = fr.droite[0];
            quad[3] = fr.gauche[0];
          }
          if (finAuBout) {
            quad[1] = fr.droite[1];
            quad[2] = fr.gauche[1];
          }
        }
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
  const { epaisseur, alignement } = hote.params;
  // Mur courbe (D-095) : symbole posé sur la tangente à l'axe au centre de l'ouverture.
  const { a, b, position } = hoteOuverture(hote.params, o.params.position, o.params.largeur.value);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const f = facesMur(a, b, epaisseur.value, alignement);
  const c = { x: a.x + dx * position, y: a.y + dy * position };
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
        {/* Menuiserie paramétrée (D-101) : montants du dormant et entre vantaux, dans la profondeur du dormant. */}
        {o.params.menuiserie && (() => {
          const q0 = dec(p1, 0);
          const q1 = dec(p1, 1);
          const ln = Math.hypot(q1.x - q0.x, q1.y - q0.y) || 1;
          return traitsMenuiseriePlan(dec(p1, 0.5), { x: ux, y: uy }, { x: (q1.x - q0.x) / ln, y: (q1.y - q0.y) / ln }, w, o.params.menuiserie).map((r, i) => <path key={`m${i}`} d={chemin(pr, r)} fill="currentColor" fillOpacity={0.25} data-menuiserie />);
        })()}
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
        {/* Dormant de porte (D-113) : montants dans la profondeur du dormant. */}
        {o.params.menuiserie && (() => {
          const q0 = dec(p1, 0);
          const q1 = dec(p1, 1);
          const ln = Math.hypot(q1.x - q0.x, q1.y - q0.y) || 1;
          return traitsMenuiseriePlan(dec(p1, 0.5), { x: ux, y: uy }, { x: (q1.x - q0.x) / ln, y: (q1.y - q0.y) / ln }, w, o.params.menuiserie).map((r, i) => <path key={`m${i}`} d={chemin(pr, r)} fill="currentColor" fillOpacity={0.25} data-menuiserie />);
        })()}
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
      return <path d={chemin(pr, pointsSpline(p.points, 8, p.ferme, p.tangentes), p.ferme)} {...commun} />;
    case "construction":
      return <path d={chemin(pr, p.points, false)} {...commun} strokeDasharray="8 4 2 4" strokeWidth={0.8} />;
    case "hachure": {
      // Dégradé (D-120) : gris `de` → `a` le long de la direction du dégradé (bornes du contour sur cette direction).
      if (p.degrade && p.points.length >= 3) {
        const r = (p.degrade.angle.value * Math.PI) / 180;
        const u = { x: Math.cos(r), y: Math.sin(r) };
        const s = p.points.map((q) => q.x * u.x + q.y * u.y);
        const c = p.points[0]!;
        const sc = c.x * u.x + c.y * u.y;
        const A = pr.vers({ x: c.x + u.x * (Math.min(...s) - sc), y: c.y + u.y * (Math.min(...s) - sc) });
        const B = pr.vers({ x: c.x + u.x * (Math.max(...s) - sc), y: c.y + u.y * (Math.max(...s) - sc) });
        const gris = (g: number) => `rgb(${Math.round(g * 255)},${Math.round(g * 255)},${Math.round(g * 255)})`;
        const id = `degrade-${o.id.replace(/[^\w-]/g, "_")}`;
        return (
          <g>
            <defs>
              <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={A.x} y1={A.y} x2={B.x} y2={B.y}>
                <stop offset="0" stopColor={gris(p.degrade.de)} />
                <stop offset="1" stopColor={gris(p.degrade.a)} />
              </linearGradient>
            </defs>
            <path d={chemin(pr, p.points)} {...commun} fill={`url(#${id})`} data-degrade={`${p.degrade.de}-${p.degrade.a}`} />
          </g>
        );
      }
      // Motif importé (D-121) : une famille de traits par ligne de définition, pas en mètres modèle.
      if (p.motifLignes?.length && p.points.length >= 3) {
        const base = `motif-${o.id.replace(/[^\w-]/g, "_")}`;
        const d = chemin(pr, p.points);
        return (
          <g data-motif-importe={p.motifLignes.length}>
            <defs>
              {p.motifLignes.map((f, k) => {
                const w = Math.max(2, f.pas * pr.echelle);
                return (
                  <pattern key={k} id={`${base}-${k}`} width={w} height={w} patternUnits="userSpaceOnUse" patternTransform={`rotate(${-f.angle + 90})`}>
                    <line x1="0" y1="0" x2="0" y2={w} stroke="#355e52" strokeWidth="1" />
                  </pattern>
                );
              })}
            </defs>
            {p.motifLignes.map((_, k) => <path key={k} d={d} fill={`url(#${base}-${k})`} stroke="none" pointerEvents="none" />)}
            <path d={d} {...commun} data-motif={p.motif ?? ""} />
          </g>
        );
      }
      return <path d={chemin(pr, p.points)} {...commun} fill={`url(#hachure-${motifHachure(p.motif).id})`} data-motif={motifHachure(p.motif).id} />;
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
      {/* Motifs de hachure (D-072) : un motif SVG par famille ; à l'écran, 1 mm papier ≈ 3 px. */}
      {Object.entries(MOTIFS_HACHURE).map(([id, m]) => m.points ? (
        <pattern key={id} id={`hachure-${id}`} width={m.points.pasMm * 3} height={m.points.pasMm * 3} patternUnits="userSpaceOnUse">
          <circle cx={m.points.pasMm * 1.5} cy={m.points.pasMm * 1.5} r={Math.max(0.8, m.points.rayonMm * 3)} fill="#355e52" />
        </pattern>
      ) : (
        <pattern key={id} id={`hachure-${id}`} width={m.familles[0]!.pasMm * 3} height={m.familles[0]!.pasMm * 3} patternUnits="userSpaceOnUse" patternTransform={`rotate(${-m.familles[0]!.angle + 90})`}>
          <line x1="0" y1="0" x2="0" y2={m.familles[0]!.pasMm * 3} stroke="#355e52" strokeWidth="1" />
          {m.familles[1] && <line x1="0" y1="0" x2={m.familles[0]!.pasMm * 3} y2="0" stroke="#355e52" strokeWidth="1" />}
        </pattern>
      ))}
    </defs>
  );
}
