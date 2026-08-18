"""Pré-remplissage de la fiche de marque à partir du site web du client.

Le client colle l'adresse de son site, on la lit et on en déduit son secteur,
son audience, sa voix, ses piliers et ses couleurs. Il n'a plus qu'à corriger
au lieu de partir d'une page blanche — c'est là que la plupart abandonnent.

On charge la page dans un vrai navigateur (Playwright, déjà utilisé pour les
carrousels) et non par un simple GET : la moitié des sites d'aujourd'hui sont
en React, un GET n'y renvoie qu'une coquille vide.
"""
import asyncio
import base64
import ipaddress
import re
import socket
from urllib.parse import urlparse, urljoin

from config import logger
from services.agent_service import _client, _messages_create, GenerationError

MODELE = "claude-haiku-4-5"
TEXTE_MAX = 9000          # au-delà, on n'apprend plus rien de plus sur la marque
# 30 s : un site lourd rendu en JavaScript met facilement 25 s a se poser.
# C'est une action ponctuelle, faite une fois a l'inscription.
DELAI_MS = 30000


class SiteIllisible(Exception):
    """Le site n'a pas pu être lu : adresse invalide, injoignable, ou vide."""


# --- Sécurité ----------------------------------------------------------------
def normaliser(url: str) -> str:
    """Complète le schéma manquant et refuse tout ce qui n'est pas du web public."""
    url = (url or "").strip()
    if not url:
        raise SiteIllisible("Adresse vide.")
    if not re.match(r"^https?://", url, re.I):
        url = "https://" + url

    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise SiteIllisible("Adresse invalide.")

    # Anti-SSRF : l'adresse vient de l'utilisateur et la requête part de NOTRE
    # serveur. Sans ce garde-fou, un client pourrait nous faire lire le réseau
    # interne de l'hébergeur (métadonnées cloud, bases internes…).
    try:
        infos = socket.getaddrinfo(p.hostname, None)
    except socket.gaierror:
        raise SiteIllisible("Ce domaine n'existe pas.")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise SiteIllisible("Cette adresse n'est pas publique.")
    return url


# --- Lecture de la page ------------------------------------------------------
# Exécuté DANS la page : on récupère le texte visible, les métadonnées, le logo,
# et surtout les couleurs telles que le navigateur les calcule vraiment.
_EXTRACTION = r"""
() => {
  const vu = (n) => {
    const s = getComputedStyle(n);
    return s.display !== 'none' && s.visibility !== 'hidden' && n.offsetHeight > 0;
  };
  // Le logo se cherche AVANT de nettoyer la page : sur la plupart des sites
  // recents il est en SVG dans l'en-tete, et on le supprimerait juste apres.
  const meta = (n) => document.querySelector(`meta[property="${n}"],meta[name="${n}"]`)?.content || '';
  let logo = '', logoType = '';
  const img = document.querySelector(
    'header img[alt*="logo" i], [class*=logo i] img, header a[href="/"] img, header img, nav img');
  if (img && img.src && img.naturalWidth !== 1) { logo = img.src; logoType = 'image'; }
  if (!logo) {
    // Logo dessine en SVG dans la page. Trois pieges, dans l'ordre ou ils
    // cassent le rendu une fois le SVG sorti de sa page :
    for (const svg of document.querySelectorAll('header svg, [class*=logo i] svg, nav svg')) {
      const r = svg.getBoundingClientRect();
      if (r.width < 24 || r.height < 8) continue;
      const c = svg.cloneNode(true);

      // 1. <use href="#id"> pointe vers un symbole defini ailleurs dans la
      //    page : sorti de son contexte, le SVG est vide. On recopie la cible.
      let creux = false;
      c.querySelectorAll('use').forEach((u) => {
        const id = (u.getAttribute('href') || u.getAttribute('xlink:href') || '');
        const cible = id.startsWith('#') ? document.querySelector(id) : null;
        if (cible) {
          const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          [...cible.cloneNode(true).childNodes].forEach((n) => g.appendChild(n));
          u.replaceWith(g);
        } else { creux = true; }
      });
      if (creux) continue;

      // 2. Sans trace de dessin, c'est une coquille : on passe au suivant.
      if (!c.querySelector('path,rect,circle,ellipse,polygon,polyline,line,text,image')) continue;

      // 3. currentColor et les classes CSS ne suivent pas hors de la page :
      //    le logo deviendrait noir sur noir, ou invisible. On fige la
      //    couleur reellement calculee.
      const couleur = getComputedStyle(svg).color || '#111';
      c.querySelectorAll('*').forEach((n) => {
        ['fill', 'stroke'].forEach((p) => {
          const v = n.getAttribute(p);
          if (v === 'currentColor' || (!v && n.className)) n.setAttribute(p, couleur);
        });
        n.removeAttribute('class');
      });
      if (!c.getAttribute('xmlns')) c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      if (!c.getAttribute('viewBox') && r.width) c.setAttribute('viewBox', `0 0 ${Math.round(r.width)} ${Math.round(r.height)}`);
      c.setAttribute('width', Math.round(r.width));
      c.setAttribute('height', Math.round(r.height));

      logo = 'data:image/svg+xml;base64,' +
        btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(c))));
      logoType = 'svg';
      break;
    }
  }
  if (!logo && meta('og:image')) { logo = meta('og:image'); logoType = 'og'; }
  if (!logo) {
    // Dernier recours : la favicon. Souvent minuscule, d'ou le type renvoye —
    // l'interface previendra que ce n'est pas vraiment un logo.
    const ico = document.querySelector('link[rel="apple-touch-icon"], link[rel*="icon"]');
    if (ico) { logo = ico.href; logoType = 'favicon'; }
  }

  document.querySelectorAll('script,style,noscript,svg').forEach((n) => n.remove());

  // Les couleurs de marque vivent sur ce qui appelle a l'action, pas sur le fond
  // de page : boutons, liens, en-tetes. On les compte pour garder les dominantes.
  const compte = {};
  const cle = (c) => {
    if (!c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent') return;
    const m = c.match(/\d+/g);
    if (!m || m.length < 3) return;
    const [r, g, b] = m.map(Number);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max - min < 24) return;            // gris, noir, blanc : pas une couleur de marque
    const h = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
    compte[h] = (compte[h] || 0) + 1;
  };
  document.querySelectorAll('a,button,header,nav,h1,h2,[class*=btn],[class*=button],[class*=cta]')
    .forEach((n) => {
      if (!vu(n)) return;
      const s = getComputedStyle(n);
      cle(s.backgroundColor); cle(s.color); cle(s.borderColor);
    });
  const couleurs = Object.entries(compte).sort((a, b) => b[1] - a[1]).slice(0, 6).map((x) => x[0]);

  return {
    titre: document.title || '',
    description: meta('description') || meta('og:description'),
    couleurs,
    logo,
    logoType,
    texte: (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, %d),
    liens: [...document.querySelectorAll('a')].map((a) => a.innerText.trim())
      .filter((t) => t && t.length < 40).slice(0, 40),
  };
}
""" % TEXTE_MAX


