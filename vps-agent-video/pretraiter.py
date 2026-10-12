"""
Prétraitement façon Postorico, avant l'agent du VPS : coupe des silences + transcription recalée.

  python pretraiter.py <video.mp4> <transcription.words.json> <dossier_sortie>

Entrée : la transcription mot à mot du POC Submagic ({"language", "words": [{text, start, end}]}).
Sortie : <nom>_coupe.mp4 (silences coupés, pas de sous-titres incrustés)
         <nom>_coupe.transcription.json (mêmes mots, horodatés sur la vidéo coupée)
Mêmes seuils que le POC (submagic_poc2.keep_segments).
"""
import json
import os
import subprocess
import sys

GAP_MIN = 0.40   # pause à partir de laquelle on coupe
GAP_KEEP = 0.22  # respiration conservée à chaque coupe


def duree(video):
    return float(subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video], text=True))


def segments_gardes(words, total):
    segs = []
    cur = max(0.0, words[0]["start"] - 0.30)
    for a, b in zip(words, words[1:]):
        if b["start"] - a["end"] > GAP_MIN:
            segs.append((cur, a["end"] + GAP_KEEP / 2))
            cur = b["start"] - GAP_KEEP / 2
    segs.append((cur, min(total, words[-1]["end"] + 0.6)))
    return segs


def recaler(t, segs):
    # temps d'origine -> temps après coupes
    nouveau = 0.0
    for a, b in segs:
        if t < a:
            return nouveau
        if t <= b:
            return nouveau + (t - a)
        nouveau += b - a
    return nouveau


def main(video, transcription, sortie):
    os.makedirs(sortie, exist_ok=True)
    d = json.load(open(transcription, encoding="utf-8"))
    words = d["words"]
    total = duree(video)
    segs = segments_gardes(words, total)

    nom = os.path.splitext(os.path.basename(video))[0]
    mp4 = os.path.join(sortie, f"{nom}_coupe.mp4")
    parts = "".join(
        f"[0:v]trim={a:.3f}:{b:.3f},setpts=PTS-STARTPTS[v{i}];[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS[a{i}];"
        for i, (a, b) in enumerate(segs))
    concat = "".join(f"[v{i}][a{i}]" for i in range(len(segs))) + f"concat=n={len(segs)}:v=1:a=1[v][a]"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", video, "-filter_complex", parts + concat,
                    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "17", "-preset", "medium",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", mp4], check=True)

    mots = [{"text": w["text"], "start": round(recaler(w["start"], segs), 3), "end": round(recaler(w["end"], segs), 3)}
            for w in words]
    sortie_json = os.path.join(sortie, f"{nom}_coupe.transcription.json")
    json.dump({"language": d.get("language", "fr"), "coupe": True, "words": mots},
              open(sortie_json, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    gardee = sum(b - a for a, b in segs)
    print(f"{len(segs)} segments, {total:.1f} s -> {gardee:.1f} s ({total - gardee:.1f} s de silences coupés)")
    print(mp4)
    print(sortie_json)


if __name__ == "__main__":
    main(*sys.argv[1:4])
