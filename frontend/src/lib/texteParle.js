// Texte réellement lu par la voix off (même règle que postorico/src/modules/agent-video/texte-parle.util.ts) :
// sans titres, minutages, gras ni indications ; script dialogué -> seules les répliques entre « ».
const TIMECODE = /\b\d{1,2}:\d{2}(?:\s*[-–à]\s*\d{1,2}:\d{2})?\b/g;
const INDICATION = /^\s*[[(]?\s*(visuel|plan|b-?roll|texte à l'écran|texte écran|écran|musique|son|transition|cut|ambiance|note)\b[^:\]]*[:\])]/i;

export function texteParle(script) {
  const texte = String(script || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^#/.test(l) && !/^[-*_]{3,}$/.test(l) && !INDICATION.test(l))
    .map((l) => l.replace(/^>\s*/, '').replace(/^[-*•]\s+/, '').replace(/\*\*|__|(?<!\w)[*_](?!\s)|(?<!\s)[*_](?!\w)/g, '').replace(TIMECODE, '').trim())
    .filter((l) => l && l !== '>')
    .join('\n');
  const repliques = [...texte.matchAll(/«\s*([^»]+?)\s*»/g)].map((m) => m[1].trim());
  return (repliques.length ? repliques.join('\n') : texte).replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
}

// ≈ 2,6 mots par seconde en français
export const dureeVoix = (script) => Math.round(texteParle(script).split(/\s+/).filter(Boolean).length / 2.6);
