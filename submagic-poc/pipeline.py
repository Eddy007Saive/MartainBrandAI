# Pipeline paramétrable (utilisé par app.py) — s'appuie sur submagic_poc5
import hashlib
import json
import os
import subprocess
import threading

import numpy as np

import submagic_poc5 as base

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(HERE, "cache")
os.makedirs(CACHE_DIR, exist_ok=True)
# RLock (pas Lock) : process() tient LOCK puis rappelle transcribe(), qui
# reprend LOCK dans le même thread — un Lock simple ferait un deadlock.
LOCK = threading.RLock()
_model = None

# Avertissements du rendu EN COURS — un seul rendu à la fois (protégé par
# LOCK), donc une liste module-level suffit, pas besoin de thread-local.
# Chaque repli silencieux (échec IA, téléchargement...) y ajoute un message
# clair en français, exposé au frontend via le statut du job -> plus aucun
# échec invisible pour l'utilisateur, même quand le montage aboutit quand
# même (résultat dégradé mais fonctionnel).
WARNINGS = []


def _warn(user_msg, detail=None):
    """user_msg : message clair en français, sans jargon technique, ajouté
    aux avertissements exposés au frontend. detail : exception/contexte
    technique, gardé UNIQUEMENT dans le log serveur (jamais montré à
    l'utilisateur)."""
    log_line = user_msg + (f" [{detail}]" if detail else "")
    print(log_line.encode("ascii", "backslashreplace").decode("ascii"))
    WARNINGS.append(user_msg)


WHISPER_SIZE = None  # exposé après chargement, pour affichage/diagnostic


WHISPER_TIERS = ("medium", "small", "base")  # du plus précis au plus léger


def _whisper():
    global _model, WHISPER_SIZE
    if _model is None:
        from faster_whisper import WhisperModel
        # cpu_threads borné explicitement (au lieu de 0 = auto/tous les
        # coeurs) : évite que ctranslate2 sur-réserve son pool de threads
        # MKL sur une machine à RAM limitée. "medium" (~1,5 Go de poids) est
        # nettement plus précis que "small" (moins de fautes type "proéé"
        # pour "prouvé") mais plus gourmand ; repli en cascade sur "small"
        # (~460 Mo) puis "base" (~145 Mo) si la RAM manque (mkl_malloc).
        for i, size in enumerate(WHISPER_TIERS):
            try:
                _model = WhisperModel(size, device="cpu", compute_type="int8",
                                       cpu_threads=2, num_workers=1)
                WHISPER_SIZE = size
                break
            except RuntimeError as e:
                if size == WHISPER_TIERS[-1]:
                    raise
                _warn("Transcription : qualité légèrement réduite (mémoire serveur "
                     "insuffisante pour le modèle le plus précis).", detail=str(e))
    return _model


def words_cache_path(video):
    """Cache de transcription par empreinte du fichier : un même upload
    (suggestion de hooks puis montage) n'est transcrit qu'une fois."""
    h = hashlib.md5()
    with open(video, "rb") as f:
        while chunk := f.read(1 << 20):
            h.update(chunk)
    return os.path.join(CACHE_DIR, h.hexdigest() + ".words.json")


def transcribe(video, progress=lambda s: None, correct=True):
    # WhisperModel n'est pas thread-safe : LOCK sérialise tout accès,
    # que l'appel vienne de /process ou du bouton "Suggérer avec l'IA"
    with LOCK:
        cache_path = words_cache_path(video)
        if os.path.exists(cache_path):
            return cache_path
        progress("transcription")
        segments, info = _whisper().transcribe(video, word_timestamps=True)
        raw = []
        for seg in segments:
            for w in seg.words:
                raw.append({"text": w.word.strip(), "start": round(w.start, 3),
                            "end": round(w.end, 3)})
        # Whisper isole parfois l'apostrophe des contractions ("j" + "'ai") :
        # recoller AVANT la correction, sinon celle-ci "corrige" le fragment
        # isolé en ajoutant sa propre apostrophe -> "j'" + "'ai" (doublée)
        words = []
        for wd in raw:
            if words and (wd["text"].startswith("'") or words[-1]["text"].endswith("'")):
                words[-1]["text"] += wd["text"]
                words[-1]["end"] = wd["end"]
            else:
                words.append(dict(wd))
        if correct and words:
            progress("correction")
            import correct as correct_mod
            words = correct_mod.correct_words(words, info.language)
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump({"language": info.language, "words": words}, f, ensure_ascii=False)
        return cache_path


def hex_to_ass(color):
    c = color.lstrip("#")
    r, g, b = c[0:2], c[2:4], c[4:6]
    return f"&H{b}{g}{r}&".upper()


