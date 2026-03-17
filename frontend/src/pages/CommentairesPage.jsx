export default function CommentairesPage() {
  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-sora text-white">Commentaires</h1>
        <p className="text-slate-400 mt-1 font-inter">
          Consultez et gérez les commentaires reçus
        </p>
      </div>

      <div className="bg-slate-900/50 border border-white/5 rounded-xl p-6">
        <p className="text-slate-400 font-inter text-center py-12" data-testid="commentaires-placeholder">
          La liste des commentaires sera disponible prochainement.
        </p>
      </div>
    </div>
  );
}
