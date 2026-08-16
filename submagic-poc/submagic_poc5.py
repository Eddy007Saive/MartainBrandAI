# POC v6 : reframe vertical 9:16 centré visage TOUT LE LONG + coupes + zoom fluide + captions + RNNoise
# Usage : python submagic_poc5.py <video_in> <words.json> <video_out>
import json
import os
import re
import shutil
import statistics
import subprocess
import sys

import cv2


def _find_ffmpeg(name):
    """PATH système en priorité (Railway/Linux : ffmpeg installé via apt,
    déjà sur le PATH) ; repli sur l'emplacement du build Windows local
    (dev sur cette machine, pas ajouté au PATH lors de l'install)."""
    found = shutil.which(name)
    if found:
        return found
    win_path = os.path.expandvars(rf"%LOCALAPPDATA%\Programs\ffmpeg\bin\{name}.exe")
    if os.path.exists(win_path):
        return win_path
    return name  # dernier repli : laisse le sous-processus échouer avec un message clair


FFMPEG = _find_ffmpeg("ffmpeg")
FFPROBE = _find_ffmpeg("ffprobe")
HERE = os.path.dirname(os.path.abspath(__file__))

HALLUCINATIONS = re.compile(
    r"amara|sous-?titres?|merci d'avoir regardé|abonnez", re.IGNORECASE
)

GAP_MIN = 0.40
GAP_KEEP = 0.22
PHRASE_GAP = 0.50
ZOOM_MAX = 0.10
FPS = 30
LINE_BUDGET = 15
FACE_SAMPLE = 0.25
OUT_W, OUT_H = 720, 1280   # format reel 9:16


def probe(path):
    out = subprocess.check_output(
        [FFPROBE, "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,r_frame_rate", "-of", "csv=p=0", path],
        text=True).strip().split(",")
    dur = float(subprocess.check_output(
        [FFPROBE, "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", path], text=True))
    num, _, den = out[2].partition("/")
    fps = float(num) / float(den) if den and float(den) else float(num or FPS)
    return int(out[0]), int(out[1]), dur, fps


def load_words(path):
    words = json.load(open(path, encoding="utf-8"))["words"]
    while words and HALLUCINATIONS.search(words[-1]["text"]):
        words.pop()
    words = [w for w in words if not HALLUCINATIONS.search(w["text"])]
    merged = []
    for wd in words:
        if merged and (wd["text"].startswith("'") or merged[-1]["text"].endswith("'")):
            merged[-1]["text"] += wd["text"]
            merged[-1]["end"] = wd["end"]
        else:
            merged.append(dict(wd))
    return merged


def frame_band(frame, cw_frac):
    """Bande verticale nette (9:16 incrusté sur fond flou) -> centre x normalisé, ou None."""
    import numpy as np
    g = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    g = cv2.resize(g, (640, 360))
    lap = np.abs(cv2.Laplacian(g, cv2.CV_32F))
    cols = cv2.blur(lap.mean(axis=0).reshape(1, -1), (1, 17)).ravel()
    thr = cols.max() * 0.35
    mask = cols > thr
    best, cur_s, best_s, best_e = 0, None, 0, 0
    for i, m in enumerate(list(mask) + [False]):
        if m and cur_s is None:
            cur_s = i
        elif not m and cur_s is not None:
            if i - cur_s > best:
                best, best_s, best_e = i - cur_s, cur_s, i
            cur_s = None
    width = best / 640
    if width < 0.55 and abs(width - cw_frac) < cw_frac * 0.45:
        return ((best_s + best_e) / 2 / 640, best_s / 640, best_e / 640)
    return None


