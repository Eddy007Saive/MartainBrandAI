#!/usr/bin/env node
/**
 * Serveur HTTP « montage par l'agent » — à lancer sur le VPS.
 * Permet de demander un montage à Claude Code depuis l'extérieur (Postorico, curl, n8n…).
 *
 *   POST /montages            { videos: [url…] et/ou fichiers: [nom…], consignes, format: "9:16"|"16:9"|"1:1", duree_max_s }
 *                             (fichiers = vidéos déjà déposées dans le dossier ASSETS du VPS, ex. scp)
 *                             + transcriptions: [{language, words:[{text,start,end}]}…] même ordre que les vidéos
 *                               (fichiers puis videos), mots horodatés sur la vidéo APRÈS coupe
 *                             + coupes: [[[debut, fin]…]…] morceaux à garder de chaque vidéo : le serveur coupe
 *                               les silences lui-même avant de lancer l'agent
 *                             + illustrations: [{type: broll|schema, url?, rush, debut, duree, description}…]
 *                             + images: [{url, description?}…] photos du client à placer par l'agent
 *                             + logo_url : logo de la marque (absent = montage sans logo)
 *                             + musique_url, musique_volume (%) : musique de fond mixée sous la voix
 *                             mode: "motion" + voix_url : vidéo animée SANS tournage, sur une voix off (pas de vidéos)
 *                             -> { id, statut: "en_attente" }
 *   POST /montages/:id/corrections { consignes, images?, musique_url?, musique_volume?, sans_musique? }
 *                             -> nouvelle version du même montage : l'agent reprend
 *                             son script et ses fichiers, applique la correction, refait le rendu
 *   GET  /montages/:id        -> { id, statut, version, progression, erreur, cout_usd, duree_s, resume }
 *   GET  /montages/:id/video  -> le MP4 de la dernière version (quand statut = termine)
 *   GET  /montages/:id/journal -> chaque étape de l'agent avec son heure (texte)
 *   DELETE /montages/:id      -> supprime le montage et tous ses fichiers (sauf pendant un rendu)
 *
 * Les fichiers ne restent sur le VPS que le temps des corrections : un montage terminé est supprimé
 * au bout de RETENTION_JOURS sans activité (ménage toutes les heures), ou dès que Postorico le demande.
 *
 * Chaque requête doit porter l'en-tête  Authorization: Bearer <JETON>.
 * SIMULTANES montages à la fois (les suivants attendent dans la file). Node 22+, aucune dépendance.
 *
 * Variables d'environnement :
 *   JETON (obligatoire), PORT (défaut 8787), HOST (défaut 0.0.0.0), DOSSIER (défaut ./montages),
 *   CLAUDE_BIN (défaut claude), MODELE (défaut opus), PLUGIN_DIR (ex. plugin HyperFrames),
 *   SIMULTANES (défaut 2), ASSETS (défaut ./assets), REGLES (défaut ./regles.md), BUDGET_USD (défaut 3),
 *   MAX_MINUTES (défaut 30), RETENTION_JOURS (défaut 7),
 *   ANTHROPIC_API_KEY (facultatif : sinon Claude Code utilise la connexion de l'utilisateur).
 */
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, readFileSync } from 'node:fs';
import { appendFile, copyFile, mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const GARDE_FOU = path.join(ICI, 'garde-fou.mjs');
const env = (k, d) => (process.env[k] ?? '').trim() || d;
const C = {
  jeton: env('JETON', ''),
  port: Number(env('PORT', '8787')),
  // 0.0.0.0 = accessible de l'extérieur ; 127.0.0.1 = seulement la machine (derrière Caddy/HTTPS ou un tunnel SSH)
  host: env('HOST', '0.0.0.0'),
  dossier: env('DOSSIER', path.join(ICI, 'montages')),
  assets: env('ASSETS', path.join(ICI, 'assets')),
  claude: env('CLAUDE_BIN', 'claude'),
  modele: env('MODELE', 'opus'),
  pluginDir: env('PLUGIN_DIR', ''),
  regles: env('REGLES', path.join(ICI, 'regles.md')),
  budget: env('BUDGET_USD', '3'),
  maxMinutes: Number(env('MAX_MINUTES', '30')),
  // Montages en parallèle : la réflexion de l'agent ne charge pas le processeur, les rendus ffmpeg oui
  simultanes: Math.max(1, Number(env('SIMULTANES', '2')) || 2),
  retentionJours: Math.max(1, Number(env('RETENTION_JOURS', '7')) || 7),
  cle: env('ANTHROPIC_API_KEY', ''),
};
if (!C.jeton) { console.error('Variable JETON obligatoire (openssl rand -hex 32).'); process.exit(1); }
if (!existsSync(GARDE_FOU)) { console.error(`Garde-fou introuvable : ${GARDE_FOU}. Le monteur ne démarre pas sans lui.`); process.exit(1); }

const log = (...a) => console.log(new Date().toISOString(), ...a);
const RATIOS = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080] };
const deux = (n) => String(n).padStart(2, '0');
const estHttps = (u) => typeof u === 'string' && /^https:\/\//.test(u);