_NAVIGATEUR = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
               "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")


def _lire_sans_navigateur(url: str) -> dict:
    """Repli : on télécharge le HTML et on le dépouille à la main.

    Moins riche — pas de couleurs calculées, et un site entièrement en
    JavaScript ne rendra rien — mais ça rattrape les pages trop lourdes pour
    tenir dans le budget de rendu du navigateur.
    """
    import html as _html
    import httpx

    r = httpx.get(url, timeout=15, follow_redirects=True,
                  headers={"user-agent": _NAVIGATEUR, "accept-language": "fr-FR,fr;q=0.9"})
    r.raise_for_status()
    src = r.text

    def meta(nom):
        m = re.search(rf'<meta[^>]+(?:property|name)=["\']{nom}["\'][^>]+content=["\']([^"\']+)',
                      src, re.I)
        return _html.unescape(m.group(1)) if m else ""

    corps = re.sub(r"(?is)<(script|style|noscript|svg|head)\b.*?</\1>", " ", src)
    texte = _html.unescape(re.sub(r"(?s)<[^>]+>", " ", corps))
    texte = re.sub(r"\s+", " ", texte).strip()[:TEXTE_MAX]

    # Sans navigateur on ne sait pas ce qui est réellement affiché : on se
    # contente des couleurs écrites en dur, en écartant les gris.
    compte = {}
    for h in re.findall(r"#([0-9a-fA-F]{6})\b", src):
        r_, g_, b_ = (int(h[i:i + 2], 16) for i in (0, 2, 4))
        if max(r_, g_, b_) - min(r_, g_, b_) < 24:
            continue
        cle = "#" + h.lower()
        compte[cle] = compte.get(cle, 0) + 1

    titre = re.search(r"(?is)<title[^>]*>(.*?)</title>", src)
    return {
        "url": str(r.url),
        "titre": _html.unescape(titre.group(1)).strip() if titre else "",
        "description": meta("description") or meta("og:description"),
        "couleurs": [c for c, _ in sorted(compte.items(), key=lambda x: -x[1])[:6]],
        "logo": urljoin(str(r.url), meta("og:image")) if meta("og:image") else "",
        "logoType": "og" if meta("og:image") else "",
        "texte": texte,
        "liens": [],
    }


