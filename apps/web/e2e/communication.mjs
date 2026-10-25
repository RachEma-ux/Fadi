#!/usr/bin/env node
/**
 * Recette du module Communication (COM, Issue #280, docs/workstreams/communication/PLAN.md § COM-8), par l'API et
 * l'interface réelles. Comptes (propriétaire, éditeur, lecteur, extérieur) et projet synthétiques créés par les vraies
 * routes. Scénarios d'acceptation du concept et critères COM-R1 à COM-R7 :
 *   1. Audience : un fil « équipe » n'existe pour le lecteur sur aucune route (liste, détail, références, boîte,
 *      notifications) ; une conversation directe n'est lue que de ses deux participants, pas du propriétaire.
 *   2. Mentions : une mention hors projet est refusée ; une mention d'un membre qui ne lit pas est signalée et ne lui
 *      donne rien ; une conversation privée qui mentionne une étape garde son audience.
 *   3. Partage d'extraits : aperçu (destinataires réels), empreinte exigée, 409 si l'audience change entre-temps ; la
 *      source n'est jamais nommée dans la cible.
 *   4. Changement d'audience : action distincte, journalisée ; refus si un auteur perdait la lecture.
 *   5. Hors ligne : rejeu idempotent (un seul message) ; conflit de contenu 409 ; heure de capture conservée.
 *   6. Accusés de réception : états distincts, compteurs de l'auteur, boîte du destinataire.
 *   7. Modification et retrait : version conservée, texte retiré jamais redonné.
 *   8. Actions liées et demandes de précision : aperçu + empreinte, état relu à la source, cycle complet, droits.
 *   9. Historique reçu à l'ajout d'un participant (COM-D4) ; animation transférée.
 *  10. Révocation avant synchronisation : l'envoi en file est refusé (404), rien n'est publié ; responsabilités du
 *      participant retiré listées pour le propriétaire.
 *  12. Activité du projet filtrable (à traiter, questions ouvertes, auteur, étape), revues liées relues à Studio,
 *      panneaux contextuels Studio (variante) et Documents.
 *  13. Photos et épingles (lot COM-13) : métadonnées retirées, bornes 2 Mo / 2 560 px, types refusés, rejeu sans doublon,
 *      photo lisible de son seul auteur avant d'être jointe, épingle sur une révision exacte, position déclarée en repère
 *      geographic, photo d'un fil d'équipe refusée au lecteur, recopie au partage, observation reprenant la révision,
 *      photo d'un message retiré non servie ; interface : photo jointe et épingle posée.
 *  11. Interface : section Communication (audience affichée avant l'envoi), envoi au clavier (règle d'or), page
 *      « Ma boîte », demandes de précision.
 *
 * BASE_URL=http://localhost:3001 [OUT=captures] node apps/web/e2e/communication.mjs
 */