// --------------------------------------------------------------- état (un fichier par montage)
const fichierEtat = (id) => path.join(C.dossier, id, 'etat.json');
async function lireEtat(id) {
  if (!/^[0-9a-f-]{36}$/.test(id) || !existsSync(fichierEtat(id))) return null;
  return JSON.parse(readFileSync(fichierEtat(id), 'utf8'));
}
async function ecrireEtat(e) {
  await writeFile(fichierEtat(e.id), JSON.stringify(e, null, 2));
}

// --------------------------------------------------------------- outils
function lancer(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let reste = '';
    p.stdout.on('data', (d) => {
      out += d;
      if (!opts.surLigne) return;
      reste += d;
      const lignes = reste.split('\n');
      reste = lignes.pop();
      for (const l of lignes) if (l.trim()) opts.surLigne(l);
    });
    p.stderr.on('data', (d) => { err += d; });
    const t = opts.timeoutMs ? setTimeout(() => { p.kill('SIGKILL'); err += '\n[délai dépassé]'; }, opts.timeoutMs) : null;
    p.on('close', (code) => { if (t) clearTimeout(t); if (opts.surLigne && reste.trim()) opts.surLigne(reste); resolve({ code, out, err }); });
    p.on('error', (e) => { if (t) clearTimeout(t); resolve({ code: -1, out, err: String(e) }); });
  });
}
async function telecharger(url, fichier) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) });
  if (!r.ok || !r.body) throw new Error(`Téléchargement impossible (${r.status}) : ${url}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(fichier));
}
async function sonder(f) {
  const r = await lancer('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', f], { timeoutMs: 60_000 });
  if (r.code !== 0) throw new Error(`ffprobe : ${r.err.slice(0, 200)}`);
  const d = JSON.parse(r.out);
  const v = (d.streams || []).find((s) => s.codec_type === 'video');
  return { video: Boolean(v), son: (d.streams || []).some((s) => s.codec_type === 'audio'), largeur: v?.width || 0, hauteur: v?.height || 0, duree: Number(d.format?.duration || 0) };
}

/** Garde les morceaux [debut, fin] d'une vidéo et les recolle (image + son), en place. */
async function couper(fichier, segs) {
  const { son, duree } = await sonder(fichier);
  const morceaux = segs.map(([a, b]) => [Math.max(0, a), Math.min(duree || b, b)]).filter(([a, b]) => b - a > 0.05);
  if (!morceaux.length) return;
  const parts = morceaux.map(([a, b], i) => `[0:v]trim=${a.toFixed(3)}:${b.toFixed(3)},setpts=PTS-STARTPTS[v${i}];`
    + (son ? `[0:a]atrim=${a.toFixed(3)}:${b.toFixed(3)},asetpts=PTS-STARTPTS[a${i}];` : '')).join('');
  const entrees = morceaux.map((_, i) => (son ? `[v${i}][a${i}]` : `[v${i}]`)).join('');
  const sortie = `${fichier}.coupe.mp4`;
  const r = await lancer('ffmpeg', ['-v', 'error', '-y', '-i', fichier, '-filter_complex',
    `${parts}${entrees}concat=n=${morceaux.length}:v=1:a=${son ? 1 : 0}[v]${son ? '[a]' : ''}`,
    '-map', '[v]', ...(son ? ['-map', '[a]', '-c:a', 'aac', '-b:a', '192k'] : []),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', sortie], { timeoutMs: 15 * 60_000 });
  if (r.code !== 0) throw new Error(`coupe des silences : ${r.err.slice(0, 200)}`);
  await rename(sortie, fichier);
}

/** Télécharge les images du client dans ./assets (numérotées à la suite des précédentes). */
async function telechargerImages(e, entrees, images) {
  const deja = (await readdir(entrees).catch(() => [])).filter((f) => /^image_\d+\./.test(f)).length;
  const faites = [];
  for (const [i, im] of images.entries()) {
    const ext = (im.url.match(/\.(jpe?g|png|webp)(\?|$)/i)?.[1] || 'jpg').toLowerCase();
    const f = `image_${deux(deja + i + 1)}.${ext}`;
    try {
      await telecharger(im.url, path.join(entrees, f));
      faites.push({ ...im, fichier: f });
    } catch (err) {
      log(`montage ${e.id} : image ${i + 1} ignorée (${err.message})`);
    }
  }
  return faites;
}

// --------------------------------------------------------------- préparation (première version)
async function preparer(e, dossier, entrees, maj) {
  const motion = e.demande.mode === 'motion';
  await maj({ progression: motion ? 'Téléchargement de la voix off' : 'Téléchargement des vidéos' });
  const rushes = [];
  // Motion design : pas de vidéo, la voix off tient lieu de « rush » (sa transcription s'y rapporte)
  const sources = motion ? [] : [...(e.demande.fichiers || []).map((n) => ({ fichier: n })), ...e.demande.videos.map((u) => ({ url: u }))];
  if (motion) {
    const ext = (e.demande.voix_url.match(/\.(mp3|m4a|wav|ogg)(\?|$)/i)?.[1] || 'mp3').toLowerCase();
    await telecharger(e.demande.voix_url, path.join(entrees, `voix.${ext}`));
    rushes.push(`voix.${ext}`);
  }
  for (const [i, src] of sources.entries()) {
    const f = `rush_${deux(i + 1)}.mp4`;
    if (src.fichier) await copyFile(path.join(C.assets, src.fichier), path.join(entrees, f));
    else await telecharger(src.url, path.join(entrees, f));
    rushes.push(f);
  }
  // Coupe des silences par le serveur (pas par l'agent), d'après les morceaux calculés par Postorico
  for (const [i, segs] of (e.demande.coupes || []).entries()) {
    if (motion || !Array.isArray(segs) || !segs.length || i >= rushes.length) continue;
    await maj({ progression: `Coupe des silences${rushes.length > 1 ? ` ${i + 1}/${rushes.length}` : ''}` });
    await couper(path.join(entrees, rushes[i]), segs);
  }
  const transcrits = [];
  for (const [i, tr] of (e.demande.transcriptions || []).entries()) {
    if (!tr || !Array.isArray(tr.words) || !tr.words.length || i >= rushes.length) continue;
    const f = `transcription_${deux(i + 1)}.json`;
    await writeFile(path.join(entrees, f), JSON.stringify({ language: tr.language || 'fr', words: tr.words }));
    transcrits.push([rushes[i], f]);
  }
  if (!transcrits.length && e.demande.transcription) {
    await copyFile(path.join(C.assets, e.demande.transcription), path.join(entrees, 'transcription_01.json'));
    transcrits.push([rushes[0], 'transcription_01.json']);
  }
  await maj({ progression: 'Téléchargement des illustrations' });
  const plans = [];
  const schemas = (e.demande.illustrations || []).filter((il) => il.type === 'schema');
  for (const [i, il] of (e.demande.illustrations || []).filter((x) => x.type !== 'schema').entries()) {
    const f = `illustration_${deux(i + 1)}.mp4`;
    try {
      await telecharger(il.url, path.join(entrees, f));
      plans.push({ ...il, fichier: f });
    } catch (err) {
      log(`montage ${e.id} : illustration ${i + 1} ignorée (${err.message})`);
    }
  }
  const images = await telechargerImages(e, entrees, e.demande.images || []);
  let logo = false;
  if (e.demande.logo_url) {
    try { await telecharger(e.demande.logo_url, path.join(entrees, 'logo.png')); logo = true; } catch (err) { log(`montage ${e.id} : logo ignoré (${err.message})`); }
  }
  let musique = '';
  if (e.demande.musique_url) {
    const ext = (e.demande.musique_url.match(/\.(mp3|m4a|aac|wav|ogg)(\?|$)/i)?.[1] || 'mp3').toLowerCase();
    try { await telecharger(e.demande.musique_url, path.join(entrees, `musique.${ext}`)); musique = `musique.${ext}`; } catch (err) { log(`montage ${e.id} : musique ignorée (${err.message})`); }
  }

  const pretraite = transcrits.length > 0;
  const [l, h] = RATIOS[e.demande.format] || RATIOS['9:16'];
  await writeFile(path.join(dossier, 'BRIEF.md'), [
    '# Brief de montage', '',
    `- Format : ${e.demande.format} (${l}x${h})`,
    `- Durée MAXIMALE : ${e.demande.duree_max_s} s`, '',
    '## Consignes', '', e.demande.consignes || '(aucune : fais le meilleur montage possible)', '',
    ...(motion ? ['## Mode motion design : pas de vidéo', '',
      `- \`./assets/${rushes[0]}\` : la voix off (${(await sonder(path.join(entrees, rushes[0]))).duree.toFixed(1)} s). C'est la piste son principale : toute la vidéo est ANIMÉE sur elle (voir « Mode motion design » dans les règles).`,
      '- La vidéo dure le temps de la voix, plus 2 à 3 s de fin.', '',
      ...(e.demande.script ? ['### Texte exact de la voix off', '',
        "Référence pour l'ORTHOGRAPHE de tout texte à l'écran (la transcription peut mal entendre un mot ; elle ne sert qu'au timing) :", '',
        ...e.demande.script.split('\n').map((l) => `> ${l}`), ''] : [])] : ['## Vidéos fournies (./assets)', '', ...rushes.map((r) => `- ${r}`), '']),
    ...(pretraite ? ['## Prétraitement déjà fait', '',
      motion ? '- La voix off est fournie avec sa transcription mot à mot : ne la retranscris pas.' : '- Les silences et hésitations sont DÉJÀ coupés dans ces vidéos : ne recoupe pas, ne retranscris pas.',
      ...transcrits.map(([r, f]) => `- \`./assets/${f}\` : les mots de ${r}, avec leur début et leur fin en secondes.`),
      "  Sers-t'en pour les sous-titres, les titres et pour placer zooms et illustrations.", ''] : []),
    ...(plans.length ? ["## Plans d'illustration (b-roll) fournis", '',
      "Plans vidéo libres de droits choisis par Postorico pour illustrer le propos. Incruste chacun au moment indiqué (voir les règles) ; écarte-en un seulement s'il ne colle vraiment pas.", '',
      ...plans.map((il) => `- \`./assets/${il.fichier}\` : sur ${rushes[il.rush] || rushes[0]} à ${Number(il.debut).toFixed(2)} s, pendant ${Number(il.duree).toFixed(1)} s. ${il.description}`), ''] : []),
    ...(schemas.length ? ['## Schémas à dessiner', '',
      "Idées abstraites du propos à montrer sous forme de petit schéma animé que tu dessines toi-même (voir les règles), aux couleurs de la charte.", '',
      ...schemas.map((sc) => `- Sur ${rushes[sc.rush] || rushes[0]} à ${Number(sc.debut).toFixed(2)} s, pendant ${Number(sc.duree).toFixed(1)} s : ${sc.description}`), ''] : []),
    ...(images.length ? ['## Images fournies par le client', '',
      "Ses propres photos : elles passent AVANT tout plan générique. Place chacune sur le moment du propos qui lui correspond le mieux (voir les règles).", '',
      ...images.map((im) => `- \`./assets/${im.fichier}\`${im.description ? ` : ${im.description}` : ''}`), ''] : []),
    ...(logo ? ['## Logo', '', '- `./assets/logo.png` : le logo de la marque (voir les règles pour le placement).', ''] : []),
    ...(musique ? ['## Musique de fond', '',
      `- \`./assets/${musique}\` : choisie par le client. Volume voulu : ${e.demande.musique_volume} % (par rapport à la voix, qui reste toujours nettement au-dessus).`,
      '  Mixe-la sur toute la vidéo (en boucle si elle est plus courte), avec un fondu à l\'entrée et à la sortie.', ''] : []),
    ...(!pretraite ? ['## Pas de transcription fournie', '',
      "La vidéo ne contient pas de parole exploitable : pas de sous-titres. Ne transcris pas l'audio toi-même.", ''] : []),
    '## Livrable', '', 'Un seul fichier : ./sortie/final.mp4 (H.264 + AAC, yuv420p, faststart).',
  ].join('\n'));
}

