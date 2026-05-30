/**
 * ===========================================================================
 *  TEST — Génération de contenu par Claude à partir du dossier-mémoire d'un client
 *  SDK officiel @anthropic-ai/sdk · API Anthropic en DIRECT (pas d'OpenRouter)
 * ===========================================================================
 *
 *  Ce script :
 *   1. lit le "dossier mémoire" d'un client (brand_voice.md + examples/*.md)
 *   2. demande à Claude d'écrire un post LinkedIn dans la voix du client
 *   3. utilise le PROMPT CACHING sur la voix de marque (≈ -90% au 2e appel)
 *   4. affiche le post + les tokens + le coût réel
 *
 *  --- LANCER (depuis backend/agents/js-test) ---------------------------------
 *    npm install
 *    node generer_contenu.mjs
 *
 *    # Avec un sujet précis :
 *    node generer_contenu.mjs "La peur de vendre quand on débute"
 *
 *  La clé API est lue automatiquement depuis le .env à la RACINE du projet
 *  (variable `api_claude`). Rien à configurer.
 *
 *  --- ASTUCE CACHE -----------------------------------------------------------
 *    Lance-le DEUX fois de suite : au 2e appel, "tokens en cache (lus)" grimpe
 *    et le coût de la voix de marque chute de ~90%. C'est ça l'anti-gaspillage.
 *
 *  --- CONFIG (variables d'environnement, optionnelles) -----------------------
 *    ANTHROPIC_API_KEY   ta clé (obligatoire)
 *    MODEL               défaut "claude-opus-4-8"
 *                        → moins cher : "claude-haiku-4-5" ou "claude-sonnet-4-6"
 *    CLIENT              dossier client (défaut "demo")
 * ===========================================================================
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// 0. CHARGER LE .env DE LA RACINE DU PROJET (mini-parseur, sans dépendance)
//    Racine = ../../../ depuis backend/agents/js-test
// ---------------------------------------------------------------------------
function chargerEnvRacine() {
  const envPath = join(__dirname, "..", "..", "..", ".env");
  const env = {};
  if (!existsSync(envPath)) return env;
  for (const ligne of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const t = ligne.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const cle = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    env[cle] = val;
  }
  return env;
}
const ENV = chargerEnvRacine();

// Clé API : variable d'env système > api_claude (.env racine) > variantes courantes
const API_KEY =
  process.env.ANTHROPIC_API_KEY ||
  ENV.api_claude ||
  ENV.API_CLAUDE ||
  ENV.ANTHROPIC_API_KEY ||
  "";

// ---------------------------------------------------------------------------
// 1. CONFIG
// ---------------------------------------------------------------------------
const MODEL = process.env.MODEL || "claude-opus-4-8";
const CLIENT = process.env.CLIENT || "demo";
const CLIENT_DIR = join(__dirname, "..", "clients", CLIENT);

// Prix indicatifs (USD / 1M tokens). Cache write ≈ 1.25× input, cache read ≈ 0.1× input.
const PRICES = {
  opus: { in: 5.0, out: 25.0 },
  sonnet: { in: 3.0, out: 15.0 },
  haiku: { in: 1.0, out: 5.0 },
};
function priceFor(model) {
  const m = model.toLowerCase();
  for (const key of Object.keys(PRICES)) if (m.includes(key)) return PRICES[key];
  return PRICES.opus;
}

// ---------------------------------------------------------------------------
// 2. LIRE LA "MÉMOIRE" DU CLIENT (le dossier)
// ---------------------------------------------------------------------------
function lireMemoireClient(dir) {
  if (!existsSync(dir)) {
    console.error(`❌ Dossier client introuvable : ${dir}`);
    process.exit(1);
  }
  let voix = "";
  const voicePath = join(dir, "brand_voice.md");
  if (existsSync(voicePath)) voix = readFileSync(voicePath, "utf-8");

  const exemples = [];
  const exDir = join(dir, "examples");
  if (existsSync(exDir)) {
    for (const f of readdirSync(exDir).filter((f) => f.endsWith(".md")).sort()) {
      exemples.push(readFileSync(join(exDir, f), "utf-8").trim());
    }
  }

  let bloc = "## VOIX DE MARQUE DU CLIENT\n\n" + (voix || "(non renseignée)");
  if (exemples.length) {
    bloc +=
      "\n\n## EXEMPLES DE POSTS QUI MARCHENT (imite ce style, n'invente pas un autre ton)\n\n";
    exemples.forEach((ex, i) => (bloc += `--- Exemple ${i + 1} ---\n${ex}\n\n`));
  }
  return bloc;
}

// ---------------------------------------------------------------------------
// 3. INSTRUCTIONS DE L'AGENT
// ---------------------------------------------------------------------------
const SYSTEM_ROLE =
  "Tu es le rédacteur attitré de la marque décrite ci-dessous. " +
  "Tu écris EXCLUSIVEMENT dans sa voix, en respectant ses règles à la lettre. " +
  "Tu produis un post prêt à publier : pas d'explications, pas de méta-commentaire, " +
  "pas de 'Voici votre post'. Réponds uniquement avec le texte du post, en français.\n\n";

function construireBrief(sujet) {
  return (
    `Écris UN post LinkedIn pour cette marque sur le sujet suivant :\n\n` +
    `"${sujet}"\n\n` +
    `Respecte le format LinkedIn attendu (accroche forte en 1ʳᵉ ligne, lignes courtes, ` +
    `une seule idée, question finale). Donne uniquement le texte du post.`
  );
}

// ---------------------------------------------------------------------------
// 4. MAIN
// ---------------------------------------------------------------------------
async function main() {
  const sujet =
    process.argv.slice(2).join(" ").trim() ||
    "Le syndrome de l'imposteur quand on lance son activité";

  if (!API_KEY) {
    console.error(
      "❌ Clé API introuvable.\n" +
        "   Attendu : variable `api_claude` dans le .env à la racine du projet,\n" +
        "   ou la variable d'environnement ANTHROPIC_API_KEY."
    );
    process.exit(1);
  }

  console.log("\n" + "=".repeat(64));
  console.log(`  CLIENT  : ${CLIENT}   (${CLIENT_DIR})`);
  console.log(`  MODÈLE  : ${MODEL}`);
  console.log(`  SUJET   : ${sujet}`);
  console.log("=".repeat(64));

  const memoire = lireMemoireClient(CLIENT_DIR);
  const systemPrompt = SYSTEM_ROLE + memoire;
  const brief = construireBrief(sujet);

  console.log("\n⏳ Claude écrit le post...\n");

  const client = new Anthropic({ apiKey: API_KEY });

  let resp;
  try {
    resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      // La voix de marque est mise EN CACHE → au 2e appel, ~90% moins cher dessus.
      system: [
        { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: brief }],
      // NB : pas de `temperature` — Opus 4.8 la rejette (400).
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      console.error("❌ Clé API invalide (401). Vérifie ANTHROPIC_API_KEY.");
    } else if (err instanceof Anthropic.RateLimitError) {
      console.error("❌ Limite de débit atteinte (429). Réessaie dans un instant.");
    } else if (err instanceof Anthropic.APIError) {
      console.error(`❌ Erreur API (${err.status}): ${err.message}`);
    } else {
      console.error("❌ Erreur :", err?.message || err);
    }
    process.exit(1);
  }

  const texte = resp.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  console.log("─".repeat(64));
  console.log("📄 POST GÉNÉRÉ");
  console.log("─".repeat(64));
  console.log(texte);
  console.log("─".repeat(64));

  // --- Coût ---
  const u = resp.usage;
  const inTok = u.input_tokens || 0; // plein tarif (non caché)
  const cacheWrite = u.cache_creation_input_tokens || 0; // écrit en cache (1.25×)
  const cacheRead = u.cache_read_input_tokens || 0; // lu du cache (0.1×)
  const outTok = u.output_tokens || 0;
  const p = priceFor(MODEL);

  const cost =
    (inTok / 1e6) * p.in +
    (cacheWrite / 1e6) * p.in * 1.25 +
    (cacheRead / 1e6) * p.in * 0.1 +
    (outTok / 1e6) * p.out;

  console.log("\n💰 COÛT DE CETTE GÉNÉRATION");
  console.log(`   Tokens entrée (plein tarif) : ${inTok}`);
  console.log(`   Tokens écrits en cache      : ${cacheWrite}`);
  console.log(`   Tokens lus du cache (-90%)  : ${cacheRead}`);
  console.log(`   Tokens sortie               : ${outTok}`);
  console.log(`   Coût estimé : $${cost.toFixed(5)}  (~${(cost * 0.93).toFixed(5)} €)`);
  if (cost > 0)
    console.log(`   → soit environ ${Math.round(1 / cost)} posts pour 1 $`);
  if (cacheRead === 0)
    console.log(
      "\n💡 Relance la MÊME commande : au 2e appel, 'Tokens lus du cache' grimpe → coût en chute."
    );
  console.log("");
}

main().catch((e) => {
  console.error("❌ Erreur inattendue :", e);
  process.exit(1);
});
