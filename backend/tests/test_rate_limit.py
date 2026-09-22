import types

from services import rate_limit


def _horloge(monkeypatch, debut=1000.0):
    t = [debut]
    monkeypatch.setattr(rate_limit, "time", types.SimpleNamespace(time=lambda: t[0]))
    return t


def test_cle_inconnue_non_verrouillee():
    assert rate_limit.locked_for("ip:1.2.3.4") == 0


def test_quatre_echecs_ne_verrouillent_pas(monkeypatch):
    _horloge(monkeypatch)
    for _ in range(4):
        rate_limit.fail("k", max_fails=5, window=900, lock=900)
    assert rate_limit.locked_for("k") == 0


def test_cinquieme_echec_verrouille(monkeypatch):
    _horloge(monkeypatch)
    for _ in range(5):
        rate_limit.fail("k", max_fails=5, window=900, lock=900)
    assert 0 < rate_limit.locked_for("k") <= 900


def test_le_verrou_expire(monkeypatch):
    t = _horloge(monkeypatch)
    for _ in range(5):
        rate_limit.fail("k", max_fails=5, window=900, lock=600)
    t[0] += 601
    assert rate_limit.locked_for("k") == 0


def test_connexion_reussie_debloque(monkeypatch):
    _horloge(monkeypatch)
    for _ in range(5):
        rate_limit.fail("k", max_fails=5, window=900, lock=900)
    rate_limit.clear("k")
    assert rate_limit.locked_for("k") == 0


def test_echecs_hors_fenetre_ne_s_additionnent_pas(monkeypatch):
    t = _horloge(monkeypatch)
    for _ in range(4):
        rate_limit.fail("k", max_fails=5, window=900, lock=900)
    t[0] += 901
    rate_limit.fail("k", max_fails=5, window=900, lock=900)
    assert rate_limit.locked_for("k") == 0


def test_les_cles_sont_independantes(monkeypatch):
    _horloge(monkeypatch)
    for _ in range(5):
        rate_limit.fail("ip+email:a", max_fails=5, window=900, lock=900)
    assert rate_limit.locked_for("ip+email:a") > 0
    assert rate_limit.locked_for("ip+email:b") == 0