// --------------------------------------------------------------- agent
async function lancerAgent(e, dossier, consigne, maj) {
  const args = [
    '-p', consigne,
    '--output-format', 'stream-json', '--verbose', '--model', C.modele, '--max-budget-usd', C.budget, '--max-turns', '80',
    '--tools', 'Bash,Read,Write,Edit', '--allowedTools', 'Bash', 'Read', 'Write', 'Edit',
    '--permission-mode', 'acceptEdits', '--permission-prompts', 'none', '--no-session-persistence',
    // Mode restreint : outils nommés seulement, réglages du dossier ignorés, fichiers confinés au dossier
    '--restricted', '--strict-mcp-config',
    ...(existsSync(C.regles) ? ['--append-system-prompt-file', C.regles] : []),
    ...(C.pluginDir ? ['--plugin-dir', C.pluginDir] : []),
    // Garde-fou : chaque outil de l'agent passe d'abord par garde-fou.mjs (refus = sortie 2)
    '--settings', JSON.stringify({ hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: `node ${GARDE_FOU}` }] }] } }),
  ];
  const envAgent = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8', ...(C.cle ? { ANTHROPIC_API_KEY: C.cle } : {}) };
  const [bin, ...prefixe] = C.claude.split(' ');
  // Journal : chaque action de l'agent avec le temps écoulé, pour savoir où passent les minutes
  const t0 = Date.now();
  const journal = path.join(dossier, 'journal.txt');
  const ecoule = () => { const s = Math.round((Date.now() - t0) / 1000); return `+${deux(Math.floor(s / 60))}:${deux(s % 60)}`; };
  let res = {};
  let etape = 0;
  let derniereEcriture = 0;
  await appendFile(journal, `${e.version > 1 ? `\n=== Correction (version ${e.version})\n` : ''}${ecoule()}  démarrage de Claude Code\n`);
  const surLigne = (ligne) => {
    let ev;
    try { ev = JSON.parse(ligne); } catch { return; }
    if (ev.type === 'result') { res = ev; return; }
    if (ev.type !== 'assistant') return;
    for (const b of ev.message?.content || []) {
      let texte = '';
      if (b.type === 'tool_use') {
        etape += 1;
        const entree = b.input || {};
        texte = `${b.name} : ${String(entree.description || entree.command || entree.file_path || entree.skill || JSON.stringify(entree)).replace(/\s+/g, ' ').slice(0, 160)}`;
        const maintenant = Date.now();
        if (maintenant - derniereEcriture > 5000) {
          derniereEcriture = maintenant;
          maj({ progression: `Étape ${etape} · ${texte.slice(0, 120)}` }).catch(() => {});
        }
      } else if (b.type === 'text' && b.text?.trim()) {
        texte = `(pense) ${b.text.replace(/\s+/g, ' ').slice(0, 160)}`;
      }
      if (texte) appendFile(journal, `${ecoule()}  ${texte}\n`).catch(() => {});
    }
  };
  const r = await lancer(bin, [...prefixe, ...args], { cwd: dossier, env: envAgent, timeoutMs: C.maxMinutes * 60_000, surLigne });
  await appendFile(journal, `${ecoule()}  fin de Claude Code (${etape} actions)\n`);
  return { r, res, etape, minutes: Math.round((Date.now() - t0) / 6000) / 10 };
}

