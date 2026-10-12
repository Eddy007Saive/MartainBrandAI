#!/usr/bin/env node
/**
 * Garde-fou de l'agent monteur : hook PreToolUse de Claude Code, appelé AVANT chaque outil.
 * Reçoit l'appel en JSON sur l'entrée standard ({ tool_name, tool_input, cwd }). Sortie 0 = autorisé,
 * sortie 2 = refusé (le message d'erreur est renvoyé à l'agent, qui doit faire autrement).
 *
 * Principe : seul l'outillage du montage est permis, et seulement dans le dossier du montage.
 * Ce n'est pas la seule barrière : le service tourne sous un utilisateur sans droits, dans un bac à
 * sable systemd (voir agent-montage.service). Même une commande qui passerait ici ne peut rien
 * abîmer hors de /srv/agent-video/montages.
 */
import { posix as path } from 'node:path';

// Lecture seule permise hors du dossier du montage (polices, outillage HyperFrames, binaires)
const LECTURE_PERMISE = [
  '/usr/share/fonts', '/usr/local/share/fonts', '/usr/share/fontconfig', '/etc/fonts',
  '/srv/agent-video/hyperframes', '/srv/agent-video/home/.npm', '/srv/agent-video/home/.cache',
  '/usr/lib/node_modules', '/usr/local/lib/node_modules', '/usr/bin', '/usr/local/bin', '/dev/null',
];

// Premiers mots de commande autorisés (outillage du montage + utilitaires sans danger)
const COMMANDES = new Set([
  'ffmpeg', 'ffprobe', 'python3', 'python', 'npx', 'node',
  'ls', 'cat', 'head', 'tail', 'wc', 'grep', 'sed', 'awk', 'sort', 'uniq', 'cut', 'tr', 'echo', 'printf',
  'mkdir', 'cp', 'mv', 'rm', 'touch', 'find', 'du', 'stat', 'file', 'date', 'sleep', 'true', 'false',
  'test', '[', 'cd', 'pwd', 'basename', 'dirname', 'tee', 'bc', 'seq', 'nproc', 'time', 'timeout',
  'fc-list', 'fc-match', 'jq', 'diff', 'realpath', 'mktemp',
  // mots du shell
  'for', 'do', 'done', 'if', 'then', 'else', 'elif', 'fi', 'while', 'until', 'case', 'esac', 'in',
  'set', 'export', 'local', 'read', 'break', 'continue', 'return', 'exit', '{', '}', '(', ')',
]);