import { chromium } from "playwright";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? null;
let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs += 1;
}
function client() {
  let cookie = "";
  const c = async (method, path, body) => {
    const res = await fetch(`${BASE}${path}`, {
      method, headers: { "content-type": "application/json", origin: BASE, ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((x) => x.split(";")[0]).join("; ");
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, body: json };
  };
  c.cookie = () => cookie;
  return c;
}
const credentials = (n) => ({ email: `com-${n}-${randomUUID().replaceAll("-", "").slice(0, 12)}@example.test`, password: randomBytes(18).toString("hex") });
const owner = client(), editor = client(), reader = client(), outsider = client();
const cOwner = credentials("p"), cEditor = credentials("e"), cReader = credentials("l"), cOutsider = credentials("x");
for (const [c, cred] of [[owner, cOwner], [editor, cEditor], [reader, cReader], [outsider, cOutsider]]) check(`compte créé (${cred.email.split("-")[1]})`, (await c("POST", "/auth/register", cred)).status === 201);
const idOf = async (c) => { const me = (await c("GET", "/auth/me")).body; return me?.user?.id ?? me?.id; };
const ids = { owner: await idOf(owner), editor: await idOf(editor), reader: await idOf(reader), outsider: await idOf(outsider) };
const code = `COM_${randomUUID().slice(0, 6)}`;
const project = await owner("POST", "/projects", { code, name: "Communication (recette synthétique)" });
const pid = project.body?.id;
check("projet créé", project.status === 201, String(project.status));
check("éditeur et lecteur ajoutés", (await owner("POST", `/projects/${pid}/members`, { email: cEditor.email, role: "editeur" })).status === 201
  && (await owner("POST", `/projects/${pid}/members`, { email: cReader.email, role: "lecteur" })).status === 201);

const com = `/projects/${pid}/com`;
const rid = () => `recette-${randomUUID()}`;
const contient = (r, texte) => JSON.stringify(r.body ?? "").includes(texte);

// ---------------------------------------------------------------------------------------------------------------------
// 1. Audiences
const TITRE_INTERNE = "Préparation interne de la réponse au client (recette)";
const NOTE_INTERNE = "Note interne de recette : marge commerciale à ne pas diffuser";
const interne = await owner("POST", `${com}/conversations`, { mode: "contexte", title: TITRE_INTERNE, audience: "equipe", context: { type: "etape", ref: "4" } });
check("1. fil contextuel « équipe » créé sur l'étape 04, audience affichée", interne.status === 201 && interne.body?.audienceLabel === `Visible par : équipe du projet ${code} (propriétaire et éditeurs)` && interne.body?.context?.label?.startsWith("Étape 04"), JSON.stringify(interne.body));
const cInterne = interne.body?.id;
const mInterne = await owner("POST", `${com}/conversations/${cInterne}/messages`, { body: NOTE_INTERNE, mentions: [ids.reader, ids.editor] });
check("2. mention d'un membre qui ne lit pas : acceptée, signalée à l'auteur", mInterne.status === 201 && mInterne.body?.mentionsSansAcces?.includes(cReader.email) && !mInterne.body?.mentionsSansAcces?.includes(cEditor.email), JSON.stringify(mInterne.body));
check("2. mention hors projet refusée (422), aucune donnée", (await owner("POST", `${com}/conversations/${cInterne}/messages`, { body: "x", mentions: [ids.outsider] })).body?.error === "mention_hors_projet");
const ouvert = await owner("POST", `${com}/conversations`, { mode: "contexte", title: "Questions ouvertes au projet (recette)", audience: "projet", context: { type: "projet" } });
const cOuvert = ouvert.body?.id;
check("1. fil « projet » créé", ouvert.status === 201 && ouvert.body?.audience === "projet");
const lectures = {
  liste: await reader("GET", `${com}/conversations`), detail: await reader("GET", `${com}/conversations/${cInterne}`), boite: await reader("GET", "/com/boite"),
  notifications: await reader("GET", "/notifications"), contexte: await reader("GET", `${com}/conversations?contexte=etape:4`),
};
check("1. lecteur : le fil interne est introuvable (404)", lectures.detail.status === 404);
for (const [route, r] of Object.entries(lectures)) check(`1. lecteur : ni titre ni note interne (${route})`, !contient(r, NOTE_INTERNE) && !contient(r, TITRE_INTERNE), `${r.status}`);
check("1. lecteur : le fil « projet » est listé", lectures.liste.body?.conversations?.some((c) => c.id === cOuvert));
check("1. éditeur : lit le fil interne et reçoit la mention", (await editor("GET", `${com}/conversations/${cInterne}`)).status === 200 && contient(await editor("GET", "/notifications"), NOTE_INTERNE.slice(0, 40)));
check("1. extérieur : aucune conversation du projet (404)", (await outsider("GET", `${com}/conversations`)).status === 404 && (await outsider("GET", `${com}/conversations/${cOuvert}`)).status === 404);
check("1. lecteur : ne crée pas de fil « équipe » (422)", (await reader("POST", `${com}/conversations`, { mode: "contexte", title: "x", audience: "equipe", context: { type: "projet" } })).body?.error === "audience_interdite");

const direct = await editor("POST", `${com}/conversations`, { mode: "direct", participantIds: [ids.reader] });
const cDirect = direct.body?.id;
check("1. conversation directe éditeur ↔ lecteur", direct.status === 201 && direct.body?.audience === "participants");
await editor("POST", `${com}/conversations/${cDirect}/messages`, { body: "Pouvons-nous revoir les options d'entrée demain ?", refs: [{ type: "etape", id: "4" }] });
check("1. le propriétaire ne lit pas une conversation directe qui ne le compte pas (404)", (await owner("GET", `${com}/conversations/${cDirect}`)).status === 404);
const vueDirect = await reader("GET", `${com}/conversations/${cDirect}`);
check("2. conversation privée qui mentionne une étape : audience inchangée, référence résolue", vueDirect.status === 200 && vueDirect.body?.audience === "participants" && vueDirect.body?.messages?.[0]?.refs?.[0]?.label?.startsWith("Étape 04"));
check("1. une conversation directe ne change pas d'audience (409)", (await editor("PATCH", `${com}/conversations/${cDirect}/audience`, { audience: "projet" })).body?.error === "audience_fixe");

// Références : un message de l'équipe cité dans le fil ouvert reste sans libellé pour le lecteur (COM-R2).
const cite = await owner("POST", `${com}/conversations/${cOuvert}/messages`, { body: "Voir la préparation (lien interne)", refs: [{ type: "message", id: mInterne.body?.id }] });
const refLecteur = (await reader("GET", `${com}/conversations/${cOuvert}`)).body?.messages?.find((m) => m.id === cite.body?.id)?.refs?.[0];
const refEditeur = (await editor("GET", `${com}/conversations/${cOuvert}`)).body?.messages?.find((m) => m.id === cite.body?.id)?.refs?.[0];
check("1. référence à un message interne : « non accessible » pour le lecteur, libellé pour l'éditeur", refLecteur?.accessible === false && refLecteur?.label === null && refEditeur?.accessible === true && refEditeur?.label?.includes(TITRE_INTERNE), JSON.stringify({ refLecteur, refEditeur }));
check("1. le lecteur ne cite pas ce qu'il ne lit pas (422)", (await reader("POST", `${com}/conversations/${cOuvert}/messages`, { body: "x", refs: [{ type: "message", id: mInterne.body?.id }] })).body?.error === "reference_invalide");

// ---------------------------------------------------------------------------------------------------------------------
// 3. Partage d'extraits
const reponse = await owner("POST", `${com}/conversations/${cInterne}/messages`, { body: "Réponse technique validée : l'ouverture passe sous la poutre, cote 2,10 m (recette)." });
const apercu = await owner("POST", `${com}/conversations/${cInterne}/partages/apercu`, { messageIds: [reponse.body?.id], cibleId: cOuvert, note: "Réponse au client" });
check("3. aperçu du partage : destinataires réels (lecteur compris) et contenu exact", apercu.status === 200 && apercu.body?.destinataires?.includes(cReader.email) && apercu.body?.contenu?.length === 1 && !JSON.stringify(apercu.body.contenu).includes(NOTE_INTERNE), JSON.stringify(apercu.body));
check("3. confirmation sans empreinte ou avec une empreinte fausse : 409", (await owner("POST", `${com}/conversations/${cInterne}/partages`, { messageIds: [reponse.body?.id], cibleId: cOuvert, note: "Réponse au client", empreinte: "faux" })).body?.error === "apercu_perime");
const partage = await owner("POST", `${com}/conversations/${cInterne}/partages`, { messageIds: [reponse.body?.id], cibleId: cOuvert, note: "Réponse au client", empreinte: apercu.body?.empreinte });
check("3. partage confirmé", partage.status === 201, JSON.stringify(partage.body));
const ouvertLecteur = await reader("GET", `${com}/conversations/${cOuvert}`);
const recu = ouvertLecteur.body?.messages?.find((m) => m.id === partage.body?.id);
check("3. le lecteur lit l'extrait choisi, jamais la note interne ni le titre de la source", recu?.nature === "partage" && recu?.body?.includes("cote 2,10 m") && !contient(ouvertLecteur, NOTE_INTERNE) && !contient(ouvertLecteur, TITRE_INTERNE), JSON.stringify(recu));
// Aperçu périmé : l'audience de la cible change entre l'aperçu et la confirmation.
const apercu2 = await owner("POST", `${com}/conversations/${cInterne}/partages/apercu`, { messageIds: [reponse.body?.id], cibleId: cOuvert });
const autreFil = await owner("POST", `${com}/conversations`, { mode: "contexte", title: "Fil sans lecteur (recette)", audience: "equipe", context: { type: "projet" } });
const apercu3 = await owner("POST", `${com}/conversations/${cInterne}/partages/apercu`, { messageIds: [reponse.body?.id], cibleId: autreFil.body?.id });
await owner("PATCH", `${com}/conversations/${autreFil.body?.id}/audience`, { audience: "projet" });
check("3. audience de la cible changée après l'aperçu : 409 apercu_perime", (await owner("POST", `${com}/conversations/${cInterne}/partages`, { messageIds: [reponse.body?.id], cibleId: autreFil.body?.id, empreinte: apercu3.body?.empreinte })).body?.error === "apercu_perime" && apercu2.status === 200);

// ---------------------------------------------------------------------------------------------------------------------
// 4. Changement d'audience
await reader("POST", `${com}/conversations/${cOuvert}/messages`, { body: "Merci, lu (lecteur)." });
check("4. réserver à l'équipe un fil où le lecteur a écrit : refusé (409)", (await owner("PATCH", `${com}/conversations/${cOuvert}/audience`, { audience: "equipe" })).body?.error === "audience_auteur_exclu");
check("4. un lecteur ne change pas l'audience (403)", (await reader("PATCH", `${com}/conversations/${cOuvert}/audience`, { audience: "projet" })).status === 403);
const journal = (await owner("GET", `${com}/conversations/${autreFil.body?.id}`)).body?.journal ?? [];
check("4. changement d'audience journalisé (avant, après, acteur)", journal.some((e) => e.action === "audience" && e.detail?.avant === "equipe" && e.detail?.apres === "projet" && e.acteur === cOwner.email));

// ---------------------------------------------------------------------------------------------------------------------
// 5. Hors ligne : rejeu idempotent
const requete = rid();
const capture = new Date(Date.now() - 5 * 60_000).toISOString();
const env1 = await editor("POST", `${com}/conversations/${cOuvert}/messages`, { body: "Observation de terrain saisie hors ligne (recette)", clientRequestId: requete, capturedAt: capture, urgent: true });
const env2 = await editor("POST", `${com}/conversations/${cOuvert}/messages`, { body: "Observation de terrain saisie hors ligne (recette)", clientRequestId: requete, capturedAt: capture, urgent: true });
const env3 = await editor("POST", `${com}/conversations/${cOuvert}/messages`, { body: "Autre contenu", clientRequestId: requete });
const fil5 = (await editor("GET", `${com}/conversations/${cOuvert}`)).body?.messages ?? [];
check("5. rejeu : même identifiant, un seul message, 201 puis 200", env1.status === 201 && env2.status === 200 && env2.body?.replayed === true && env2.body?.id === env1.body?.id && fil5.filter((m) => m.body === "Observation de terrain saisie hors ligne (recette)").length === 1);
check("5. même identifiant, autre contenu : 409", env3.body?.error === "request_conflict");
check("5. heure de capture distincte de la réception", fil5.find((m) => m.id === env1.body?.id)?.capturedAt === new Date(capture).toISOString().replace(".000Z", ".000Z") || Math.abs(new Date(fil5.find((m) => m.id === env1.body?.id)?.capturedAt).getTime() - new Date(capture).getTime()) < 1000);

// ---------------------------------------------------------------------------------------------------------------------
// 6. Accusés de réception
const ack = await owner("POST", `${com}/conversations/${cOuvert}/messages`, { body: "Merci d'accuser réception de la réponse (recette).", ackRequired: true });
check("6. le destinataire voit l'accusé attendu dans sa boîte", (await reader("GET", "/com/boite")).body?.items?.some((i) => i.kind === "accuse" && i.conversationId === cOuvert));
check("6. ouvrir n'est pas accuser (COM-R6)", (await reader("POST", `${com}/conversations/${cOuvert}/lu`)).status === 200);
let remise = (await owner("GET", `${com}/conversations/${cOuvert}`)).body?.messages?.find((m) => m.id === ack.body?.id)?.remise;
check("6. compteurs : ouvert par le lecteur, aucun accusé", remise?.ouverts >= 1 && remise?.accuses === 0 && remise?.enAttente?.includes(cReader.email), JSON.stringify(remise));
check("6. accusé du lecteur", (await reader("POST", `${com}/messages/${ack.body?.id}/accuse`)).status === 200);
check("6. l'auteur n'accuse pas son propre message (409)", (await owner("POST", `${com}/messages/${ack.body?.id}/accuse`)).body?.error === "accuse_auteur");
remise = (await owner("GET", `${com}/conversations/${cOuvert}`)).body?.messages?.find((m) => m.id === ack.body?.id)?.remise;
check("6. compteurs : un accusé, le lecteur n'est plus attendu", remise?.accuses === 1 && !remise?.enAttente?.includes(cReader.email));
check("6. la boîte du lecteur n'attend plus cet accusé", !(await reader("GET", "/com/boite")).body?.items?.some((i) => i.id === `accuse:${ack.body?.id}`));

// ---------------------------------------------------------------------------------------------------------------------
// 7. Modification et retrait
const edit = await editor("POST", `${com}/conversations/${cOuvert}/messages`, { body: "Première version (recette)" });
check("7. modification par l'auteur", (await editor("PATCH", `${com}/messages/${edit.body?.id}`, { body: "Version corrigée (recette)" })).status === 200);
check("7. un autre ne modifie pas (403)", (await owner("PATCH", `${com}/messages/${edit.body?.id}`, { body: "x" })).status === 403);
const versions = (await reader("GET", `${com}/messages/${edit.body?.id}/versions`)).body;
check("7. version remplacée conservée et visible de l'audience", Array.isArray(versions) && versions[0]?.body === "Première version (recette)");
check("7. retrait par l'auteur", (await editor("DELETE", `${com}/messages/${edit.body?.id}`)).status === 204);
const retire = (await reader("GET", `${com}/conversations/${cOuvert}`)).body?.messages?.find((m) => m.id === edit.body?.id);
const versions2 = (await reader("GET", `${com}/messages/${edit.body?.id}/versions`)).body;
check("7. message retiré : indication visible, texte jamais redonné (aucune version, même modifiée avant le retrait)", retire?.withdrawn === true && retire?.body === null && versions2?.length === 2 && versions2.every((v) => v.body === null) && !contient(await reader("GET", `${com}/conversations/${cOuvert}`), "Version corrigée (recette)"));

// ---------------------------------------------------------------------------------------------------------------------
// 8. Actions liées et demandes de précision
const question = await owner("POST", `${com}/conversations/${cInterne}/messages`, { body: "Le linteau de l'ouverture A-204 est-il compatible avec la poutre du niveau 2 ? (recette)" });
const actionCorps = { type: "demande", responderId: ids.editor, audience: "equipe", echeance: "2026-01-05" };
const apA = await owner("POST", `${com}/messages/${question.body?.id}/actions/apercu`, actionCorps);
check("8. aperçu de l'action liée : audience et destinataires (sans le lecteur)", apA.status === 200 && apA.body?.destinataires?.includes(cEditor.email) && !apA.body?.destinataires?.includes(cReader.email), JSON.stringify(apA.body));
const act = await owner("POST", `${com}/messages/${question.body?.id}/actions`, { ...actionCorps, empreinte: apA.body?.empreinte });
check("8. demande de précision créée depuis le message", act.status === 201 && act.body?.targetType === "demande", JSON.stringify(act.body));
const act2 = await owner("POST", `${com}/messages/${question.body?.id}/actions`, { ...actionCorps, empreinte: apA.body?.empreinte });
check("8. rejeu de l'action : aucune seconde demande", act2.status === 200 && act2.body?.targetId === act.body?.targetId);
const did = act.body?.targetId;
const dem = `/projects/${pid}/collaboration/demandes`;
const lien = (await owner("GET", `${com}/conversations/${cInterne}`)).body?.messages?.find((m) => m.id === act.body?.messageId)?.refs?.find((r) => r.type === "demande");
check("8. message d'action : état relu à la source (ouverte)", lien?.statut === "ouverte" && lien?.accessible === true);
check("8. la demande est en retard (échéance passée) mais reste ouverte", (await editor("GET", `${dem}/${did}`)).body?.enRetard === true);
check("8. lecteur : la demande d'équipe est absente (liste, détail)", !contient(await reader("GET", dem), did) && (await reader("GET", `${dem}/${did}`)).status === 404);
check("8. boîte du répondant : demande à répondre", (await editor("GET", "/com/boite")).body?.items?.some((i) => i.kind === "demande-a-repondre" && i.demandeId === did));
check("8. le demandeur ne répond pas à la place du répondant (403)", (await owner("POST", `${dem}/${did}/transitions`, { action: "repondre", body: "x" })).status === 403);
check("8. réattribuer au lecteur, qui ne lit pas la demande : 422", (await owner("POST", `${dem}/${did}/transitions`, { action: "reattribuer", responderId: ids.reader })).body?.error === "repondant_sans_acces");
const rep = await editor("POST", `${dem}/${did}/transitions`, { action: "repondre", body: "Oui, avec un linteau de 25 cm (recette)." });
check("8. réponse du répondant : « répondue »", rep.status === 200 && rep.body?.statut === "repondue");
check("8. boîte du demandeur : réponse à clore", (await owner("GET", "/com/boite")).body?.items?.some((i) => i.kind === "demande-repondue" && i.demandeId === did));
check("8. notification « demande » au demandeur", (await owner("GET", "/notifications")).body?.items?.some((i) => i.kind === "demande" && i.com?.demandeId === did));
const clos = await owner("POST", `${dem}/${did}/transitions`, { action: "cloturer" });
const rouvre = await owner("POST", `${dem}/${did}/transitions`, { action: "rouvrir", body: "Précisez la portée (recette)" });
check("8. clôture puis réouverture, journal complet, question jamais réécrite", clos.body?.statut === "close" && rouvre.body?.statut === "ouverte" && rouvre.body?.journal?.map((e) => e.action).join(",") === "ouvrir,repondre,cloturer,rouvrir" && rouvre.body?.question === "Le linteau de l'ouverture A-204 est-il compatible avec la poutre du niveau 2 ? (recette)");
check("8. clôture sans réponse : motif exigé (422)", (await owner("POST", `${dem}/${did}/transitions`, { action: "cloturer" })).body?.error === "motif_exige");
const demLecteur = await reader("POST", dem, { question: "Quelle est la date de la prochaine visite ? (recette)", responderId: ids.owner, clientRequestId: rid() });
check("8. un lecteur crée une demande, toujours pour tout le projet", demLecteur.status === 201 && demLecteur.body?.audience === "projet");

// Observation Studio liée (COM-D11) : l'observation est créée par Studio, COM garde le lien.
const etude = await owner("POST", `/projects/${pid}/studio/studies`, { name: "Étude communication (recette)" });
const studyId = etude.body?.study?.id, variantId = etude.body?.variant?.id;
const obsCorps = { type: "observation-studio", studyId, variantId, responsableId: ids.editor, audience: "projet" };
const apO = await owner("POST", `${com}/messages/${reponse.body?.id}/actions/apercu`, obsCorps);
const obs = await owner("POST", `${com}/messages/${reponse.body?.id}/actions`, { ...obsCorps, empreinte: apO.body?.empreinte });
check("8. observation Studio ouverte depuis un message (audience confirmée)", etude.status === 201 && obs.status === 201 && obs.body?.targetType === "observation-studio", JSON.stringify(obs.body));
const obsStudio = await editor("GET", `/projects/${pid}/studio/studies/${studyId}/variants/${variantId}/observations/${obs.body?.targetId}`);
check("8. l'observation existe dans Studio avec son responsable (enregistrement de référence)", obsStudio.status === 200 && JSON.stringify(obsStudio.body).includes(ids.editor), `${obsStudio.status}`);

// ---------------------------------------------------------------------------------------------------------------------
// 9. Groupe, historique reçu, animation
const groupe = await owner("POST", `${com}/conversations`, { mode: "groupe", title: "Coordination structure (recette)", participantIds: [ids.reader] });
const cGroupe = groupe.body?.id;
await owner("POST", `${com}/conversations/${cGroupe}/messages`, { body: "Message antérieur à l'ajout (recette)" });
check("9. ajout de l'éditeur « à partir de maintenant »", (await owner("POST", `${com}/conversations/${cGroupe}/participants`, { userId: ids.editor, historique: "depuis-ajout" })).status === 201);
await new Promise((r) => setTimeout(r, 20));
await owner("POST", `${com}/conversations/${cGroupe}/messages`, { body: "Message postérieur à l'ajout (recette)" });
const vueE = await editor("GET", `${com}/conversations/${cGroupe}`);
check("9. l'éditeur ne reçoit que l'historique choisi", vueE.status === 200 && !contient(vueE, "Message antérieur à l'ajout") && contient(vueE, "Message postérieur à l'ajout"));
check("9. l'ajout est journalisé avec le choix d'historique", vueE.body?.journal?.some((e) => e.action === "participant-ajoute" && e.detail?.historique === "depuis-ajout"));
check("9. animation transférée au lecteur (journalisée)", (await owner("PUT", `${com}/conversations/${cGroupe}/animateur`, { userId: ids.reader })).status === 200
  && (await reader("GET", `${com}/conversations/${cGroupe}`)).body?.steward?.email === cReader.email);
check("9. notification « message » d'un groupe à ses participants", (await reader("GET", "/notifications")).body?.items?.some((i) => i.kind === "message" && i.com?.conversationId === cGroupe));

// ---------------------------------------------------------------------------------------------------------------------
// 12. Activité du projet, revues liées et panneaux contextuels (concept « Project activity », « Requests and reviews »,
// « Studio Parcours Documents > Contextual panel »)
const activite = await owner("GET", `${com}/activite`);
const libelles = new Set((activite.body?.items ?? []).map((i) => `${i.famille}:${i.libelle}`));
check("12. activité : messages, demandes et observations, avec des libellés distincts", activite.status === 200 && libelles.has("demande:Question posée") && libelles.has("demande:Réponse") && libelles.has("observation:Observation ouverte") && [...libelles].some((l) => l.startsWith("message:")), JSON.stringify([...libelles]));
check("12. activité : la saisie hors ligne garde son heure de capture", (activite.body?.items ?? []).some((i) => i.capturedAt && i.texte.includes("saisie hors ligne")));
const actLecteur = await reader("GET", `${com}/activite`);
check("12. activité du lecteur : ni note interne, ni demande d'équipe", actLecteur.status === 200 && !contient(actLecteur, NOTE_INTERNE) && !contient(actLecteur, "Le linteau de l'ouverture A-204"));
const aTraiter = (await owner("GET", `${com}/activite?filtre=a-traiter`)).body?.items ?? [];
check("12. filtre « à traiter par moi » : la question du lecteur adressée au propriétaire", aTraiter.some((i) => i.famille === "demande" && i.titre.includes("prochaine visite")) && aTraiter.every((i) => i.aTraiter));
const ouvertesF = (await owner("GET", `${com}/activite?filtre=questions-ouvertes`)).body?.items ?? [];
check("12. filtre « questions non résolues »", ouvertesF.length >= 1 && ouvertesF.every((i) => i.famille === "demande" && i.libelle === "Question posée"));
const parAuteur = (await owner("GET", `${com}/activite?auteur=${ids.editor}`)).body?.items ?? [];
check("12. filtre par auteur", parAuteur.length >= 1 && parAuteur.every((i) => i.auteur.id === ids.editor));
check("12. filtre par étape (fil de l'étape 04)", ((await owner("GET", `${com}/activite?etape=4`)).body?.items ?? []).some((i) => i.titre === TITRE_INTERNE));
check("12. filtre inconnu refusé (400)", (await owner("GET", `${com}/activite?filtre=nimporte`)).status === 400);
const pub = await owner("POST", `/projects/${pid}/studio/studies/${studyId}/variants/${variantId}/publications`, { title: "Dossier de revue (recette communication)", requestId: rid() });
const revues = await reader("GET", `${com}/revues`);
check("12. revues liées : état relu à Studio, lisible du lecteur", revues.status === 200 && Array.isArray(revues.body) && (pub.status !== 201 || revues.body.some((r) => r.id === pub.body?.id && r.statut === pub.body?.status)), `${pub.status} ${JSON.stringify(revues.body)}`);
const filVariante = await editor("POST", `${com}/conversations`, { mode: "contexte", title: "Échange sur la variante (recette)", audience: "projet", context: { type: "studio-variante", ref: variantId } });
check("12. panneau contextuel Studio : fil sur la variante, listé par son contexte", filVariante.status === 201 && filVariante.body?.context?.label?.includes("Étude communication") && ((await reader("GET", `${com}/conversations?contexte=studio-variante:${variantId}`)).body?.conversations ?? []).some((c) => c.id === filVariante.body?.id), JSON.stringify(filVariante.body));
check("12. panneau contextuel Documents : un document absent du projet est refusé (422)", (await owner("POST", `${com}/conversations`, { mode: "contexte", title: "x", audience: "equipe", context: { type: "document", ref: "inexistant" } })).body?.error === "reference_invalide");

// ---------------------------------------------------------------------------------------------------------------------
// 13. Photos et épingles (lot COM-13, COM-D15 à COM-D19)
const brut = async (c, path, buffer, headers = {}) => {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "image/jpeg", origin: BASE, cookie: c.cookie(), ...headers }, body: buffer });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
};
const lirePiece = async (c, id) => { const r = await fetch(`${BASE}${com}/pieces/${id}`, { headers: { cookie: c.cookie() } }); return { status: r.status, type: r.headers.get("content-type"), octets: Buffer.from(await r.arrayBuffer()) }; };
// Une vraie photo JPEG produite par un navigateur, puis une section EXIF « GPS » insérée après SOI (comme un appareil).
const navigateurPhoto = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const [jpegReel, jpegAutre] = (await (await navigateurPhoto.newPage()).evaluate(() => ["#2f6f57", "#7a4b00"].map((fond) => {
  const c = document.createElement("canvas"); c.width = 640; c.height = 480;
  const g = c.getContext("2d"); g.fillStyle = fond; g.fillRect(0, 0, 640, 480); g.fillStyle = "#fff"; g.fillRect(100, 100, 200, 120);
  return c.toDataURL("image/jpeg", 0.8).split(",")[1];
}))).map((b) => Buffer.from(b, "base64"));
await navigateurPhoto.close();
const exif = Buffer.from("Exif\0\0GPSLatitude 48.8566 GPSLongitude 2.3522", "latin1");
const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0, exif.length + 2]), exif]);
const jpegExif = Buffer.concat([jpegReel.subarray(0, 2), app1, jpegReel.subarray(2)]);
const seg = (m, corps) => Buffer.concat([Buffer.from([0xff, m, (corps.length + 2) >> 8, (corps.length + 2) & 0xff]), corps]);
const sofCorps = (w, h) => { const b = Buffer.alloc(15); b[0] = 8; b.writeUInt16BE(h, 1); b.writeUInt16BE(w, 3); b[5] = 3; return b; };
const jpegGeant = Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xc0, sofCorps(3000, 2000)), seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])), Buffer.from([0xff, 0xd9])]);
const pieces = `${com}/conversations/${cOuvert}/pieces`;
const req1 = rid();
const p1 = await brut(editor, pieces, jpegExif, { "x-client-request-id": req1 });
check("13. photo téléversée : JPEG reconnu, dimensions lues", p1.status === 201 && p1.body?.mime === "image/jpeg" && p1.body?.width === 640 && p1.body?.height === 480, JSON.stringify(p1.body));
const p1bis = await brut(editor, pieces, jpegExif, { "x-client-request-id": req1 });
check("13. rejeu de la photo : même identifiant, aucun doublon (200)", p1bis.status === 200 && p1bis.body?.id === p1.body?.id && p1bis.body?.replayed === true);
check("13. même identifiant de requête, autre photo : 409", (await brut(editor, pieces, jpegAutre, { "x-client-request-id": req1 })).body?.error === "request_conflict");
const lue = await lirePiece(editor, p1.body?.id);
check("13. métadonnées retirées par le serveur (position GPS comprise)", lue.status === 200 && lue.type === "image/jpeg" && !lue.octets.toString("latin1").includes("GPSLatitude") && lue.octets.subarray(0, 2).equals(Buffer.from([0xff, 0xd8])));
check("13. photo non jointe : lisible de son seul auteur", (await lirePiece(owner, p1.body?.id)).status === 404 && (await lirePiece(reader, p1.body?.id)).status === 404);
check("13. au-delà de 2 Mo : 413", (await brut(editor, pieces, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(3 * 1024 * 1024)]))).status === 413);
check("13. type autre que JPEG ou PNG : 415", (await brut(editor, pieces, Buffer.from("GIF89a....."), { "content-type": "image/gif" })).status === 415);
check("13. au-delà de 2 560 px : 422", (await brut(editor, pieces, jpegGeant)).body?.error === "photo_trop_grande");
check("13. extérieur : aucune photo téléversable (404)", (await brut(outsider, pieces, jpegReel)).status === 404);
const plan = await editor("GET", `${com}/plan?studyId=${studyId}&variantId=${variantId}`);
check("13. plan de la révision de tête : SVG Studio et identifiant de révision", plan.status === 200 && plan.body?.tete === true && String(plan.body?.svg).includes("<svg") && !!plan.body?.revisionId, `${plan.status}`);
const revTete = plan.body?.revisionId;
const corpsTerrain = { body: "Fissure au droit de l'ouverture, voir photo (recette)", pieces: [p1.body?.id], epingle: { studyId, variantId, revisionId: revTete, point: { x: 1.5, y: 2 } }, localisation: { lat: 48.8566, lon: 2.3522, precisionM: 12 } };
const terrain = await editor("POST", `${com}/conversations/${cOuvert}/messages`, corpsTerrain);
check("13. message de terrain : photo, épingle et position jointes", terrain.status === 201, JSON.stringify(terrain.body));
check("13. une photo déjà jointe ne se joint pas deux fois (422)", (await editor("POST", `${com}/conversations/${cOuvert}/messages`, { body: "x", pieces: [p1.body?.id] })).body?.error === "pieces_invalides");
check("13. épingle sur une révision inconnue : 422", (await editor("POST", `${com}/conversations/${cOuvert}/messages`, { body: "x", epingle: { studyId, variantId, revisionId: "inconnue", point: { x: 0, y: 0 } } })).body?.error === "epingle_invalide");
check("13. épingle citant un objet absent de la révision : 422", (await editor("POST", `${com}/conversations/${cOuvert}/messages`, { body: "x", epingle: { studyId, variantId, revisionId: revTete, point: { x: 0, y: 0 }, objetIds: ["absent"] } })).body?.error === "epingle_invalide");
check("13. position hors WGS84 : 422", (await editor("POST", `${com}/conversations/${cOuvert}/messages`, { body: "x", localisation: { lat: 95, lon: 0 } })).body?.error === "position_invalide");
const vueTerrain = (await reader("GET", `${com}/conversations/${cOuvert}`)).body?.messages?.find((m) => m.id === terrain.body?.id);
check("13. lecteur : photo, épingle sur la révision exacte (repère local), position (repère geographic)", vueTerrain?.pieces?.[0]?.id === p1.body?.id && vueTerrain?.epingle?.revisionId === revTete && vueTerrain?.epingle?.repere === "local" && vueTerrain?.epingle?.point?.x === 1.5 && vueTerrain?.localisation?.repere === "geographic" && vueTerrain?.localisation?.precisionM === 12, JSON.stringify(vueTerrain));
check("13. lecteur : la photo jointe est lisible ; extérieur : 404", (await lirePiece(reader, p1.body?.id)).status === 200 && (await lirePiece(outsider, p1.body?.id)).status === 404);
const planFige = await reader("GET", `${com}/plan?studyId=${studyId}&variantId=${variantId}&revisionId=${revTete}`);
check("13. plan de la révision épinglée relu à l'identique", planFige.status === 200 && planFige.body?.revisionId === revTete);
// Photo d'un fil d'équipe : le lecteur ne la lit pas ; partagée par extrait, elle est recopiée (nouvel identifiant).
const pInterne = await brut(owner, `${com}/conversations/${cInterne}/pieces`, jpegReel, { "x-client-request-id": rid() });
const mInterneP = await owner("POST", `${com}/conversations/${cInterne}/messages`, { body: "Photo interne du relevé (recette)", pieces: [pInterne.body?.id] });
check("13. photo d'un fil d'équipe : refusée au lecteur (404)", mInterneP.status === 201 && (await lirePiece(reader, pInterne.body?.id)).status === 404);
const apP = await owner("POST", `${com}/conversations/${cInterne}/partages/apercu`, { messageIds: [mInterneP.body?.id], cibleId: cOuvert });
check("13. aperçu du partage : la photo est annoncée", apP.body?.contenu?.[0]?.photos?.length === 1);
const parP = await owner("POST", `${com}/conversations/${cInterne}/partages`, { messageIds: [mInterneP.body?.id], cibleId: cOuvert, empreinte: apP.body?.empreinte });
const recuP = (await reader("GET", `${com}/conversations/${cOuvert}`)).body?.messages?.find((m) => m.id === parP.body?.id);
check("13. photo partagée : recopiée dans la cible, lisible du lecteur ; l'originale reste interne", parP.status === 201 && recuP?.pieces?.length === 1 && recuP.pieces[0].id !== pInterne.body?.id
  && (await lirePiece(reader, recuP.pieces[0].id)).status === 200 && (await lirePiece(reader, pInterne.body?.id)).status === 404);