def lire(url: str) -> dict:
    """Charge la page et en extrait la matière brute.

    Le navigateur d'abord — il rend le JavaScript et donne les vraies couleurs
    de marque. S'il n'y arrive pas, on retombe sur un simple téléchargement :
    les deux échouent rarement sur le même site.
    """
    url = normaliser(url)
    try:
        return _lire_avec_navigateur(url)
    except SiteIllisible as e:
        logger.info(f"navigateur en échec sur {url} ({e}), repli sur le téléchargement")
        try:
            brut = _lire_sans_navigateur(url)
        except Exception:
            raise e
        if len(brut.get("texte") or "") < 120:
            raise e
        return brut


def _lire_avec_navigateur(url: str) -> dict:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        args = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
        try:
            navigateur = pw.chromium.launch(args=args)
        except Exception:
            navigateur = pw.chromium.launch(channel="chromium", args=args)
        try:
            page = navigateur.new_page(
                viewport={"width": 1440, "height": 900},
                # Sans user-agent crédible, beaucoup de sites servent une page de
                # vérification anti-robot au lieu de leur contenu.
                user_agent=_NAVIGATEUR,
                locale="fr-FR",
            )
            page.set_default_timeout(DELAI_MS)
            try:
                # "domcontentloaded" et pas "load" : sur un gros site marchand, le
                # load attend toutes les images et les traceurs, et on expire alors
                # que le texte est lisible depuis longtemps.
                page.goto(url, wait_until="domcontentloaded", timeout=DELAI_MS)
            except Exception as e:
                raise SiteIllisible("Le site n'a pas répondu à temps.") from e
            # On laisse le rendu client s'installer, sans en dépendre : si le
            # réseau traîne, on lit quand même ce qui est déjà affiché.
            try:
                page.wait_for_load_state("networkidle", timeout=4000)
            except Exception:
                page.wait_for_timeout(1500)
            brut = page.evaluate(_EXTRACTION)
            brut["url"] = page.url
            if brut.get("logo"):
                if not brut["logo"].startswith("data:"):
                    brut["logo"] = urljoin(page.url, brut["logo"])
        finally:
            navigateur.close()

    if len((brut.get("texte") or "")) < 120:
        raise SiteIllisible("Ce site ne contient pas assez de texte pour en déduire une marque.")
    return brut


# --- Déduction de la fiche ---------------------------------------------------
_SCHEMA = {
    "type": "object",
    "properties": {
        "secteur": {"type": "string"},
        "audience": {"type": "string"},
        "voix_marque": {"type": "string"},
        "piliers": {"type": "array", "items": {"type": "string"}, "maxItems": 5},
        "hooks": {"type": "array", "items": {"type": "string"}, "maxItems": 5},
        "ctas": {"type": "array", "items": {"type": "string"}, "maxItems": 4},
        "a_eviter": {"type": "string"},
        "couleur_principale": {"type": "string"},
        "couleur_secondaire": {"type": "string"},
        "couleur_accent": {"type": "string"},
    },
    "required": ["secteur", "audience", "voix_marque", "piliers", "hooks", "ctas"],
    "additionalProperties": False,
}

_CONSIGNE = """Tu lis le site web d'une entreprise et tu en déduis sa fiche de marque,
celle qui servira à écrire ses publications sur les réseaux sociaux.

Règles :
- Écris en {langue}, avec les accents et la ponctuation correcte.
- Tu décris CETTE entreprise, pas une entreprise générique. Reprends son
  vocabulaire, ses offres, ses noms de produits tels qu'ils apparaissent.
- « secteur » : une formule courte et concrète (« cabinet de kinésithérapie »,
  pas « santé et bien-être »).
- « audience » : à qui elle parle vraiment, en une phrase.
- « voix_marque » : le ton, en deux ou trois phrases, tel qu'on le ressent sur
  le site. Si le site est sobre et technique, ne l'écris pas pétillant.
- « piliers » : 3 à 5 thèmes de contenu que cette entreprise peut tenir dans la
  durée, tirés de ce qu'elle fait réellement.
- « hooks » : 3 à 5 accroches prêtes à l'emploi, dans sa voix.
- « ctas » : 2 à 4 appels à l'action correspondant à ce qu'elle vend.
- « a_eviter » : mots, promesses ou tons qui trahiraient cette marque.
- Les couleurs : choisis parmi celles relevées sur le site. La principale est
  celle qui domine, l'accent celle qui attire l'œil. Format #RRGGBB. Si aucune
  couleur n'a été relevée, laisse ces trois champs vides.

N'invente pas de chiffres, de récompenses ni de références clients absents du site."""