// --------------------------------------------------------------- montage (ou correction)
async function monter(e) {
  const dossier = path.join(C.dossier, e.id);
  const entrees = path.join(dossier, 'assets');
  const sortie = path.join(dossier, 'sortie');
  await mkdir(entrees, { recursive: true });
  await mkdir(sortie, { recursive: true });
  const maj = async (champs) => { Object.assign(e, champs); await ecrireEtat(e); };
  const final = path.join(sortie, 'final.mp4');
  const correction = e.version > 1;
  try {
    await maj({ statut: 'en_cours', debut: new Date().toISOString(), erreur: null });
    let consigne;
    if (!correction) {
      await preparer(e, dossier, entrees, maj);
      consigne = e.demande.mode === 'motion'
        ? 'Crée la vidéo animée (motion design, sans tournage) décrite dans BRIEF.md, sur la voix off de ./assets, et écris le résultat dans ./sortie/final.mp4. Personne ne répondra à tes questions : décide seul à partir du brief.'
        : 'Monte la vidéo décrite dans BRIEF.md à partir des fichiers de ./assets, et écris le résultat dans ./sortie/final.mp4. Personne ne répondra à tes questions : décide seul à partir du brief.';
    } else {
      const c = e.corrections[e.corrections.length - 1];
      await maj({ progression: 'Préparation de la correction' });
      const images = await telechargerImages(e, entrees, c.images || []);
      let musique = '';
      if (c.musique_url) {
        const ext = (c.musique_url.match(/\.(mp3|m4a|aac|wav|ogg)(\?|$)/i)?.[1] || 'mp3').toLowerCase();
        try { await telecharger(c.musique_url, path.join(entrees, `musique_v${e.version}.${ext}`)); musique = `musique_v${e.version}.${ext}`; } catch (err) { log(`montage ${e.id} : nouvelle musique ignorée (${err.message})`); }
      }
      // La version précédente reste disponible, et la nouvelle repart d'un fichier final absent
      if (existsSync(final)) await rename(final, path.join(sortie, `final_v${e.version - 1}.mp4`));
      await writeFile(path.join(dossier, `CORRECTION_v${e.version}.md`), [
        `# Correction demandée par le client (version ${e.version})`, '',
        c.consignes, '',
        ...(images.length ? ['## Nouvelles images fournies', '', ...images.map((im) => `- \`./assets/${im.fichier}\``), ''] : []),
        ...(musique ? ['## Nouvelle musique de fond', '',
          `Remplace la musique de fond actuelle par \`./assets/${musique}\`, au volume de ${c.musique_volume} % par rapport à la voix (la voix reste toujours nettement au-dessus). Fondu d'entrée et de sortie, calée sur la durée de la vidéo.`, ''] : []),
        ...(c.sans_musique ? ['## Musique de fond', '', 'Retire complètement la musique de fond : seules la voix et les effets sonores restent.', ''] : []),
        '## Rappel', '',
        `Le montage existe déjà (BRIEF.md, ton script dans ./tmp, ./sortie/final_v${e.version - 1}.mp4).`,
        "Modifie seulement ce qui est demandé, garde tout le reste à l'identique, puis refais le rendu dans ./sortie/final.mp4.",
      ].join('\n'));
      consigne = `Le client demande une correction du montage : lis CORRECTION_v${e.version}.md, reprends ton script existant (./tmp), applique uniquement ce qui est demandé, puis refais le rendu dans ./sortie/final.mp4. Personne ne répondra à tes questions.`;
    }
    await maj({ progression: correction ? 'Correction par Claude Code' : 'Montage par Claude Code' });
    const { r, res, etape, minutes } = await lancerAgent(e, dossier, consigne, maj);
    const cout = typeof res.total_cost_usd === 'number' ? res.total_cost_usd : null;
    if (!existsSync(final)) throw Object.assign(new Error(`Pas de sortie/final.mp4 (code ${r.code}). ${String(res.result || r.err || r.out).slice(0, 300)}`), { cout });

    const [l, h] = RATIOS[e.demande.format] || RATIOS['9:16'];
    const s = await sonder(final);
    if (!s.video) throw Object.assign(new Error('Le fichier final ne contient pas de vidéo.'), { cout });
    if (s.duree > e.demande.duree_max_s + 1) throw Object.assign(new Error(`Vidéo trop longue : ${Math.round(s.duree)} s.`), { cout });
    if (Math.abs(s.largeur / s.hauteur - l / h) / (l / h) > 0.03) throw Object.assign(new Error(`Mauvais format : ${s.largeur}x${s.hauteur}.`), { cout });
    await maj({ statut: 'termine', progression: 'Terminé', actions: etape, minutes_agent: minutes, cout_usd: cout, duree_s: s.duree, taille_octets: (await stat(final)).size, resume: String(res.result || '').slice(0, 1000), fin: new Date().toISOString() });
    log(`montage ${e.id} v${e.version} terminé (${Math.round(s.duree)} s, ${cout ?? '?'} $)`);
  } catch (err) {
    // Correction ratée : la version précédente redevient la vidéo servie
    const precedente = path.join(sortie, `final_v${e.version - 1}.mp4`);
    if (correction && !existsSync(final) && existsSync(precedente)) await copyFile(precedente, final).catch(() => {});
    await maj({ statut: 'echec', progression: 'Échec', erreur: String(err.message || err).slice(0, 500), cout_usd: err.cout ?? null, fin: new Date().toISOString() });
    log(`montage ${e.id} v${e.version} en échec : ${e.erreur}`);
  }
}