// Observation Studio depuis le message épinglé : elle reprend la révision exacte (COM-D18).
const obsP = { type: "observation-studio", studyId, variantId, responsableId: ids.editor, audience: "projet" };
const apObs = await editor("POST", `${com}/messages/${terrain.body?.id}/actions/apercu`, obsP);
const obsPin = await editor("POST", `${com}/messages/${terrain.body?.id}/actions`, { ...obsP, empreinte: apObs.body?.empreinte });
const obsLue = await editor("GET", `/projects/${pid}/studio/studies/${studyId}/variants/${variantId}/observations/${obsPin.body?.targetId}`);
check("13. observation Studio créée depuis le message épinglé : révision exacte reprise", obsPin.status === 201 && JSON.stringify(obsLue.body).includes(revTete), `${obsPin.status} ${JSON.stringify(obsLue.body).slice(0, 300)}`);
// Message retiré : ses photos ne sont plus servies.
const pRetrait = await brut(editor, pieces, jpegReel, { "x-client-request-id": rid() });
const mRetrait = await editor("POST", `${com}/conversations/${cOuvert}/messages`, { body: "Photo à retirer (recette)", pieces: [pRetrait.body?.id] });
await editor("DELETE", `${com}/messages/${mRetrait.body?.id}`);
check("13. message retiré : sa photo n'est plus servie, même à l'auteur", (await lirePiece(editor, pRetrait.body?.id)).status === 404 && (await lirePiece(reader, pRetrait.body?.id)).status === 404);