def deduire(brut: dict, langue: str = "fr") -> dict:
    """Transforme la matière brute en fiche de marque exploitable."""
    if not _client:
        raise GenerationError("Analyse indisponible.")

    langues = {"fr": "français", "en": "anglais", "es": "espagnol"}
    contenu = (
        f"Adresse : {brut.get('url')}\n"
        f"Titre : {brut.get('titre')}\n"
        f"Description : {brut.get('description')}\n"
        f"Couleurs relevées : {', '.join(brut.get('couleurs') or []) or 'aucune'}\n"
        f"Navigation : {' · '.join(brut.get('liens') or [])}\n\n"
        f"Contenu de la page :\n{brut.get('texte')}"
    )
    rep = _messages_create(
        model=MODELE, max_tokens=2000,
        system=_CONSIGNE.format(langue=langues.get((langue or "fr")[:2], "français")),
        messages=[{"role": "user", "content": contenu}],
        tools=[{"name": "fiche_de_marque", "description": "La fiche de marque déduite du site.",
                "input_schema": _SCHEMA}],
        tool_choice={"type": "tool", "name": "fiche_de_marque"},
    )
    for bloc in rep.content:
        if bloc.type == "tool_use":
            return bloc.input
    raise GenerationError("Analyse du site impossible.")


async def analyser(url: str, langue: str = "fr") -> dict:
    """Lit le site et renvoie la fiche déduite, à faire valider par le client.

    On ne l'enregistre pas ici : la fiche est proposée, jamais imposée.
    """
    # Playwright bloque le thread ; sans ce detour, une analyse gelerait tout
    # le serveur pendant une trentaine de secondes.
    brut = await asyncio.to_thread(lire, url)
    fiche = await asyncio.to_thread(deduire, brut, langue)
    # On ne propose un logo qu'apres l'avoir reellement recupere, et on le
    # renvoie inline : sinon un serveur qui refuse les appels d'un autre
    # domaine laisserait le client devant un cadre vide.
    if brut.get("logo"):
        try:
            donnees, type_ = telecharger_logo(brut["logo"])
            if len(donnees) <= LOGO_INLINE:
                fiche["logo_url"] = "data:%s;base64,%s" % (
                    type_, base64.b64encode(donnees).decode())
                fiche["logo_type"] = brut.get("logoType") or "image"
        except Exception as e:
            logger.info(f"logo ecarte ({brut.get('logoType')}): {e}")
    fiche["_source"] = {"url": brut.get("url"), "titre": brut.get("titre"),
                        "couleurs": brut.get("couleurs")}
    logger.info(f"site analysé : {brut.get('url')} -> {fiche.get('secteur')}")
    return fiche


# --- Récupération du logo ----------------------------------------------------
LOGO_MAX = 5 * 1024 * 1024
# Au-dela, on ne le fait pas transiter dans la reponse d'analyse : un apercu ne
# justifie pas d'alourdir la page a ce point.
LOGO_INLINE = 400 * 1024
_TYPES_LOGO = ("image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif")


def telecharger_logo(url: str) -> tuple:
    """Récupère le logo repéré sur le site, prêt à être poussé sur Cloudinary.

    Renvoie (octets, type MIME). L'adresse est refaite passer par le garde-fou :
    même si elle vient de notre propre analyse, elle transite par le navigateur
    du client et pourrait être remplacée avant de nous revenir.
    """
    import base64
    import binascii
    import httpx

    url = (url or "").strip()
    if not url:
        raise SiteIllisible("Aucun logo à récupérer.")

    # Logo deja en main : soit serialise depuis la page, soit inline par
    # l'analyse pour que l'apercu du client montre exactement ce qu'on garde.
    if url.startswith("data:image/"):
        entete, _, charge = url.partition(",")
        type_ = entete[5:].split(";")[0].lower()
        if type_ not in _TYPES_LOGO:
            raise SiteIllisible("Ce fichier n'est pas une image.")
        try:
            donnees = base64.b64decode(charge, validate=True)
        except (binascii.Error, ValueError):
            raise SiteIllisible("Ce logo est illisible.")
        if len(donnees) > LOGO_MAX:
            raise SiteIllisible("Logo trop lourd.")
        return donnees, type_

    r = httpx.get(normaliser(url), timeout=20, follow_redirects=True,
                  headers={"user-agent": _NAVIGATEUR})
    r.raise_for_status()
    type_ = (r.headers.get("content-type") or "").split(";")[0].strip().lower()
    if type_ not in _TYPES_LOGO:
        raise SiteIllisible("Ce fichier n'est pas une image.")
    if len(r.content) > LOGO_MAX:
        raise SiteIllisible("Logo trop lourd.")
    return r.content, type_