// File : SIMULTANES montages à la fois (2 par défaut), reprise des montages en attente au redémarrage.
const file = [];
const actifs = new Set();
async function suivant() {
  while (actifs.size < C.simultanes && file.length) {
    const id = file.shift();
    actifs.add(id);
    (async () => {
      try { const e = await lireEtat(id); if (e) await monter(e); } finally { actifs.delete(id); setImmediate(suivant); }
    })();
  }
}

// Ménage : un montage terminé (ou en échec) sans activité depuis RETENTION_JOURS est supprimé
async function menage() {
  const limite = Date.now() - C.retentionJours * 24 * 3600_000;
  for (const id of await readdir(C.dossier).catch(() => [])) {
    const e = await lireEtat(id).catch(() => null);
    if (!e || actifs.has(id) || file.includes(id) || !['termine', 'echec'].includes(e.statut)) continue;
    if (new Date(e.fin || e.cree).getTime() < limite) {
      await rm(path.join(C.dossier, id), { recursive: true, force: true });
      log(`montage ${id} supprimé (aucune activité depuis ${C.retentionJours} jours)`);
    }
  }
}

// --------------------------------------------------------------- HTTP
const autorise = (req) => {
  const recu = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(C.jeton);
  const b = Buffer.from(recu);
  return a.length === b.length && timingSafeEqual(a, b);
};
const repondre = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
async function lireCorps(req, max = 3_000_000) {
  let corps = '';
  for await (const c of req) { corps += c; if (corps.length > max) throw new Error('Corps trop gros'); }
  return corps ? JSON.parse(corps) : {};
}
const lireImages = (liste) => (Array.isArray(liste) ? liste.slice(0, 10) : [])
  .map((im) => (typeof im === 'string' ? { url: im } : im))
  .filter((im) => estHttps(im?.url))
  .map((im) => ({ url: im.url, description: String(im.description || '').slice(0, 200) }));