def detect_faces(video, cw_frac):
    """[(t, x_cible, cy)] : x = bande nette si présente, sinon visage (meilleur score)."""
    cap = cv2.VideoCapture(video)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    step = max(1, round(fps * FACE_SAMPLE))
    det = cv2.FaceDetectorYN.create(os.path.join(HERE, "yunet.onnx"), "", (w, h), 0.6)
    samples = []
    n_band = 0
    i = 0
    while True:
        if not cap.grab():
            break
        if i % step == 0:
            ok, frame = cap.retrieve()
            if ok:
                band = frame_band(frame, cw_frac)
                face = None
                _, faces = det.detect(frame)
                if faces is not None and len(faces):
                    # le score (f[14]) discrimine le vrai visage des copies floues d'arrière-plan
                    x, y, fw, fh = max(faces, key=lambda f: f[14])[:4]
                    face = ((x + fw / 2) / w, (y + fh / 2) / h)
                # une bande nette n'est fiable que si le visage est dedans
                # (décor texturé = faux positifs qui volent la priorité au visage)
                if band is not None and face is not None:
                    c, s, e = band
                    band = None if not (s - 0.05 <= face[0] <= e + 0.05) else band
                if band is not None:
                    n_band += 1
                    samples.append((i / fps, band[0], face[1] if face else 0.4))
                elif face:
                    samples.append((i / fps, face[0], face[1]))
        i += 1
    cap.release()
    print(f"  ({n_band} frames avec bande verticale incrustée)")
    return samples


def face_center(samples, ta, tb, default=(0.5, 0.45)):
    xs = [(x, y) for t, x, y in samples if ta - 0.2 <= t <= tb + 0.2]
    if not xs:
        return default
    return (statistics.median(p[0] for p in xs), statistics.median(p[1] for p in xs))


PAN_SMOOTH = 0.5    # fenêtre de lissage (s) de la trajectoire du visage
PAN_KEY = 0.25      # intervalle (s) entre keyframes de panning
PAN_DEADBAND = 0.02 # amplitude (fraction de largeur) sous laquelle on ne bouge pas


def pan_keyframes(samples, a, b, src_w, cw):
    """Trajectoire lissée du crop x sur [a,b] -> [(t_rel, px)] ; None si quasi statique."""
    raw = [(t, x) for t, x, _ in samples if a - 0.3 <= t <= b + 0.3]
    if len(raw) < 3:
        return None
    # médiane glissante sur 3 points (anti-détections aberrantes)…
    pts = [(raw[i][0], statistics.median(x for _, x in raw[max(0, i - 1):i + 2]))
           for i in range(len(raw))]
    # …puis moyenne glissante temporelle (fenêtre centrée : pas de retard)
    def smooth(t0):
        vals = [x for t, x in pts if abs(t - t0) <= PAN_SMOOTH / 2]
        return sum(vals) / len(vals) if vals else None
    # espacement adaptatif : max 40 keyframes par segment, sinon l'expression
    # crop devient trop longue pour le parseur ffmpeg (segments non coupés)
    step = max(PAN_KEY, (b - a) / 40)
    keys = []
    t0 = a
    while t0 <= b + 1e-6:
        v = smooth(t0)
        if v is not None:
            px = max(0.0, min(src_w - cw, float(v) * src_w - cw / 2))
            keys.append((round(t0 - a, 3), round(px, 1)))
        t0 += step
    if len(keys) < 2:
        return None
    lo = min(px for _, px in keys)
    hi = max(px for _, px in keys)
    if hi - lo < PAN_DEADBAND * src_w:
        return None  # mouvement négligeable -> crop statique
    return keys


def pan_expr(keys):
    """Expression ffmpeg x(t) : interpolation linéaire entre keyframes."""
    terms = [f"lt(t,{keys[0][0]})*{keys[0][1]}"]
    for (t1, x1), (t2, x2) in zip(keys, keys[1:]):
        seg = f"gte(t,{t1})*lt(t,{t2})*({x1}+({x2}-{x1})*(t-{t1})/({t2}-{t1}))"
        terms.append(seg)
    terms.append(f"gte(t,{keys[-1][0]})*{keys[-1][1]}")
    return "+".join(terms)


def crop_x_at(keys, static_px, t_rel):
    if not keys:
        return static_px
    if t_rel <= keys[0][0]:
        return keys[0][1]
    for (t1, x1), (t2, x2) in zip(keys, keys[1:]):
        if t1 <= t_rel < t2:
            return x1 + (x2 - x1) * (t_rel - t1) / (t2 - t1)
    return keys[-1][1]


def keep_segments(words, duration):
    segs = []
    cur = max(0.0, words[0]["start"] - 0.30)
    for a, b in zip(words, words[1:]):
        if b["start"] - a["end"] > GAP_MIN:
            segs.append((cur, a["end"] + GAP_KEEP / 2))
            cur = b["start"] - GAP_KEEP / 2
    segs.append((cur, min(duration, words[-1]["end"] + 0.6)))
    return segs


