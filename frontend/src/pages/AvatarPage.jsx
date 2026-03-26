import { useState, useEffect, useRef } from 'react';
import { Upload, Video, CheckCircle, XCircle, Loader2, RefreshCw, Trash2, AlertCircle, Info } from 'lucide-react';
import { heygenService } from '../services/heygenService';
import { toast } from 'sonner';

const STATUS_CONFIG = {
  in_progress: { label: 'En cours de création', color: 'text-yellow-400', bg: 'bg-yellow-400/10', icon: Loader2 },
  complete: { label: 'Avatar prêt', color: 'text-emerald-400', bg: 'bg-emerald-400/10', icon: CheckCircle },
  failed: { label: 'Échec', color: 'text-red-400', bg: 'bg-red-400/10', icon: XCircle },
};

function FileDropZone({ label, description, accept, file, onFileChange, id }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type.startsWith('video/')) {
      onFileChange(dropped);
    } else {
      toast.error('Veuillez déposer un fichier vidéo');
    }
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`
        relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200
        ${dragOver
          ? 'border-[#5B6CFF] bg-[#5B6CFF]/10'
          : file
            ? 'border-emerald-500/50 bg-emerald-500/5'
            : 'border-white/10 bg-slate-900/50 hover:border-white/20 hover:bg-slate-900/80'
        }
      `}
      data-testid={`dropzone-${id}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          if (e.target.files[0]) onFileChange(e.target.files[0]);
        }}
        data-testid={`input-${id}`}
      />

      {file ? (
        <div className="space-y-2">
          <CheckCircle className="w-10 h-10 mx-auto text-emerald-400" />
          <p className="text-white font-medium font-inter truncate max-w-xs mx-auto">{file.name}</p>
          <p className="text-slate-400 text-sm font-inter">
            {(file.size / (1024 * 1024)).toFixed(1)} MB
          </p>
          <p className="text-[#5B6CFF] text-xs font-inter">Cliquer pour changer</p>
        </div>
      ) : (
        <div className="space-y-3">
          <Upload className="w-10 h-10 mx-auto text-slate-400" />
          <div>
            <p className="text-white font-medium font-inter">{label}</p>
            <p className="text-slate-400 text-sm mt-1 font-inter">{description}</p>
          </div>
          <p className="text-slate-500 text-xs font-inter">
            Glisser-déposer ou cliquer pour sélectionner
          </p>
        </div>
      )}
    </div>
  );
}

export default function AvatarPage() {
  const [avatar, setAvatar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [trainingVideo, setTrainingVideo] = useState(null);
  const [consentVideo, setConsentVideo] = useState(null);

  useEffect(() => {
    fetchAvatar();
  }, []);

  // Auto-refresh status every 30s if in_progress
  useEffect(() => {
    if (avatar?.status !== 'in_progress') return;
    const interval = setInterval(() => {
      handleRefreshStatus(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [avatar?.status]);

  const fetchAvatar = async () => {
    try {
      const data = await heygenService.getAvatar();
      setAvatar(data.avatar);
    } catch (error) {
      console.error('Erreur chargement avatar:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();

    if (!trainingVideo || !consentVideo) {
      toast.error('Veuillez ajouter les deux vidéos');
      return;
    }

    setCreating(true);
    try {
      const formData = new FormData();
      formData.append('training_video', trainingVideo);
      formData.append('consent_video', consentVideo);

      const result = await heygenService.createAvatar(formData);
      toast.success('Avatar en cours de création !');

      // Reset form and reload
      setTrainingVideo(null);
      setConsentVideo(null);
      await fetchAvatar();
    } catch (error) {
      const msg = error.response?.data?.detail || "Erreur lors de la création de l'avatar";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleRefreshStatus = async (silent = false) => {
    setRefreshing(true);
    try {
      const data = await heygenService.refreshStatus();
      setAvatar(data.avatar);
      if (!silent && data.avatar?.status === 'complete') {
        toast.success('Avatar prêt !');
      }
    } catch (error) {
      if (!silent) toast.error('Erreur lors du rafraîchissement');
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Supprimer cet avatar ? Cette action est irréversible.')) return;
    setDeleting(true);
    try {
      await heygenService.deleteAvatar();
      setAvatar(null);
      toast.success('Avatar supprimé');
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[#5B6CFF]" />
      </div>
    );
  }

  const statusConfig = avatar ? STATUS_CONFIG[avatar.status] || STATUS_CONFIG.in_progress : null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold font-sora text-white">Avatar HeyGen</h1>
        <p className="text-slate-400 mt-2 font-inter">
          Créez votre avatar digital pour générer des vidéos personnalisées
        </p>
      </div>

      {/* Existing avatar */}
      {avatar && (
        <div className="rounded-xl border border-white/10 bg-slate-900/50 backdrop-blur-sm overflow-hidden">
          {/* Status bar */}
          <div className={`flex items-center gap-3 px-6 py-4 ${statusConfig.bg}`}>
            <statusConfig.icon className={`w-5 h-5 ${statusConfig.color} ${avatar.status === 'in_progress' ? 'animate-spin' : ''}`} />
            <span className={`font-medium font-inter ${statusConfig.color}`}>
              {statusConfig.label}
            </span>
            {avatar.avatar_name && (
              <span className="text-slate-400 font-inter">— {avatar.avatar_name}</span>
            )}
          </div>

          <div className="p-6 space-y-6">
            {/* Preview */}
            {avatar.status === 'complete' && (avatar.preview_video_url || avatar.preview_image_url) && (
              <div className="grid md:grid-cols-2 gap-6">
                {avatar.preview_video_url && (
                  <div>
                    <p className="text-sm text-slate-400 mb-2 font-inter">Aperçu vidéo</p>
                    <video
                      src={avatar.preview_video_url}
                      controls
                      className="w-full rounded-lg border border-white/10"
                      data-testid="avatar-preview-video"
                    />
                  </div>
                )}
                {avatar.preview_image_url && (
                  <div>
                    <p className="text-sm text-slate-400 mb-2 font-inter">Aperçu image</p>
                    <img
                      src={avatar.preview_image_url}
                      alt="Avatar preview"
                      className="w-full rounded-lg border border-white/10 object-cover"
                      data-testid="avatar-preview-image"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Error message */}
            {avatar.status === 'failed' && avatar.error_message && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-red-300 text-sm font-inter">{avatar.error_message}</p>
              </div>
            )}

            {/* Info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-500 font-inter">ID Avatar</p>
                <p className="text-slate-300 font-mono text-xs mt-1">{avatar.avatar_id}</p>
              </div>
              {avatar.created_at && (
                <div>
                  <p className="text-slate-500 font-inter">Créé le</p>
                  <p className="text-slate-300 font-inter mt-1">
                    {new Date(avatar.created_at).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              {avatar.status === 'in_progress' && (
                <button
                  onClick={() => handleRefreshStatus(false)}
                  disabled={refreshing}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#5B6CFF]/20 text-[#5B6CFF] hover:bg-[#5B6CFF]/30 transition-colors font-inter text-sm disabled:opacity-50"
                  data-testid="refresh-status-btn"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                  Rafraîchir le statut
                </button>
              )}
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors font-inter text-sm disabled:opacity-50"
                data-testid="delete-avatar-btn"
              >
                <Trash2 className="w-4 h-4" />
                {deleting ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create form — show if no avatar or if failed */}
      {(!avatar || avatar.status === 'failed') && (
        <form onSubmit={handleCreate} className="space-y-6">
          <div className="rounded-xl border border-white/10 bg-slate-900/50 backdrop-blur-sm p-6 space-y-6">
            <h2 className="text-xl font-semibold font-sora text-white">Créer un nouvel avatar</h2>

            {/* Instructions */}
            <div className="flex items-start gap-3 p-4 rounded-lg bg-[#5B6CFF]/5 border border-[#5B6CFF]/20">
              <Info className="w-5 h-5 text-[#5B6CFF] mt-0.5 flex-shrink-0" />
              <div className="text-sm text-slate-300 font-inter space-y-1">
                <p className="font-medium text-white">Instructions pour la vidéo d'entraînement :</p>
                <ul className="list-disc list-inside space-y-1 text-slate-400">
                  <li>Minimum 2 minutes de vidéo</li>
                  <li>Résolution minimum 720p</li>
                  <li>Regardez la caméra, parlez clairement</li>
                  <li>Fond neutre, bon éclairage</li>
                  <li>Format MP4 recommandé</li>
                </ul>
                <p className="font-medium text-white mt-3">Vidéo de consentement :</p>
                <ul className="list-disc list-inside space-y-1 text-slate-400">
                  <li>Dites clairement : "J'autorise la création de mon avatar digital"</li>
                  <li>Votre visage doit être visible</li>
                </ul>
              </div>
            </div>

            {/* Video uploads */}
            <div className="grid md:grid-cols-2 gap-6">
              <FileDropZone
                id="training"
                label="Vidéo d'entraînement"
                description="Min. 2 min, 720p+, format MP4"
                accept="video/*"
                file={trainingVideo}
                onFileChange={setTrainingVideo}
              />
              <FileDropZone
                id="consent"
                label="Vidéo de consentement"
                description="Déclaration de consentement face caméra"
                accept="video/*"
                file={consentVideo}
                onFileChange={setConsentVideo}
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={creating || !trainingVideo || !consentVideo}
              className="w-full py-3 px-6 rounded-lg font-medium font-inter text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] hover:shadow-lg hover:shadow-[#5B6CFF]/25"
              data-testid="create-avatar-btn"
            >
              {creating ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Upload et création en cours...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Video className="w-5 h-5" />
                  Créer mon avatar
                </span>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Already has an in_progress or complete avatar */}
      {avatar && avatar.status === 'in_progress' && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
          <Info className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-slate-300 font-inter">
            Votre avatar est en cours de création par HeyGen. Ce processus peut prendre plusieurs heures.
            Le statut sera mis à jour automatiquement toutes les 30 secondes.
          </p>
        </div>
      )}
    </div>
  );
}
