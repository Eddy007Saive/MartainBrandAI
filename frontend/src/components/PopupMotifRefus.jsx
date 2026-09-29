import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import { useTranslation } from 'react-i18next';

// Motif de refus capturé à chaque refus (mémoire d'évaluation, H2) — optionnel,
// jamais bloquant : fermer sans écrire (`onConfirm(null)`) refuse quand même le
// contenu côté appelant, simplement sans motif.
export default function PopupMotifRefus({ open, onConfirm }) {
  const { t } = useTranslation();
  const [motif, setMotif] = useState('');

  useEffect(() => { if (open) setMotif(''); }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onConfirm(null); }}>
      <DialogContent className="max-w-sm bg-[#0f172a] border border-white/10 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-sora text-base text-white">{t('contenus.motifRefus.titre')}</DialogTitle>
        </DialogHeader>
        <Textarea value={motif} onChange={(e) => setMotif(e.target.value)} placeholder={t('contenus.motifRefus.placeholder')}
          className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 font-inter" rows={3} autoFocus />
        <div className="flex justify-end mt-2">
          <Button onClick={() => onConfirm(motif.trim() || null)}
            className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white font-sora font-semibold rounded-[11px]">
            {t('contenus.motifRefus.confirmer')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