// Interdit partout, quelle que soit la forme (réseau, élévation, secrets, système)
const INTERDITS = [
  [/\b(curl|wget|ssh|scp|sftp|rsync|nc|ncat|netcat|telnet|ftp|socat)\b/, 'pas de réseau : les rushes sont déjà dans ./assets'],
  [/\b(sudo|su|doas|chown|chmod\s+[0-7]*[sS+]|setcap|mount|systemctl|service|crontab|useradd|passwd)\b/, 'pas de commande système'],
  [/\b(apt|apt-get|dpkg|snap|pip3?|npm\s+(i|install|add)|yarn\s+add)\b/, "pas d'installation de logiciel"],
  [/(^|[\s"'=])(\/etc\/(?!fonts)|\/root|\/home\/|\/proc\/|\/sys\/|\/var\/|~\/\.ssh|\.ssh\/|\.credentials|\.claude\.json)/, 'chemin système ou secret interdit'],
  // « env » seul n'est pas visé ici (le shebang #!/usr/bin/env python3 est normal) : comme commande,
  // il est refusé par la liste des commandes autorisées
  [/\bprintenv\b|\bos\.environ\b|\bos\.getenv\b|\$\{?(ANTHROPIC|AGENT|JETON|CLE)\w*/, "pas d'accès aux variables d'environnement"],
  [/\brm\s+(-[a-zA-Z]*\s+)*(\/|~|\.\.|\*)(\s|$)/, 'suppression hors du dossier du montage'],
  [/(^|[\s"'=\/])\.claude(\/|\b)|CLAUDE\.md|settings(\.local)?\.json/, 'configuration de Claude Code interdite'],
  [/(^|[\s"'=])~(\/|\s|$)|\$\{?HOME\b/, 'dossier personnel interdit'],
  [/\b(urllib|requests|socket|http\.client|httpx|aiohttp|ftplib|smtplib|paramiko)\b/, 'pas de réseau depuis Python'],
  [/\b(os\.system|os\.popen|shutil\.rmtree\s*\(\s*['"]\/|os\.(chmod|chown|setuid))\b/, 'appel système Python interdit'],
];

function refuser(raison) {
  process.stderr.write(`Refusé par le garde-fou du monteur : ${raison}. Reste dans le dossier du montage et n'utilise que l'outillage vidéo.`);
  process.exit(2);
}

function dans(fichier, racines) {
  const p = path.resolve(fichier);
  return racines.some((r) => p === r || p.startsWith(r.endsWith('/') ? r : `${r}/`));
}

/** Contrôle un texte (commande shell, script Python) contre la liste d'interdits. */
function controlerTexte(texte) {
  for (const [motif, raison] of INTERDITS) if (motif.test(texte)) refuser(raison);
}

/** Les chemins absolus d'une commande doivent rester dans le montage ou les dossiers en lecture. */
function controlerChemins(commande, cwd) {
  for (const m of commande.matchAll(/(?:^|[\s"'=:<>|])((?:\/|\.\.\/)[^\s"'`;|&<>()]*)/g)) {
    const brut = m[1];
    if (/^\/(dev\/null|tmp(\/|$))/.test(brut)) continue;
    const p = path.resolve(cwd, brut);
    if (!dans(p, [cwd, ...LECTURE_PERMISE])) refuser(`chemin hors du dossier du montage (${brut})`);
  }
}

/** Le premier mot de chaque morceau de commande doit être de l'outillage autorisé. */
function controlerCommandes(commande) {
  // Le contenu des here-docs et des chaînes Python est contrôlé par controlerTexte, pas ici
  const sansHeredoc = commande.replace(/<<-?\s*['"]?(\w+)['"]?[\s\S]*?\n\1(\n|$)/g, '\n');
  const sansChaines = sansHeredoc.replace(/'[^']*'/g, "''").replace(/"(\\.|[^"\\])*"/g, '""');
  const morceaux = sansChaines.split(/\n|;|&&|\|\||\||\$\(|`|\(|\)|&/);
  for (const brut of morceaux) {
    const mots = brut.trim().split(/\s+/).filter(Boolean);
    while (mots.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(mots[0])) mots.shift(); // VAR=valeur cmd
    if (!mots.length) continue;
    const cmd = path.basename(mots[0]);
    if (!COMMANDES.has(cmd)) refuser(`commande non autorisée (${cmd})`);
    if (cmd === 'npx' && !mots.slice(1).some((x) => /^hyperframes(@|$)/.test(x))) refuser('npx seulement pour hyperframes');
  }
}

let entree = '';
process.stdin.on('data', (d) => { entree += d; });
process.stdin.on('end', () => {
  let appel;
  try { appel = JSON.parse(entree); } catch { refuser('appel illisible'); }
  const cwd = path.resolve(appel.cwd || process.cwd());
  const outil = appel.tool_name;
  const e = appel.tool_input || {};

  if (outil === 'Bash') {
    const commande = String(e.command || '');
    controlerTexte(commande);
    controlerCommandes(commande);
    controlerChemins(commande, cwd);
  } else if (outil === 'Read') {
    if (!dans(String(e.file_path || ''), [cwd, ...LECTURE_PERMISE])) refuser(`lecture hors du dossier du montage (${e.file_path})`);
    controlerTexte(` ${e.file_path} `);
  } else if (outil === 'Write' || outil === 'Edit') {
    if (!dans(String(e.file_path || ''), [cwd])) refuser(`écriture hors du dossier du montage (${e.file_path})`);
    controlerTexte(` ${e.file_path} `);
    controlerTexte(String(e.content ?? e.new_string ?? ''));
  } else if (outil === 'Skill') {
    if (!/hyperframes|talking-head|embedded-captions|general-video/i.test(JSON.stringify(e))) refuser('seuls les skills HyperFrames sont permis');
  } else {
    refuser(`outil non autorisé (${outil})`);
  }
  process.exit(0);
});