// ---------------------------------------------------------------------------------------------------------------------
// 10. Révocation avant synchronisation
const enFile = rid();
check("10. le lecteur est retiré du projet", (await owner("DELETE", `/projects/${pid}/members/${ids.reader}`)).status === 204);
const tardif = await reader("POST", `${com}/conversations/${cOuvert}/messages`, { body: "Envoi en file après révocation (recette)", clientRequestId: enFile });
check("10. envoi en file après révocation : refusé (404), rien n'est publié", tardif.status === 404 && !contient(await owner("GET", `${com}/conversations/${cOuvert}`), "Envoi en file après révocation"));
check("10. le lecteur retiré ne lit plus rien (liste, groupe, boîte)", (await reader("GET", `${com}/conversations`)).status === 404 && (await reader("GET", `${com}/conversations/${cGroupe}`)).status === 404 && !(await reader("GET", "/com/boite")).body?.items?.some((i) => i.projectId === pid));
const resp = (await owner("GET", `${com}/responsabilites`)).body ?? [];
const respL = resp.find((p) => p.userId === ids.reader);
check("10. responsabilités du participant retiré listées (animation, demande), auteur conservé", respL?.aAcces === false && respL?.conversationsAnimees?.some((c) => c.id === cGroupe) && respL?.demandesOuvertes?.length >= 1, JSON.stringify(respL));
check("10. responsabilités réservées au propriétaire (403)", (await editor("GET", `${com}/responsabilites`)).status === 403);
check("10. le propriétaire reprend l'animation", (await owner("PUT", `${com}/conversations/${cGroupe}/animateur`, { userId: ids.owner })).status === 200);
const auteurGarde = (await owner("GET", `${com}/conversations/${cOuvert}`)).body?.messages?.find((m) => m.body === "Merci, lu (lecteur).");
check("10. l'historique garde son auteur, signalé sans accès", auteurGarde?.author?.email === cReader.email && auteurGarde?.author?.aAcces === false);

