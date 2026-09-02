import { useState, useEffect } from 'react';
import { Loader2, Upload, Trash2, FileCode2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { adminService } from '../services/adminService';

// Gabarit de départ : collé dans la zone de texte d'un clic, il respecte déjà le contrat.
const EXEMPLE = `<style>
  /* Les couleurs de la marque arrivent en variables : le gabarit s'adapte à chaque client. */
  .slide{width:360px;height:450px;background:var(--principale);color:#fff;
    font-family:Inter,sans-serif;padding:30px;display:flex;flex-direction:column;position:relative}
  h1{font-size:34px;line-height:1.05;margin:0}
  h2{font-size:26px;line-height:1.1;margin:0}
  .num{font-size:60px;font-weight:800;color:var(--accent)}
  .bas{position:absolute;bottom:22px;left:30px;font-size:11px;opacity:.7}
</style>

<div class="slide" data-role="couverture">
  <h1>{{hook}}</h1>
  <span class="bas">{{nom}} · {{index}}/{{total}}</span>
</div>

<div class="slide" data-role="etape">
  <div class="num">{{numero}}</div>
  <h2>{{titre}}</h2>
  <p>{{texte}}</p>
  <span class="bas">{{index}}/{{total}}</span>
</div>

<div class="slide" data-role="final">
  <h2>{{cta_titre}}</h2>
  <p>{{cta_texte}}</p>
  <span class="bas">{{nom}}</span>
</div>`;

export default function CarrouselTemplateImport() {
  const [liste, setListe] = useState([]);
  const [form, setForm] = useState({ id: '', label: '', html: '' });
  const [saving, setSaving] = useState(false);
  const [aide, setAide] = useState(true);

  const charger = () => adminService.getCarrouselCustom()
    .then((d) => setListe(d?.templates || [])).catch(() => {});
  useEffect(() => { charger(); }, []);

  const importer = async () => {
    if (!form.id.trim() || !form.html.trim()) { toast.error('Identifiant et HTML requis'); return; }
    setSaving(true);
    try {
      const r = await adminService.importCarrouselCustom(form.id.trim(), form.label.trim(), form.html);
      toast.success(`Template « ${r.label} » importé ✓`);
      setForm({ id: '', label: '', html: '' });
      charger();
    } catch (e) {
      toast.error(e.message || 'Import refusé');
    } finally { setSaving(false); }
  };

  const supprimer = async (id) => {
    if (!window.confirm(`Supprimer le template « ${id} » ?`)) return;
    try { await adminService.deleteCarrouselCustom(id); toast.success('Template supprimé'); charger(); }
    catch { toast.error('Suppression impossible'); }
  };

  return (
    <div className="rounded-[14px] border border-white/[0.06] bg-[#0a1120] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileCode2 className="w-4 h-4 text-[#8A6CFF]" />
        <div className="text-[10.5px] uppercase tracking-[0.16em] text-slate-500 font-semibold">
          Importer un template de carrousel
        </div>
      </div>

      {/* Mode d'emploi : sans lui, personne ne sait quoi coller. */}
      <button type="button" onClick={() => setAide((v) => !v)}
        className="w-full flex items-center gap-2 text-left text-[12px] text-slate-400 hover:text-white">
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${aide ? 'rotate-180' : ''}`} />
        Comment écrire le gabarit
      </button>
      {aide && (
        <div className="rounded-[10px] border border-white/[0.06] bg-[#0c1322] p-3.5 space-y-3 text-[12px] text-slate-400 leading-relaxed">
          <p>
            Le HTML ne décrit que <b className="text-slate-200">trois slides</b>. Le moteur répète celle du
            milieu autant de fois que le contenu l'exige. Un carrousel peut faire 4 slides comme 8.
          </p>
          <div className="space-y-1">
            <p className="text-slate-300 font-medium">Les trois blocs obligatoires</p>
            <pre className="bg-[#070c17] rounded-lg p-2.5 text-[11px] text-slate-300 overflow-x-auto">{`<div class="slide" data-role="couverture"> … </div>
<div class="slide" data-role="etape">      … </div>   ← répété
<div class="slide" data-role="final">      … </div>`}</pre>
          </div>
          <div className="space-y-1">
            <p className="text-slate-300 font-medium">Les marqueurs remplacés au rendu</p>
            <p><code className="text-[#3AFFA3]">{'{{hook}}'}</code> sur la couverture ·
              <code className="text-[#3AFFA3]"> {'{{numero}}'} {'{{titre}}'} {'{{texte}}'} {'{{pills}}'} {'{{pro_tip}}'}</code> sur une étape ·
              <code className="text-[#3AFFA3]"> {'{{cta_titre}}'} {'{{cta_texte}}'}</code> sur la finale.
              Partout : <code className="text-[#3AFFA3]">{'{{nom}}'} {'{{secteur}}'} {'{{logo}}'} {'{{index}}'} {'{{total}}'}</code>.
              Un marqueur sans valeur disparaît proprement.</p>
          </div>
          <div className="space-y-1">
            <p className="text-slate-300 font-medium">Les couleurs du client</p>
            <p>Utilise les variables CSS <code className="text-[#3AFFA3]">var(--principale)</code>,
              <code className="text-[#3AFFA3]"> var(--secondaire)</code>, <code className="text-[#3AFFA3]">var(--accent)</code>,
              <code className="text-[#3AFFA3]"> var(--encre)</code>, <code className="text-[#3AFFA3]">var(--sourdine)</code> :
              le même gabarit prend l'identité de chaque marque à qui tu l'attribues.</p>
          </div>
          <div className="space-y-1">
            <p className="text-slate-300 font-medium">Contraintes</p>
            <p>Format d'une slide : <b className="text-slate-200">360 × 450 px</b> (rendu en 1080 × 1350).
              Les scripts, iframes et gestionnaires d'évènements sont retirés à l'import : le rendu
              s'exécute sur nos serveurs. Prévois des titres qui tiennent : un texte trop long débordera.</p>
          </div>
          <button type="button" onClick={() => setForm((f) => ({ ...f, html: EXEMPLE }))}
            className="text-[12px] text-[#3AFFA3] hover:underline">
            Charger un gabarit de départ →
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <Input value={form.id} onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
          placeholder="Identifiant (ex. atelier-bois)" data-testid="tplc-id"
          className="bg-[#0c1322] border-white/[0.06] text-slate-200 text-sm h-9 rounded-[9px] sm:w-56" />
        <Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          placeholder="Nom affiché (ex. Atelier Bois)" data-testid="tplc-label"
          className="bg-[#0c1322] border-white/[0.06] text-slate-200 text-sm h-9 rounded-[9px] flex-1" />
      </div>
      <textarea value={form.html} onChange={(e) => setForm((f) => ({ ...f, html: e.target.value }))}
        rows={10} placeholder="Colle ici le HTML du gabarit…" data-testid="tplc-html"
        className="w-full rounded-[10px] bg-[#0c1322] border border-white/[0.06] text-slate-200 text-[12px]
          font-mono p-3 outline-none focus:border-[#5B6CFF]/50 resize-y" />
      <Button size="sm" onClick={importer} disabled={saving} data-testid="tplc-import"
        className="h-9 bg-[#5B6CFF]/15 text-[#b9a6ff] hover:bg-[#5B6CFF]/25 border border-[#8A6CFF]/30 rounded-[9px] transition-all active:scale-[0.97]">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
        Importer et générer la vignette
      </Button>

      {liste.length > 0 && (
        <div className="pt-2 border-t border-white/[0.06] space-y-2">
          <div className="text-[11px] text-slate-500">Templates importés · attribuables depuis la fiche d'un client</div>
          <div className="flex flex-wrap gap-2.5">
            {liste.map((t) => (
              <div key={t.id} className="rounded-[10px] border border-white/[0.07] bg-[#0c1322] p-2 w-[116px]">
                {t.preview_url
                  ? <img src={t.preview_url} alt="" className="w-full rounded-md" />
                  : <div className="w-full h-[130px] rounded-md bg-white/[0.03] grid place-items-center text-[10px] text-slate-600">sans vignette</div>}
                <div className="mt-1.5 flex items-center justify-between gap-1">
                  <span className="text-[11px] text-slate-300 truncate">{t.label}</span>
                  <button onClick={() => supprimer(t.id)} title="Supprimer" className="text-slate-600 hover:text-red-400 shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="text-[9.5px] text-slate-600 truncate">{t.id}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