def remap_factory(segs):
    def remap(t):
        new = 0.0
        for a, b in segs:
            if t < a:
                return new
            if t <= b:
                return new + (t - a)
            new += b - a
        return new
    return remap


def phrases(words):
    out, cur = [], []
    for a, b in zip(words, words[1:] + [None]):
        cur.append(a)
        end_pause = b is not None and b["start"] - a["end"] > PHRASE_GAP
        end_punct = a["text"].rstrip().endswith((".", "!", "?"))
        if b is None or end_pause or end_punct:
            out.append((cur[0]["start"], cur[-1]["end"]))
            cur = []
    return out


def zoom_exprs(zoom_list):
    """zoom_list : [(ta, tb, cx, cy)] — cx/cy dans le repère du cadre VERTICAL."""
    zterms, xterms, yterms = [], [], []
    for ta, tb, cx, cy in zoom_list:
        d = tb - ta
        p = f"clip((it-{ta:.3f})/{d:.3f},0,1)"
        b = f"between(it,{ta:.3f},{tb:.3f})"
        zterms.append(f"{b}*{ZOOM_MAX}*{p}*(2-{p})")
        xterms.append(f"{b}*{cx - 0.5:.4f}")
        yterms.append(f"{b}*{cy - 0.5:.4f}")
    if not zterms:
        return "1", "0", "0"
    z = "1+" + "+".join(zterms)
    cx = "(0.5+" + "+".join(xterms) + ")"
    cy = "(0.5+" + "+".join(yterms) + ")"
    x = f"clip({cx}*iw-iw/(2*zoom),0,iw-iw/zoom)"
    y = f"clip({cy}*ih-ih/(2*zoom),0,ih-ih/zoom)"
    return z, x, y