# Styles de sous-titres (inspirés des presets Submagic)
# primary/box/glow : "white" | "black" | "hl" (= couleur choisie par l'utilisateur)
# active : mot actif -> "hl" | "white" | "scale" | "pop" (couleur + scale)
# shad : ombre portée dure (0 = selon défaut)
PRESETS = {
    "classic": {"font": "Arial Black", "italic": 0, "primary": "white",
                "border": 1, "box": None, "glow": None, "shad": 0, "active": "hl"},
    "hormozi": {"font": "Segoe UI Black", "italic": 0, "primary": "white",
                "border": 1, "box": None, "glow": "black", "shad": 0, "active": "hl"},
    "neon":    {"font": "Segoe UI Black", "italic": 0, "primary": "white",
                "border": 1, "box": None, "glow": "hl", "shad": 0, "active": "white"},
    "leon":    {"font": "Arial Black", "italic": 0, "primary": "white",
                "border": 3, "box": "hl", "glow": None, "shad": 0, "active": "scale"},
    "molly":   {"font": "Verdana", "italic": 0, "primary": "black",
                "border": 3, "box": "white", "glow": None, "shad": 0, "active": "hl"},
    "caleb":   {"font": "Arial Black", "italic": 0, "primary": "white",
                "border": 3, "box": "black", "glow": None, "shad": 0, "active": "hl"},
    "william": {"font": "Arial Black", "italic": 0, "primary": "hl",
                "border": 1, "box": None, "glow": None, "shad": 0, "active": "white"},
    "beast":   {"font": "Impact", "italic": 0, "primary": "white",
                "border": 1, "box": None, "glow": None, "shad": 5, "active": "hl"},
    "duo":     {"font": "Trebuchet MS", "italic": 0, "primary": "white",
                "border": 1, "box": None, "glow": None, "shad": 0, "active": "pop"},
    "noah":    {"font": "Segoe UI Black", "italic": 1, "primary": "white",
                "border": 1, "box": None, "glow": None, "shad": 0, "active": "hl"},
    "brandin": {"font": "Georgia", "italic": 0, "primary": "white",
                "border": 1, "box": None, "glow": None, "shad": 0, "active": "hl"},
    "bahn":    {"font": "Bahnschrift", "italic": 0, "primary": "white",
                "border": 1, "box": None, "glow": None, "shad": 3, "active": "hl"},
}


def _col(token, hl):
    return {"white": "&HFFFFFF&", "black": "&H000000&", "hl": hex_to_ass(hl)}[token]


# largeur moyenne d'un glyphe majuscule gras, en fraction de la taille de
# police (empirique, par police) — sert à choisir la plus grande taille de
# hook qui tient dans le cadre
WRAP_K = {
    "Arial Black": 0.63, "Impact": 0.50, "Segoe UI Black": 0.61,
    "Verdana": 0.62, "Trebuchet MS": 0.58, "Georgia": 0.56, "Bahnschrift": 0.52,
}


def _wrap_balanced(tokens, n_lines):
    if n_lines <= 1:
        return [" ".join(tokens)]
    target = (sum(len(t) for t in tokens) + len(tokens) - 1) / n_lines
    lines, cur, cur_len = [], [], 0
    for t in tokens:
        add = len(t) + (1 if cur else 0)
        if cur and cur_len + add > target and len(lines) < n_lines - 1:
            lines.append(" ".join(cur))
            cur, cur_len = [], 0
            add = len(t)
        cur.append(t)
        cur_len += add
    if cur:
        lines.append(" ".join(cur))
    return lines


def fit_hook(text, w, h, font):
    """Choisit le découpage en lignes + la taille de police qui font
    dominer le cadre (jusqu'à ~90% de la largeur), sur 1 à 3 lignes."""
    tokens = text.split()
    k = WRAP_K.get(font, 0.60)
    target_w = w * 0.90
    max_fs, min_fs = int(h * 0.13), int(h * 0.045)
    best = None
    for n in (1, 2, 3):
        if n > len(tokens):
            break
        lines = _wrap_balanced(tokens, n)
        max_chars = max(len(l) for l in lines)
        fs = min(max_fs, int(target_w / (max_chars * k))) if max_chars else max_fs
        if best is None or fs > best[1]:
            best = (lines, fs)
    lines, fs = best
    return lines, max(fs, min_fs)


HOOK_ANCHORS = {"top": (8, 0.09), "center": (5, 0.50), "bottom": (2, 0.86)}