http.createServer(async (req, res) => {
  try {
    if (!autorise(req)) return repondre(res, 401, { erreur: 'Jeton invalide' });
    const [, racine, id, sous] = (req.url || '').split('?')[0].split('/');
    if (racine !== 'montages') return repondre(res, 404, { erreur: 'Route inconnue' });

    if (req.method === 'POST' && !id) {
      const d = await lireCorps(req);
      const videos = Array.isArray(d.videos) ? d.videos.filter(estHttps).slice(0, 10) : [];
      // Fichiers du dépôt : nom simple uniquement (pas de chemin), et le fichier doit exister
      const fichiers = Array.isArray(d.fichiers) ? d.fichiers.filter((n) => typeof n === 'string' && n === path.basename(n) && !n.startsWith('.')).slice(0, 10) : [];
      const absents = fichiers.filter((n) => !existsSync(path.join(C.assets, n)));
      if (absents.length) return repondre(res, 400, { erreur: `Introuvable dans ${C.assets} : ${absents.join(', ')}` });
      const transcription = typeof d.transcription === 'string' && d.transcription === path.basename(d.transcription) && d.transcription.endsWith('.json') ? d.transcription : '';
      if (d.transcription && !transcription) return repondre(res, 400, { erreur: '"transcription" : nom simple d’un fichier .json du dépôt.' });
      if (transcription && !existsSync(path.join(C.assets, transcription))) return repondre(res, 400, { erreur: `Introuvable dans ${C.assets} : ${transcription}` });
      const motion = d.mode === 'motion';
      if (motion && !estHttps(d.voix_url)) return repondre(res, 400, { erreur: 'Mode motion : "voix_url" (URL https de la voix off) obligatoire.' });
      if (!motion && !videos.length && !fichiers.length) return repondre(res, 400, { erreur: 'Au moins une vidéo : "fichiers" (dépôt assets) ou "videos" (URL https).' });
      const e = {
        id: randomUUID(),
        statut: 'en_attente',
        progression: 'En attente',
        version: 1,
        corrections: [],
        cree: new Date().toISOString(),
        demande: {
          videos,
          fichiers,
          transcription,
          coupes: Array.isArray(d.coupes) ? d.coupes.slice(0, 10).map((segs) => (Array.isArray(segs) ? segs.slice(0, 2000)
            .filter((s) => Array.isArray(s) && Number.isFinite(s[0]) && Number.isFinite(s[1]) && s[1] > s[0])
            .map(([a, b]) => [Math.max(0, a), b]) : [])) : [],
          // broll : plan vidéo à télécharger (URL https) ; schema : dessiné par l'agent d'après la description
          illustrations: Array.isArray(d.illustrations) ? d.illustrations.slice(0, 12)
            .filter((il) => Number.isFinite(il?.debut) && (il.type === 'schema'
              ? typeof il.description === 'string' && il.description.trim()
              : estHttps(il.url)))
            .map((il) => ({
              type: il.type === 'schema' ? 'schema' : 'broll',
              ...(il.type === 'schema' ? {} : { url: il.url }),
              rush: Number.isInteger(il.rush) && il.rush >= 0 ? il.rush : 0,
              debut: Math.max(0, il.debut),
              duree: Math.max(1, Math.min(5, Number(il.duree) || 2.5)),
              description: String(il.description || '').slice(0, 200),
            })) : [],
          images: lireImages(d.images),
          logo_url: estHttps(d.logo_url) ? d.logo_url : '',
          musique_url: estHttps(d.musique_url) ? d.musique_url : '',
          musique_volume: Math.max(5, Math.min(100, Math.round(Number(d.musique_volume) || 25))),
          mode: motion ? 'motion' : 'video',
          voix_url: motion ? d.voix_url : '',
          script: motion ? String(d.script || '').slice(0, 3000) : '',
          transcriptions: Array.isArray(d.transcriptions) ? d.transcriptions.slice(0, 10).map((t) => ({
            language: typeof t?.language === 'string' ? t.language.slice(0, 8) : 'fr',
            words: Array.isArray(t?.words) ? t.words.slice(0, 5000).filter((w) => typeof w?.text === 'string' && Number.isFinite(w.start) && Number.isFinite(w.end))
              .map((w) => ({ text: w.text.slice(0, 60), start: w.start, end: w.end })) : [],
          })) : [],
          consignes: String(d.consignes || '').slice(0, 2000),
          format: RATIOS[d.format] ? d.format : '9:16',
          duree_max_s: Math.max(5, Math.min(600, Number(d.duree_max_s) || 180)),
        },
      };
      await mkdir(path.join(C.dossier, e.id), { recursive: true });
      await ecrireEtat(e);
      file.push(e.id);
      setImmediate(suivant);
      return repondre(res, 202, { id: e.id, statut: e.statut, position: file.length, avant: Math.max(0, file.length - 1) + actifs.size });
    }

    if (req.method === 'POST' && id && sous === 'corrections') {
      const e = await lireEtat(id);
      if (!e) return repondre(res, 404, { erreur: 'Montage introuvable' });
      // Après une correction ratée, la version précédente est toujours servie : on peut en redemander une
      const corrigeable = e.statut === 'termine' || (e.statut === 'echec' && e.version > 1 && existsSync(path.join(C.dossier, id, 'sortie', 'final.mp4')));
      if (!corrigeable) return repondre(res, 409, { erreur: `Correction impossible (statut : ${e.statut})` });
      if (!existsSync(path.join(C.dossier, id, 'BRIEF.md'))) return repondre(res, 409, { erreur: 'Fichiers de travail introuvables : refais un montage.' });
      const d = await lireCorps(req);
      const consignes = String(d.consignes || '').trim().slice(0, 2000);
      if (!consignes) return repondre(res, 400, { erreur: 'Décris la correction voulue dans "consignes".' });
      e.version = (e.version || 1) + 1;
      const musique = estHttps(d.musique_url)
        ? { musique_url: d.musique_url, musique_volume: Math.max(5, Math.min(100, Math.round(Number(d.musique_volume) || 25))) }
        : d.sans_musique === true ? { sans_musique: true } : {};
      e.corrections = [...(e.corrections || []), { version: e.version, consignes, images: lireImages(d.images), ...musique, demandee: new Date().toISOString() }];
      Object.assign(e, { statut: 'en_attente', progression: 'En attente', erreur: null, resume: null });
      await ecrireEtat(e);
      file.push(e.id);
      setImmediate(suivant);
      return repondre(res, 202, { id: e.id, version: e.version, statut: e.statut, avant: Math.max(0, file.length - 1) + actifs.size });
    }

    if (req.method === 'DELETE' && id && !sous) {
      const e = await lireEtat(id);
      if (!e) return repondre(res, 404, { erreur: 'Montage introuvable' });
      if (actifs.has(id) || file.includes(id)) return repondre(res, 409, { erreur: 'Montage en cours : suppression impossible pour le moment.' });
      await rm(path.join(C.dossier, id), { recursive: true, force: true });
      log(`montage ${id} supprimé à la demande`);
      return repondre(res, 200, { ok: true });
    }

    if (req.method === 'GET' && id) {
      const e = await lireEtat(id);
      if (!e) return repondre(res, 404, { erreur: 'Montage introuvable' });
      if (sous === 'journal') {
        const f = path.join(C.dossier, id, 'journal.txt');
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end(existsSync(f) ? readFileSync(f, 'utf8') : '(pas encore de journal)');
      }
      if (sous === 'video') {
        const f = path.join(C.dossier, id, 'sortie', 'final.mp4');
        if (e.statut !== 'termine' || !existsSync(f)) return repondre(res, 409, { erreur: `Vidéo pas prête (statut : ${e.statut})` });
        res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': (await stat(f)).size });
        return createReadStream(f).pipe(res);
      }
      const { demande, corrections, ...visible } = e;
      const rang = file.indexOf(id);
      return repondre(res, 200, { ...visible, format: demande.format, corrections: (corrections || []).length, ...(rang >= 0 ? { avant: rang + actifs.size } : {}) });
    }
    repondre(res, 405, { erreur: 'Méthode non prise en charge' });
  } catch (err) {
    repondre(res, 400, { erreur: String(err.message || err) });
  }
}).listen(C.port, C.host, async () => {
  await mkdir(C.dossier, { recursive: true });
  await mkdir(C.assets, { recursive: true });
  // Reprise des montages restés « en attente » ou interrompus « en cours » au dernier arrêt
  for (const id of await readdir(C.dossier).catch(() => [])) {
    const e = await lireEtat(id).catch(() => null);
    if (e && (e.statut === 'en_attente' || e.statut === 'en_cours')) { e.statut = 'en_attente'; await ecrireEtat(e); file.push(id); }
  }
  log(`serveur de montage à l'écoute sur le port ${C.port} (${file.length} montage(s) en file)`);
  setImmediate(suivant);
  setInterval(() => void menage().catch((err) => log(`ménage : ${err.message}`)), 3600_000);
  void menage().catch(() => {});
});