def fmt_time(t):
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def build_ass(words, remap, path, w, h):
    fontsize = int(h * 0.045)
    margin_v = int(h * 0.30)
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {w}
PlayResY: {h}
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Karaoke,Arial Black,{fontsize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,1,0,1,{max(2, fontsize // 12)},{max(2, fontsize // 16)},2,40,40,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    hl = r"{\c&HA3FF3A&}"
    reset = r"{\c&HFFFFFF&}"
    pop = r"{\fscx70\fscy70\t(0,90,\fscx100\fscy100)}"
    groups, cur, size = [], [], 0
    for wd in words:
        n = len(wd["text"])
        if cur and size + 1 + n > LINE_BUDGET:
            groups.append(cur)
            cur, size = [], 0
        cur.append(wd)
        size += n + (1 if size else 0)
    if cur:
        groups.append(cur)
    lines = []
    for g in groups:
        for i, active in enumerate(g):
            start = remap(active["start"])
            end = remap(g[i + 1]["start"]) if i + 1 < len(g) else remap(active["end"])
            if end <= start:
                end = start + 0.05
            parts = [hl + w2["text"].upper() + reset if j == i else w2["text"].upper()
                     for j, w2 in enumerate(g)]
            prefix = pop if i == 0 else ""
            lines.append(
                f"Dialogue: 0,{fmt_time(start)},{fmt_time(end)},Karaoke,,0,0,0,,{prefix}{' '.join(parts)}"
            )
    with open(path, "w", encoding="utf-8-sig") as f:
        f.write(header + "\n".join(lines) + "\n")


def build_filtergraph(segs, crops, zxy, ass_path, cw, src_h, path):
    n = len(segs)
    z, x, y = zxy
    rnnn = os.path.join(HERE, "bd.rnnn").replace("\\", "/").replace(":", r"\:")
    aclean = (f"[0:a]highpass=f=80,arnndn=m='{rnnn}':mix=0.85,"
              f"loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[acl];\n")
    vsplit = f"[0:v]split={n}" + "".join(f"[s{i}]" for i in range(n)) + ";\n"
    asplit = aclean + f"[acl]asplit={n}" + "".join(f"[t{i}]" for i in range(n)) + ";\n"
    chains = []
    for i, (a, b) in enumerate(segs):
        # reframe vertical : crop 9:16 centré visage, panning lissé si le visage bouge
        xexpr = crops[i] if isinstance(crops[i], int) else f"'{crops[i]}'"
        chains.append(
            f"[s{i}]trim=start={a:.3f}:end={b:.3f},setpts=PTS-STARTPTS,"
            f"crop={cw}:{src_h}:{xexpr}:0,scale={OUT_W}:{OUT_H}:flags=lanczos[v{i}];")
        chains.append(f"[t{i}]atrim=start={a:.3f}:end={b:.3f},asetpts=PTS-STARTPTS[a{i}];")
    concat_in = "".join(f"[v{i}][a{i}]" for i in range(n))
    ass_escaped = ass_path.replace("\\", "/").replace(":", r"\:")
    zoompan = f"zoompan=z='{z}':x='{x}':y='{y}':d=1:s={OUT_W}x{OUT_H}:fps={FPS}"
    graph = (vsplit + asplit + "\n".join(chains)
             + f"\n{concat_in}concat=n={n}:v=1:a=1[vc][ac];\n"
             + f"[vc]{zoompan},ass='{ass_escaped}'[vout]")
    with open(path, "w", encoding="utf-8") as f:
        f.write(graph)


def main():
    video, words_json, out = sys.argv[1], sys.argv[2], sys.argv[3]
    base = os.path.splitext(os.path.abspath(out))[0]
    src_w, src_h, duration, _fps = probe(video)
    cw = int(src_h * 9 / 16) // 2 * 2  # largeur du crop 9:16, paire

    words = load_words(words_json)
    segs = keep_segments(words, duration)
    kept = sum(b - a for a, b in segs)
    print(f"Durée {duration:.1f}s -> {kept:.1f}s ({duration - kept:.1f}s coupées, {len(segs)} segments)")
    print(f"Reframe : {src_w}x{src_h} -> crop {cw}x{src_h} -> {OUT_W}x{OUT_H}")

    print("Détection visages + bandes nettes…")
    samples = detect_faces(video, cw / src_w)
    print(f"{len(samples)} échantillons")

    # crop par segment : panning lissé si le visage se déplace, sinon x statique
    crops, seg_keys, seg_static = [], [], []
    n_pan = 0
    for a, b in segs:
        cx, _ = face_center(samples, a, b)
        px = int(max(0, min(src_w - cw, cx * src_w - cw / 2)))
        keys = pan_keyframes(samples, a, b, src_w, cw)
        seg_keys.append(keys)
        seg_static.append(px)
        if keys:
            crops.append(pan_expr(keys))
            n_pan += 1
        else:
            crops.append(px)
    print(f"Crops : {n_pan} pannings, {len(segs) - n_pan} statiques")

    remap = remap_factory(segs)

    def seg_of(t):
        for i, (a, b) in enumerate(segs):
            if a <= t <= b:
                return i
        return 0

    zoom_list = []
    for i, (a, b) in enumerate(phrases(words)):
        if i % 2 == 1 or b - a < 0.8:
            continue
        cx, cy = face_center(samples, a, b)
        mid = (a + b) / 2
        si = seg_of(mid)
        # coordonnées visage dans le repère du cadre vertical croppé (crop x au milieu de la phrase)
        seg_x = crop_x_at(seg_keys[si], seg_static[si], mid - segs[si][0])
        cxv = (cx * src_w - seg_x) / cw
        cxv = max(0.0, min(1.0, cxv))
        zoom_list.append((remap(a), remap(b), cxv, cy))
    print(f"{len(zoom_list)} zooms visage (repère vertical)")

    ass_path = base + ".ass"
    build_ass(words, remap, ass_path, OUT_W, OUT_H)
    graph_path = base + ".filtergraph"
    build_filtergraph(segs, crops, zoom_exprs(zoom_list), ass_path, cw, src_h, graph_path)

    subprocess.run(
        [FFMPEG, "-y", "-i", video, "-/filter_complex", graph_path,
         "-map", "[vout]", "-map", "[ac]", "-c:v", "libx264", "-crf", "18",
         "-preset", "fast", "-c:a", "aac", "-b:a", "192k", out],
        check=True)
    print(f"OK : {out}")


if __name__ == "__main__":
    main()