def _build_hook_ass(hook, o, w, h):
    """Style ASS "Hook" + lignes Dialogue — factorisé pour être partagé entre
    le montage (build_ass) et la miniature (render_thumbnail)."""
    hlc = o["hl_color"]
    hp_key = o.get("hook_preset") or o.get("preset", "classic")
    hp = PRESETS.get(hp_key, PRESETS["classic"])
    hook_font = hp["font"]
    hook_src = hook.upper() if o["uppercase"] else hook
    wrapped, hook_size = fit_hook(hook_src, w, h, hook_font)
    hook_size = int(hook_size * o.get("hook_fontscale", 1.0))
    hook_size = max(int(h * 0.03), min(hook_size, int(h * 0.17)))
    text_block = r"\N".join(wrapped)
    hook_primary = "&H00" + _col(hp["primary"], hlc)[2:-1] + "&"
    if hp["border"] == 3:
        hook_outline_col = "&H00" + _col(hp["box"], hlc)[2:-1] + "&"
        hook_outline_w = max(8, hook_size // 5)
        hook_shadow = 0
    else:
        hook_outline_col = "&H00000000"
        hook_outline_w = 0 if hp["glow"] else max(3, hook_size // 10)
        hook_shadow = (max(2, hook_size // 18) if hp["shad"]
                        else (0 if hp["glow"] else max(2, hook_size // 16)))
    an_code, pos_frac = HOOK_ANCHORS.get(o.get("hook_position", "top"), HOOK_ANCHORS["top"])
    pos_y = int(h * pos_frac)
    style_line = (
        f'Style: Hook,{hook_font},{hook_size},{hook_primary},&H00FFFFFF,'
        f'{hook_outline_col},&H80000000,-1,{hp["italic"]},0,0,100,100,1,0,'
        f'{hp["border"]},{hook_outline_w},{hook_shadow},{an_code},40,40,0,1'
    )
    pop_in = r"\fscx72\fscy72\t(0,140,\fscx100\fscy100)"
    base_tag = f"\\an{an_code}\\q2\\pos({w // 2},{pos_y})\\fs{hook_size}{pop_in}"
    ts = "0:00:00.00,0:00:02.80"
    events = []
    if hp["glow"]:
        hook_glow_col = _col(hp["glow"], hlc)
        halo_bord, halo_blur = max(6, hook_size // 4), max(8, hook_size // 3)
        halo = f"{{{base_tag}\\bord{halo_bord}\\blur{halo_blur}\\3c{hook_glow_col}\\shad0}}"
        crisp = f"{{{base_tag}\\bord0\\shad0}}"
        events.append(f"Dialogue: 2,{ts},Hook,,0,0,0,,{halo}{text_block}")
        events.append(f"Dialogue: 3,{ts},Hook,,0,0,0,,{crisp}{text_block}")
    else:
        events.append(f"Dialogue: 2,{ts},Hook,,0,0,0,,{{{base_tag}}}{text_block}")
    return style_line, events


def _thumb_text_zone_style(o):
    """Description courte (anglais) du type de zone à garder dégagée pour
    le texte, adaptée à la FAMILLE du preset de hook choisi (cf. _design/
    prompt min.md, "styles de texte par type de vidéo") — pour que le fond
    généré par Nano Banana soit visuellement cohérent avec le texte qui y
    sera réellement incrusté ensuite (contraste suffisant, zone assombrie
    sous un texte élégant, etc.), pas juste "une zone dégagée" générique."""
    hp_key = o.get("hook_preset") or o.get("preset", "classic")
    hp = PRESETS.get(hp_key, PRESETS["classic"])
    if hp["font"] == "Georgia":
        return ("an elegant, slightly darker cinematic area suited for "
                "refined serif or hand-lettered typography")
    if hp["glow"] or hp["border"] == 3:
        return ("a clean, high-contrast area suited for large, bold, "
                "vibrant impact-style typography")
    return ("a clean, uncluttered area suited for modern, professional "
            "sans-serif typography")


def render_thumbnail(video, out_jpg, o, src_w, src_h, cw, hook_text,
                      transcript=None, language="fr"):
    """Sélectionne la meilleure frame (Gemini juge visuellement une short-list
    de candidats), la retouche via Nano Banana (direction artistique décrite
    par Claude à partir du transcript, repli sur un style générique), puis y
    incruste le hook avec le même style que la vidéo."""
    import thumbnail as thumb_mod
    _, frame, face_cx, gemini_error = thumb_mod.pick_best_frame(video, o.get("face_track", True))
    if gemini_error:
        _warn("Miniature : choix de la meilleure image simplifié (service IA "
             "indisponible).", detail=gemini_error)

    out_w, out_h = (base.OUT_W, base.OUT_H) if o["vertical"] else (src_w, src_h)
    if o["vertical"]:
        px = int(max(0, min(src_w - cw, face_cx * src_w - cw / 2)))
        frame = frame[:, px:px + cw]
    frame = base.cv2.resize(frame, (out_w, out_h), interpolation=base.cv2.INTER_LANCZOS4)

    if o.get("thumb_ai_style", True):
        try:
            import hooks
            import nanobanana
            style_hint = None
            if (transcript or "").strip():
                style_hint = hooks.suggest_thumbnail_style(
                    transcript, language, o.get("hook_position", "top"),
                    _thumb_text_zone_style(o))
            ok, buf = base.cv2.imencode(".jpg", frame, [base.cv2.IMWRITE_JPEG_QUALITY, 92])
            styled_bytes = nanobanana.restyle(buf.tobytes(), style_hint)
            if styled_bytes:
                arr = np.frombuffer(styled_bytes, dtype=np.uint8)
                decoded = base.cv2.imdecode(arr, base.cv2.IMREAD_COLOR)
                if decoded is not None:
                    candidate = base.cv2.resize(decoded, (out_w, out_h),
                                                interpolation=base.cv2.INTER_LANCZOS4)
                    # garde-fou qualité : un modèle génératif n'est pas un
                    # filtre déterministe, la netteté du résultat varie d'un
                    # essai à l'autre -> on garde la retouche seulement si
                    # elle n'est pas notablement plus floue que l'original
                    def _sharp(im):
                        return base.cv2.Laplacian(
                            base.cv2.cvtColor(im, base.cv2.COLOR_BGR2GRAY),
                            base.cv2.CV_64F).var()
                    if _sharp(candidate) >= _sharp(frame) * 0.6:
                        frame = candidate
                    else:
                        _warn("Miniature : retouche IA générée mais trop floue, "
                             "photo d'origine conservée.")
            else:
                _warn("Miniature : le service de retouche IA n'a renvoyé aucune "
                     "image (refus ou quota), photo d'origine conservée.")
        except Exception as e:
            _warn("Miniature : retouche/mise en scène IA indisponible, photo "
                 "d'origine utilisée telle quelle.", detail=str(e))

    base_path = os.path.splitext(os.path.abspath(out_jpg))[0]
    png_path = base_path + ".still.png"
    base.cv2.imwrite(png_path, frame)

    hook = (hook_text or "").strip()
    if not hook:
        base.cv2.imwrite(out_jpg, frame, [base.cv2.IMWRITE_JPEG_QUALITY, 92])
        return

    style_line, events = _build_hook_ass(hook, o, out_w, out_h)
    ass_path = base_path + ".thumb.ass"
    with open(ass_path, "w", encoding="utf-8-sig") as f:
        f.write(f"""[Script Info]
ScriptType: v4.00+
PlayResX: {out_w}
PlayResY: {out_h}
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
{style_line}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
""" + "\n".join(events) + "\n")

    ass_escaped = ass_path.replace("\\", "/").replace(":", r"\:")
    # rendu à t=0.3s (pas t=0) : laisse le temps à l'animation d'entrée du
    # hook (\t sur 140 ms) de se stabiliser avant de figer l'image
    subprocess.run(
        [base.FFMPEG, "-y", "-loop", "1", "-t", "0.6", "-i", png_path,
         "-vf", f"ass='{ass_escaped}'", "-ss", "0.3", "-frames:v", "1",
         "-update", "1", out_jpg],
        check=True, capture_output=True)


def build_ass(words, remap, path, w, h, o):
    p = PRESETS.get(o.get("preset", "classic"), PRESETS["classic"])
    font = o.get("font") or p["font"]
    fontsize = int(h * 0.045 * o["fontscale"])
    margin_v = int(h * o["position"])
    hlc = o["hl_color"]
    primary = "&H00" + _col(p["primary"], hlc)[2:-1] + "&"
    if p["border"] == 3:
        # boîte pleine : OutlineColour = fond de boîte, Outline = padding
        outline_col = "&H00" + _col(p["box"], hlc)[2:-1] + "&"
        outline_w = max(4, fontsize // 6)
        shadow = 0
    else:
        outline_col = "&H00000000"
        outline_w = 0 if p["glow"] else max(2, fontsize // 12)
        shadow = p["shad"] if p["shad"] else (0 if p["glow"] else max(2, fontsize // 16))
    reset_c = "{\\c" + _col(p["primary"], hlc) + "}"
    # mot actif selon le preset
    active_on = {"hl": "{\\c" + hex_to_ass(hlc) + "}",
                 "white": "{\\c&HFFFFFF&}",
                 "scale": r"{\fscx112\fscy112}",
                 "pop": "{\\c" + hex_to_ass(hlc) + r"\fscx110\fscy110}"}[p["active"]]
    active_off = {"hl": reset_c,
                  "white": reset_c,
                  "scale": r"{\fscx100\fscy100}",
                  "pop": reset_c[:-1] + r"\fscx100\fscy100}"}[p["active"]]
    pop = r"{\fscx70\fscy70\t(0,90,\fscx100\fscy100)}"
    glow_col = _col(p["glow"], hlc) if p["glow"] else "&H000000&"
    glow_tag = (f"{{\\bord{max(4, fontsize // 5)}\\blur{max(6, fontsize // 4)}"
                f"\\3c{glow_col}\\shad0}}")

    # --- Hook : style et emplacement indépendants des sous-titres ---
    # "Karaoke" (défini plus haut) reste au style choisi pour les
    # sous-titres ; le hook a son propre style ASS "Hook", au choix de
    # l'utilisateur — nécessaire car BorderStyle (boîte vs contour) ne
    # peut pas être changé par un tag inline, seulement par le Style.
    # (logique partagée avec la miniature -> _build_hook_ass)
    hook_style_line, hook_events = "", []
    hook = (o.get("hook") or "").strip()
    if hook:
        hook_style_line, hook_events = _build_hook_ass(hook, o, w, h)

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {w}
PlayResY: {h}
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Karaoke,{font},{fontsize},{primary},&H00FFFFFF,{outline_col},&H80000000,-1,{p["italic"]},0,0,100,100,1,0,{p["border"]},{outline_w},{shadow},2,40,40,{margin_v},1
{hook_style_line}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    groups, cur, size = [], [], 0
    for wd in words:
        n = len(wd["text"])
        if cur and size + 1 + n > base.LINE_BUDGET:
            groups.append(cur)
            cur, size = [], 0
        cur.append(wd)
        size += n + (1 if size else 0)
    if cur:
        groups.append(cur)
    lines = list(hook_events)
    for g in groups:
        for i, active in enumerate(g):
            start = remap(active["start"])
            end = remap(g[i + 1]["start"]) if i + 1 < len(g) else remap(active["end"])
            if end <= start:
                end = start + 0.05
            def cased(t):
                return t.upper() if o["uppercase"] else t
            parts = [active_on + cased(w2["text"]) + active_off if j == i else cased(w2["text"])
                     for j, w2 in enumerate(g)]
            prefix = pop if i == 0 else ""
            text = f"{prefix}{' '.join(parts)}"
            ts = f"{base.fmt_time(start)},{base.fmt_time(end)}"
            if p["glow"]:
                # couche 0 : halo noir flouté derrière le texte
                lines.append(f"Dialogue: 0,{ts},Karaoke,,0,0,0,,{glow_tag}{text}")
                lines.append(f"Dialogue: 1,{ts},Karaoke,,0,0,0,,{text}")
            else:
                lines.append(f"Dialogue: 0,{ts},Karaoke,,0,0,0,,{text}")
    with open(path, "w", encoding="utf-8-sig") as f:
        f.write(header + "\n".join(lines) + "\n")


def build_filtergraph(segs, crops, zxy, ass_path, cw, src_w, src_h, o, path,
                       kept_duration, music_path, emoji_picks, broll_picks):
    n = len(segs)
    z, x, y = zxy
    out_w, out_h = (base.OUT_W, base.OUT_H) if o["vertical"] else (src_w, src_h)
    # afftdn (FFT) et non arnndn : dans ce build ffmpeg, arnndn est instable
    # (erreur de flush AAC avec mix, crash 0xC0000005 aléatoire sans)
    if o["audio_clean"]:
        aclean = ("[0:a]highpass=f=80,afftdn=nr=12:nf=-28,"
                  "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[acl];\n")
    else:
        aclean = "[0:a]anull[acl];\n"
    vsplit = f"[0:v]split={n}" + "".join(f"[s{i}]" for i in range(n)) + ";\n"
    asplit = aclean + f"[acl]asplit={n}" + "".join(f"[t{i}]" for i in range(n)) + ";\n"
    chains = []
    for i, (a, b) in enumerate(segs):
        vf = f"[s{i}]trim=start={a:.3f}:end={b:.3f},setpts=PTS-STARTPTS"
        if o["vertical"]:
            xexpr = crops[i] if isinstance(crops[i], int) else f"'{crops[i]}'"
            vf += f",crop={cw}:{src_h}:{xexpr}:0,scale={out_w}:{out_h}:flags=lanczos"
        chains.append(vf + f"[v{i}];")
        chains.append(f"[t{i}]atrim=start={a:.3f}:end={b:.3f},asetpts=PTS-STARTPTS[a{i}];")
    concat_in = "".join(f"[v{i}][a{i}]" for i in range(n))
    ass_escaped = ass_path.replace("\\", "/").replace(":", r"\:")
    graph = (vsplit + asplit + "\n".join(chains)
             + f"\n{concat_in}concat=n={n}:v=1:a=1[vc][ac];\n")

    video_label = "[vc]"
    if o["zoom"]:
        graph += (f"{video_label}zoompan=z='{z}':x='{x}':y='{y}':d=1:"
                  f"s={out_w}x{out_h}:fps={base.FPS}[vz];\n")
        video_label = "[vz]"

    # b-roll : remplace TOUT le cadre pendant sa fenêtre (contrairement aux
    # emojis, petits et positionnés) mais reste SOUS les sous-titres ->
    # inséré ici, avant le burn ASS (les emojis, eux, passent au-dessus de
    # tout, après [vbase])
    for idx, br in enumerate(broll_picks):
        nxt = f"[vbr{idx}]"
        graph += (
            f"[{br['input']}:v]scale={out_w}:{out_h}:force_original_aspect_ratio=increase,"
            f"crop={out_w}:{out_h}[brf{idx}];\n"
            f"{video_label}[brf{idx}]overlay=x=0:y=0:"
            f"enable='between(t,{br['start']:.3f},{br['end']:.3f})'{nxt};\n"
        )
        video_label = nxt

    graph += f"{video_label}ass='{ass_escaped}'[vbase];\n"

    # emojis réaction : overlays PNG couleur chaînés au-dessus des sous-titres
    # (le texte ASS ne rend les emojis qu'en silhouette monochrome sur ce
    # build ffmpeg/libass — testé). Un fondu bref évite l'apparition abrupte.
    video_label = "[vbase]"
    if emoji_picks:
        emoji_size = int(out_w * 0.17)
        emoji_cy = int(out_h * max(0.12, 1 - o["position"] - 0.17))
        ey = max(10, emoji_cy - emoji_size // 2)
        for idx, ep in enumerate(emoji_picks):
            last = idx == len(emoji_picks) - 1
            nxt = "[vout]" if last else f"[ve{idx}]"
            fade_out_at = max(ep["start"], ep["end"] - 0.12)
            graph += (
                f"[{ep['input']}:v]scale={emoji_size}:-1,format=rgba,"
                f"fade=t=in:st={ep['start']:.3f}:d=0.12:alpha=1,"
                f"fade=t=out:st={fade_out_at:.3f}:d=0.12:alpha=1[em{idx}];\n"
                f"{video_label}[em{idx}]overlay=x=(W-w)/2:y={ey}:"
                f"enable='between(t,{ep['start']:.3f},{ep['end']:.3f})'{nxt};\n"
            )
            video_label = nxt
    else:
        graph += "[vbase]null[vout];\n"
    final_video = "[vout]"
    # musique de fond : continue sous TOUTE la vidéo finale (pas hachée par
    # segment comme la voix) — 2e input ffmpeg, bouclé si plus court, mixé
    # après le concat avec fondu d'entrée/sortie et volume utilisateur
    if music_path:
        vol_pct = max(0, min(100, o.get("music_volume", 30)))
        music_db = -32 + (vol_pct / 100) * 24
        fade_out_start = max(0.0, kept_duration - 1.0)
        graph += (
            f"[1:a]atrim=0:{kept_duration:.3f},asetpts=PTS-STARTPTS,"
            f"volume={music_db:.1f}dB,"
            f"afade=t=in:d=0.6,afade=t=out:st={fade_out_start:.3f}:d=1[bgm];\n"
            f"[ac][bgm]amix=inputs=2:duration=first:dropout_transition=0,"
            f"alimiter=limit=0.95[acf]"
        )
        final_audio = "[acf]"
    else:
        graph += "[ac]anull[acf]"
        final_audio = "[acf]"
    with open(path, "w", encoding="utf-8") as f:
        f.write(graph)
    return final_video, final_audio


def process(video, out, o, progress=lambda s: None):
    with LOCK:
        global WARNINGS
        WARNINGS = []
        words_cache = transcribe(video, progress)
        language = json.load(open(words_cache, encoding="utf-8")).get("language", "fr")
        words = base.load_words(words_cache)
        if not words:
            raise RuntimeError("Aucune parole détectée dans la vidéo")

        # hook automatique : l'IA génère l'accroche pendant le montage
        if o.get("hook_auto") and not (o.get("hook") or "").strip():
            progress("hook")
            import hooks
            transcript = " ".join(w["text"] for w in words)
            if transcript.strip():
                o["hook"] = hooks.suggest_hooks(transcript, language)[0]

        # emojis réaction : l'IA repère quelques mots-clés/moments forts
        emoji_raw = []
        if o.get("emojis"):
            progress("emojis")
            import emojis as emojis_mod
            try:
                emoji_raw = emojis_mod.suggest_emojis(words, language)
            except Exception as e:
                _warn("Emojis : sélection IA indisponible, aucun emoji ajouté.",
                     detail=str(e))

        # b-roll : l'IA repère des concepts concrets à illustrer par un clip
        broll_raw = []
        if o.get("brolls"):
            progress("brolls")
            import brolls_ai
            try:
                broll_raw = brolls_ai.suggest_brolls(words, language)
            except Exception as e:
                _warn("B-roll : sélection IA indisponible, aucun plan d'illustration "
                     "ajouté.", detail=str(e))

        progress("analyse")
        base.ZOOM_MAX = o["zoom_max"]
        src_w, src_h, duration = base.probe(video)
        cw = int(src_h * 9 / 16) // 2 * 2
        segs = (base.keep_segments(words, duration) if o["cuts"]
                else [(0.0, duration)])
        remap = base.remap_factory(segs)
        # suivi visage désactivé -> samples vides : crop et zoom centrés
        samples = base.detect_faces(video, cw / src_w) if o.get("face_track", True) else []

        crops, seg_keys, seg_static = [], [], []
        for a, b in segs:
            cx, _ = base.face_center(samples, a, b)
            px = int(max(0, min(src_w - cw, cx * src_w - cw / 2)))
            keys = base.pan_keyframes(samples, a, b, src_w, cw)
            seg_keys.append(keys)
            seg_static.append(px)
            crops.append(base.pan_expr(keys) if keys else px)

        def seg_of(t):
            for i, (a, b) in enumerate(segs):
                if a <= t <= b:
                    return i
            return 0

        zoom_list = []
        for i, (a, b) in enumerate(base.phrases(words)):
            if i % 2 == 1 or b - a < 0.8:
                continue
            cx, cy = base.face_center(samples, a, b)
            if o["vertical"]:
                si = seg_of((a + b) / 2)
                seg_x = base.crop_x_at(seg_keys[si], seg_static[si], (a + b) / 2 - segs[si][0])
                cx = max(0.0, min(1.0, (cx * src_w - seg_x) / cw))
            zoom_list.append((remap(a), remap(b), cx, cy))

        out_w, out_h = (base.OUT_W, base.OUT_H) if o["vertical"] else (src_w, src_h)
        kept_duration = sum(b - a for a, b in segs)
        music_path = None
        if o.get("music_id") and o["music_id"] != "none":
            progress("musique")
            import music
            try:
                music_path = music.local_path(o["music_id"])
                if not music_path:
                    _warn("Musique de fond : piste introuvable, vidéo rendue "
                         "sans musique.", detail=f"music_id={o['music_id']!r}")
            except Exception as e:
                _warn("Musique de fond : téléchargement de la piste impossible, "
                     "vidéo rendue sans musique.", detail=str(e))

        # résout les emojis choisis en occurrences temporisées (timeline finale,
        # après coupes) + assigne à chacune un index d'input ffmpeg dédié
        next_input = 2 if music_path else 1
        emoji_picks = []
        if emoji_raw:
            import emoji_lib
        for i, char in emoji_raw:
            try:
                png = emoji_lib.local_path(char)
            except Exception as e:
                _warn(f"Emoji {char} : téléchargement impossible, ignoré.", detail=str(e))
                continue
            if not png:
                _warn(f"Emoji {char} : introuvable dans la bibliothèque, ignoré.")
                continue
            start = remap(words[i]["start"])
            emoji_picks.append({"start": start, "end": start + 1.0,
                                "path": png, "input": next_input})
            next_input += 1

        # résout les b-rolls choisis : recherche Pexels + téléchargement +
        # index d'input ffmpeg dédié (à la suite des emojis)
        broll_picks = []
        BROLL_DURATION = 1.8
        if broll_raw:
            import broll
        for i, query in broll_raw:
            try:
                found = broll.search(query, out_w, out_h)
                if not found:
                    _warn(f"B-roll « {query} » : aucun clip trouvé, ignoré.")
                    continue
                clip_path = broll.local_path(found["id"], found["url"])
            except Exception as e:
                _warn(f"B-roll « {query} » : téléchargement impossible, ignoré.",
                     detail=str(e))
                continue
            start = remap(words[i]["start"])
            broll_picks.append({"start": start, "end": start + BROLL_DURATION,
                                "path": clip_path, "input": next_input})
            next_input += 1

        base_path = os.path.splitext(os.path.abspath(out))[0]
        ass_path = base_path + ".ass"
        build_ass(words, remap, ass_path, out_w, out_h, o)
        graph_path = base_path + ".filtergraph"
        final_video, final_audio = build_filtergraph(
            segs, crops, base.zoom_exprs(zoom_list), ass_path, cw, src_w, src_h,
            o, graph_path, kept_duration, music_path, emoji_picks, broll_picks)

        progress("rendu")
        cmd = [base.FFMPEG, "-y", "-i", video]
        if music_path:
            # -stream_loop AVANT le -i qu'il concerne : boucle la musique si
            # elle est plus courte que la vidéo finale (2e input, index [1:a]).
            # BORNÉ par -t (même piège que les emojis/b-roll découvert plus
            # tard : un flux -stream_loop -1 sans fin ne signale jamais l'EOF,
            # ce qui peut bloquer la synchronisation finale du muxage même si
            # amix (duration=first) ne l'attend pas explicitement — accroche
            # totale et silencieuse, aucune erreur, seul symptôme observable :
            # le rendu ne se termine jamais).
            cmd += ["-stream_loop", "-1", "-t", f"{kept_duration + 1:.3f}", "-i", music_path]
        for ep in emoji_picks:
            # -loop 1 : une image fixe devient un flux continu qu'on peut
            # fondre/découper sur la fenêtre de temps voulue ; SANS -t la
            # boucle est infinie -> plusieurs overlays infinis chaînés
            # bloquent l'ordonnanceur de filtres ffmpeg (testé : accroche
            # totale, 0% CPU, aucune erreur). On borne à la durée finale.
            cmd += ["-loop", "1", "-t", f"{kept_duration + 1:.3f}", "-i", ep["path"]]
        for br in broll_picks:
            # même piège que les emojis (overlay chaîné + flux infini sans
            # borne = ordonnanceur ffmpeg bloqué) : -stream_loop -1 borné
            # par -t plutôt que -loop 1 (ce sont de vrais clips vidéo, pas
            # une image fixe) — le point de départ dans la boucle du clip
            # n'a pas d'importance, seule la fenêtre `enable` compte.
            cmd += ["-stream_loop", "-1", "-t", f"{kept_duration + 1:.3f}", "-i", br["path"]]
        # crf 23 + preset medium : ~60 % plus léger que crf 18, indiscernable
        # sur mobile ; faststart pour la lecture en streaming
        cmd += ["-/filter_complex", graph_path,
                "-map", final_video, "-map", final_audio, "-c:v", "libx264", "-crf", "23",
                "-preset", "medium", "-movflags", "+faststart",
                "-c:a", "aac", "-b:a", "128k", out]
        # Filet de sécurité : toutes les entrées bouclées connues sont bornées
        # par -t (ci-dessus), mais un blocage de l'ordonnanceur ffmpeg est
        # silencieux (0% CPU, aucune erreur) — s'il en reste un autre non
        # découvert, ce timeout transforme une attente infinie ("génération
        # qui ne se finit jamais" côté utilisateur) en erreur visible plutôt
        # qu'un job bloqué pour toujours en "processing".
        try:
            subprocess.run(cmd, check=True, capture_output=True, timeout=1200)
        except subprocess.TimeoutExpired:
            raise RuntimeError("Le rendu vidéo a dépassé le délai maximum (20 min) "
                               "et a été interrompu — réessayez, ou contactez le support "
                               "si le problème persiste.")

        progress("miniature")
        thumb_out = os.path.splitext(os.path.abspath(out))[0] + ".thumb.jpg"
        try:
            transcript = " ".join(w["text"] for w in words)
            # la miniature doit TOUJOURS porter une accroche — même si
            # l'utilisateur n'a pas activé le hook sur la vidéo elle-même
            # (le hook y est plus déterminant pour le clic que sur la vidéo)
            thumb_hook = (o.get("hook") or "").strip()
            if not thumb_hook and transcript.strip():
                import hooks
                thumb_hook = hooks.suggest_hooks(transcript, language)[0]
            render_thumbnail(video, thumb_out, o, src_w, src_h, cw, thumb_hook,
                            transcript, language)
        except Exception as e:
            _warn("Miniature : échec complet de la génération, vidéo livrée "
                 "sans miniature.", detail=str(e))
            thumb_out = None

        progress("fini")
        return {"hook": (o.get("hook") or "").strip() or None,
                "thumbnail": thumb_out is not None, "warnings": list(WARNINGS)}


def regenerate_thumbnail(video, out_jpg, o, progress=lambda s: None):
    """Relance UNIQUEMENT la miniature (choix de frame + Nano Banana + hook)
    sur une vidéo déjà montée, sans re-rendre le .mp4 — utile pour retenter
    quand le résultat Nano Banana ne plaît pas (aléatoire d'un essai à
    l'autre) ou pour changer le hook/style sans tout relancer."""
    with LOCK:
        global WARNINGS
        WARNINGS = []
        words_cache = words_cache_path(video)
        if not os.path.exists(words_cache):
            words_cache = transcribe(video, progress)
        language = json.load(open(words_cache, encoding="utf-8")).get("language", "fr")
        words = base.load_words(words_cache)
        if not words:
            raise RuntimeError("Aucune parole détectée dans la vidéo")

        src_w, src_h, _duration = base.probe(video)
        cw = int(src_h * 9 / 16) // 2 * 2
        transcript = " ".join(w["text"] for w in words)
        thumb_hook = (o.get("hook") or "").strip()
        if not thumb_hook and transcript.strip():
            import hooks
            thumb_hook = hooks.suggest_hooks(transcript, language)[0]

        progress("miniature")
        render_thumbnail(video, out_jpg, o, src_w, src_h, cw, thumb_hook,
                         transcript, language)
        progress("fini")
        return {"hook": thumb_hook or None, "warnings": list(WARNINGS)}
