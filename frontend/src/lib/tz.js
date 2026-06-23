// Helpers de fuseau horaire : on stocke les dates en UTC, mais on les saisit / affiche
// dans le fuseau de l'utilisateur (et Late publie à l'heure murale de ce fuseau).

export const COMMON_TIMEZONES = [
  { value: 'Europe/Paris', label: 'Paris (France) — GMT+1/+2' },
  { value: 'Europe/Brussels', label: 'Bruxelles (Belgique)' },
  { value: 'Europe/Zurich', label: 'Genève / Zurich (Suisse)' },
  { value: 'Europe/Luxembourg', label: 'Luxembourg' },
  { value: 'Europe/London', label: 'Londres (UK)' },
  { value: 'Europe/Lisbon', label: 'Lisbonne (Portugal)' },
  { value: 'Europe/Madrid', label: 'Madrid (Espagne)' },
  { value: 'Africa/Casablanca', label: 'Casablanca (Maroc)' },
  { value: 'Africa/Abidjan', label: "Abidjan (Côte d'Ivoire)" },
  { value: 'Africa/Algiers', label: 'Alger (Algérie)' },
  { value: 'Africa/Tunis', label: 'Tunis (Tunisie)' },
  { value: 'America/Montreal', label: 'Montréal / Québec (Canada)' },
  { value: 'America/New_York', label: 'New York (US Est)' },
  { value: 'America/Chicago', label: 'Chicago (US Centre)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (US Ouest)' },
  { value: 'Asia/Dubai', label: 'Dubaï (Émirats)' },
  { value: 'Indian/Reunion', label: 'La Réunion' },
];

const PAD = (n) => String(n).padStart(2, '0');

// Fuseau du navigateur (fallback)
export function browserTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'; }
  catch { return 'Europe/Paris'; }
}

// ms dont `tz` est en avance sur UTC à l'instant `utcMs`
function tzOffsetMs(utcMs, tz) {
  const s = new Date(utcMs).toLocaleString('sv-SE', { timeZone: tz }); // "YYYY-MM-DD HH:mm:ss"
  const asUtc = Date.parse(`${s.replace(' ', 'T')}Z`);
  return asUtc - utcMs;
}

// ISO UTC -> "YYYY-MM-DDTHH:mm" (heure murale dans `tz`, pour <input datetime-local>)
export function utcToInput(iso, tz) {
  if (!iso) return '';
  try {
    const s = new Date(iso).toLocaleString('sv-SE', { timeZone: tz });
    return s.slice(0, 16).replace(' ', 'T');
  } catch { return ''; }
}

// "YYYY-MM-DDTHH:mm" (heure murale dans `tz`) -> ISO UTC
export function inputToUtc(localStr, tz) {
  if (!localStr) return null;
  try {
    const naiveUtc = Date.parse(`${localStr}:00Z`);
    const offset = tzOffsetMs(naiveUtc, tz);
    return new Date(naiveUtc - offset).toISOString();
  } catch { return null; }
}

// ISO UTC -> "HH:mm" dans `tz`
export function timeInTz(iso, tz) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

// Abréviation du décalage courant (ex. "GMT+2") pour affichage
export function tzAbbrev(tz) {
  try {
    const parts = new Intl.DateTimeFormat('fr-FR', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value || tz;
  } catch { return tz; }
}