// ---------------------------------------------------------------------------------------------------------------------
// 11. Interface
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const [cle, valeur] = owner.cookie().split(";")[0].split("=");
  await page.context().addCookies([{ name: cle, value: valeur, url: BASE }]);
  await page.goto(`${BASE}/projets/${pid}?module=collaboration`, { waitUntil: "domcontentloaded" });
  const section = page.locator("[data-com-panel]");
  await section.waitFor({ timeout: 30_000 });
  check("11. section Communication présente", await section.isVisible());
  await page.locator(`[data-com-conversation="${cOuvert}"]`).click();
  const ligne = page.locator("[data-com-audience-label]");
  await ligne.waitFor({ timeout: 15_000 });
  check("11. audience affichée avant l'envoi (COM-R1)", (await ligne.textContent())?.includes("Visible par : tous les membres du projet"));
  const zone = page.locator("[data-com-composer] textarea");
  await zone.fill("Message envoyé au clavier depuis l'interface (recette)");
  await zone.press("Alt+Shift+Digit5");
  await page.locator("[data-com-message]", { hasText: "Message envoyé au clavier depuis l'interface (recette)" }).waitFor({ timeout: 15_000 });
  check("11. règle d'or : envoi au clavier (Alt+Maj+5), message accepté par Fadi", true);
  const kbd = await page.locator('[data-raccourci-collaboration="envoyer-message"]').first().textContent();
  check("11. raccourci affiché à côté de la commande", kbd === "Alt+Maj+5", String(kbd));
  check("11. section Demandes de précision listée", await page.locator("[data-com-demandes]").isVisible());
  // Photo jointe depuis l'interface : choisie, compressée et gardée sur l'appareil, puis envoyée avec le message.
  await page.locator("[data-com-fichier-photo]").setInputFiles({ name: "chantier.jpg", mimeType: "image/jpeg", buffer: jpegExif });
  await page.locator("[data-com-photo-locale]").first().waitFor({ timeout: 15_000 });
  check("11. photo choisie : aperçu local avant l'envoi", (await page.locator("[data-com-photo-locale]").count()) === 1);
  await zone.fill("Relevé photo envoyé depuis l'interface (recette)");
  await page.locator('[data-commande-collaboration="envoyer-message"]').click();
  const msgPhoto = page.locator("[data-com-message]", { hasText: "Relevé photo envoyé depuis l'interface (recette)" });
  await msgPhoto.waitFor({ timeout: 20_000 });
  await msgPhoto.locator("[data-com-photo]").first().waitFor({ timeout: 20_000 });
  check("11. photo envoyée : affichée dans le fil (image décodée)", await msgPhoto.locator("[data-com-photo]").first().evaluate((img) => img.complete && img.naturalWidth > 0));
  check("11. règle d'or : « Joindre une photo » et « Épingler sur un plan » avec leur raccourci", (await page.locator('[data-raccourci-collaboration="joindre-photo"]').first().textContent()) === "Alt+Maj+." && (await page.locator('[data-raccourci-collaboration="epingler"]').first().textContent()) === "Alt+Maj+`");
  // Épingle posée au clavier puis sur le plan.
  await zone.press("Alt+Shift+Backquote");
  await page.locator(".confirm-dialog select").first().selectOption(studyId);
  await page.locator(".confirm-dialog select").nth(1).selectOption(variantId);
  await page.locator("[data-com-plan-zone]").waitFor({ timeout: 15_000 });
  await page.locator("[data-com-plan-zone]").click({ position: { x: 40, y: 40 } });
  await page.locator("[data-confirm]").click();
  await page.locator("[data-com-epingle-choisie]").waitFor({ timeout: 10_000 });
  await zone.fill("Message épinglé depuis l'interface (recette)");
  await page.locator('[data-commande-collaboration="envoyer-message"]').click();
  const msgPin = page.locator("[data-com-message]", { hasText: "Message épinglé depuis l'interface (recette)" });
  await msgPin.locator("[data-com-epingle]").waitFor({ timeout: 20_000 });
  await msgPin.locator("[data-com-epingle] summary").click();
  await msgPin.locator("[data-com-epingle-marque]").waitFor({ timeout: 15_000 });
  check("11. épingle posée sur le plan, affichée avec sa marque", await msgPin.locator("[data-com-epingle-marque]").isVisible());
  check("11. activité du projet et revues liées affichées", await page.locator("[data-com-activite]").isVisible() && await page.locator("[data-com-revues]").isVisible());
  await page.locator('[data-com-filtre="a-traiter"]').click();
  await page.locator("[data-com-activite-item]").first().waitFor({ timeout: 15_000 });
  check("11. filtre « À traiter par moi » dans l'interface", (await page.locator("[data-com-activite-item]").count()) >= 1);
  if (OUT) { mkdirSync(OUT, { recursive: true }); await msgPin.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}/communication-projet.png`, fullPage: false }); }
  await page.goto(`${BASE}/boite`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-com-boite]").waitFor({ timeout: 30_000 });
  await page.locator('[data-com-boite-item="demande-a-repondre"]').first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  check("11. page « Ma boîte » : la demande du lecteur à répondre apparaît", await page.locator('[data-com-boite-item="demande-a-repondre"]').count() >= 1 && (await page.locator("[data-com-boite]").textContent())?.includes(`Demande de ${cReader.email}`));
  if (OUT) await page.screenshot({ path: `${OUT}/communication-boite.png`, fullPage: false });
} finally {
  await browser.close();
}

console.log(echecs ? `\n${echecs} échec(s).` : "\nRecette Communication : tout est conforme.");
process.exit(echecs ? 1 : 0);
