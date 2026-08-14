# Sélection de la meilleure frame pour la miniature. Deux passes :
#  1. mécanique (rapide, locale) : présence/taille du visage (YuNet) en
#     priorité, netteté (Laplacien) en second critère -> une short-list de
#     candidats plutôt qu'un choix unique (la netteté/taille ne dit rien sur
#     l'expression : un visage net avec les yeux fermés score aussi bien
#     qu'un visage net et engageant).
#  2. visuelle (Gemini, optionnelle) : parmi cette short-list, laisse un
#     modèle qui "regarde" vraiment les images choisir la plus engageante
#     (yeux ouverts, expression, cadrage) — repli sur le n°1 mécanique si
#     l'appel échoue (réseau, quota...).
import os

import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLE_STEP = 1.0
MAX_SAMPLES = 40
SHORTLIST = 6


def _sharpness(gray):
    return cv2.Laplacian(gray, cv2.CV_64F).var()


def _shortlist_candidates(video, face_track):
    """[(score, t, frame_bgr, face_cx_norm), ...] triés du meilleur au pire."""
    cap = cv2.VideoCapture(video)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = (total / fps) if fps else 0
    interval = max(SAMPLE_STEP, duration / MAX_SAMPLES) if duration else SAMPLE_STEP
    step = max(1, int(fps * interval))
    det = (cv2.FaceDetectorYN.create(os.path.join(HERE, "yunet.onnx"), "", (w, h), 0.6)
           if face_track else None)

    scored = []
    i = 0
    while True:
        if not cap.grab():
            break
        if i % step == 0:
            ok, frame = cap.retrieve()
            if ok:
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                sharp = _sharpness(gray)
                face_area, face_cx = 0.0, 0.5
                if det is not None:
                    _, faces = det.detect(frame)
                    if faces is not None and len(faces):
                        fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])[:4]
                        face_area = (fw * fh) / (w * h)
                        face_cx = (fx + fw / 2) / w
                score = (10 if face_area > 0 else 0) + face_area * 5 + min(sharp / 500, 3)
                scored.append((score, i / fps, frame, face_cx))
        i += 1
    cap.release()
    if not scored:
        raise RuntimeError("Impossible de lire la vidéo pour la miniature")
    scored.sort(key=lambda s: s[0], reverse=True)
    return scored[:SHORTLIST]


def pick_best_frame(video, face_track=True, use_gemini=True):
    """(t, frame_bgr, face_cx_norm) — meilleure frame miniature."""
    candidates = _shortlist_candidates(video, face_track)
    if use_gemini and len(candidates) > 1:
        try:
            import gemini_pick
            jpgs = []
            for _, _, frame, _ in candidates:
                small = cv2.resize(frame, (0, 0), fx=0.5, fy=0.5)
                ok, buf = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, 80])
                jpgs.append(buf.tobytes())
            idx = gemini_pick.pick_best_thumbnail(jpgs)
            if idx is not None:
                _, t, frame, face_cx = candidates[idx]
                return t, frame, face_cx
        except Exception as e:
            msg = str(e).encode("ascii", "backslashreplace").decode("ascii")
            print(f"[miniature] gemini indisponible ({msg}) -> repli mecanique")
    _, t, frame, face_cx = candidates[0]
    return t, frame, face_cx
