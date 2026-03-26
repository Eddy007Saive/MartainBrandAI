import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Link, Key, Palette, Save, Loader2, Trash2, AlertTriangle, Info,
  Plug, Check, ExternalLink, Unplug, Calendar, Clock, Video, Upload,
  CheckCircle, XCircle, AlertCircle, ChevronRight,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '../components/ui/alert-dialog';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { Field } from '../components/Field';
import { ColorField } from '../components/ColorField';
import { userService } from '../services/userService';
import { scheduleService } from '../services/scheduleService';
import { heygenService } from '../services/heygenService';
import { removeToken } from '../lib/auth';
import { useUser } from '../context/UserContext';
import { SOCIAL_PLATFORMS } from '../constants/platforms';
import { FREQUENCIES, DAYS, DEFAULT_SCHEDULE } from '../constants/schedules';

const REQUIRED_FIELDS = {
  identity: ['nom', 'username', 'user_name', 'photo_url', 'sexe', 'style_vestimentaire'],
  gpt_urls: ['gpt_url_linkedin', 'gpt_url_instagram', 'gpt_url_sujets', 'gpt_url_default'],
  api_keys: ['api_key_gemini'],
  style: ['couleur_principale', 'couleur_secondaire', 'couleur_accent'],
};

const SETTINGS_SECTIONS = [
  { id: 'identity', title: 'Identité', icon: User },
  { id: 'connections', title: 'Réseaux sociaux', icon: Plug },
  { id: 'schedules', title: 'Planification', icon: Calendar },
  { id: 'gpt_urls', title: 'URLs GPT', icon: Link },
  { id: 'api_keys', title: 'Clés API', icon: Key },
  { id: 'style', title: 'Style & Couleurs', icon: Palette },
  { id: 'avatar', title: 'Avatar HeyGen', icon: Video },
];

const AVATAR_STATUS = {
  pending: { label: 'En attente de traitement', color: 'text-amber-400', bg: 'bg-amber-400/10', icon: Clock },
  in_progress: { label: 'En cours de création', color: 'text-yellow-400', bg: 'bg-yellow-400/10', icon: Loader2 },
  complete: { label: 'Prêt', color: 'text-emerald-400', bg: 'bg-emerald-400/10', icon: CheckCircle },
  failed: { label: 'Échec', color: 'text-red-400', bg: 'bg-red-400/10', icon: XCircle },
};

// --- FileDropZone ---
function FileDropZone({ label, description, accept, file, onFileChange, id }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type.startsWith('video/')) onFileChange(dropped);
    else toast.error('Veuillez déposer un fichier vidéo');
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`relative cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all duration-200
        ${dragOver ? 'border-[#5B6CFF] bg-[#5B6CFF]/10'
          : file ? 'border-emerald-500/50 bg-emerald-500/5'
          : 'border-white/10 bg-slate-900/50 hover:border-white/20 hover:bg-slate-900/80'}`}
      data-testid={`dropzone-${id}`}
    >
      <input ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={(e) => { if (e.target.files[0]) onFileChange(e.target.files[0]); }}
        data-testid={`input-${id}`} />
      {file ? (
        <div className="space-y-1.5">
          <CheckCircle className="w-8 h-8 mx-auto text-emerald-400" />
          <p className="text-white font-medium font-inter truncate max-w-xs mx-auto text-sm">{file.name}</p>
          <p className="text-slate-400 text-xs font-inter">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
          <p className="text-[#5B6CFF] text-xs font-inter">Cliquer pour changer</p>
        </div>
      ) : (
        <div className="space-y-2">
          <Upload className="w-8 h-8 mx-auto text-slate-400" />
          <p className="text-white font-medium font-inter text-sm">{label}</p>
          <p className="text-slate-400 text-xs font-inter">{description}</p>
        </div>
      )}
    </div>
  );
}

export default function ParametresPage() {
  const navigate = useNavigate();
  const { user, setUser, refetchUser } = useUser();
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('identity');
  const [connecting, setConnecting] = useState(null);

  // Schedules
  const connectedPlatforms = SOCIAL_PLATFORMS.filter(p => user?.[p.field]);
  const [schedules, setSchedules] = useState([]);
  const [schedulesLoaded, setSchedulesLoaded] = useState(false);
  const [savingSchedules, setSavingSchedules] = useState(false);

  // Avatar
  const [avatar, setAvatar] = useState(null);
  const [avatarLoading, setAvatarLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [trainingVideo, setTrainingVideo] = useState(null);
  const [avatarDescription, setAvatarDescription] = useState('');

  // --- Schedules ---
  const fetchSchedules = useCallback(async () => {
    try {
      const data = await scheduleService.getAll();
      const map = {};
      for (const s of data) map[s.platform] = s;
      const connected = SOCIAL_PLATFORMS.filter(p => user?.[p.field]);
      setSchedules(connected.map(p => map[p.id] || { platform: p.id, ...DEFAULT_SCHEDULE }));
      setSchedulesLoaded(true);
    } catch (error) {
      console.error('Error fetching schedules:', error);
      setSchedulesLoaded(true);
    }
  }, [user]);

  useEffect(() => {
    if (activeSection === 'schedules' && !schedulesLoaded) fetchSchedules();
  }, [activeSection, schedulesLoaded, fetchSchedules]);

  const handleScheduleChange = (platform, field, value) => {
    setSchedules(prev => prev.map(s => s.platform === platform ? { ...s, [field]: value } : s));
  };

  const handleToggleDay = (platform, day) => {
    setSchedules(prev => prev.map(s => {
      if (s.platform !== platform) return s;
      const days = s.days_of_week || [];
      return { ...s, days_of_week: days.includes(day) ? days.filter(d => d !== day) : [...days, day] };
    }));
  };

  const handleSaveSchedules = async () => {
    setSavingSchedules(true);
    try {
      const data = await scheduleService.save(schedules);
      const map = {};
      for (const s of data) map[s.platform] = s;
      const connected = SOCIAL_PLATFORMS.filter(p => user?.[p.field]);
      setSchedules(connected.map(p => map[p.id] || { platform: p.id, ...DEFAULT_SCHEDULE }));
      toast.success('Planification sauvegardée');
    } catch (error) {
      toast.error('Erreur lors de la sauvegarde de la planification');
    } finally {
      setSavingSchedules(false);
    }
  };

  // --- Avatar ---
  const fetchAvatar = async () => {
    try {
      const data = await heygenService.getAvatar();
      setAvatar(data.avatar);
    } catch (error) {
      console.error('Erreur chargement avatar:', error);
    } finally {
      setAvatarLoading(false);
    }
  };

  useEffect(() => { fetchAvatar(); }, []);

  const handleCreateAvatar = async (e) => {
    e.preventDefault();
    if (!trainingVideo) { toast.error('Veuillez ajouter la vidéo d\'entraînement'); return; }
    setCreating(true);
    try {
      const formData = new FormData();
      formData.append('training_video', trainingVideo);
      formData.append('description', avatarDescription);
      await heygenService.createAvatar(formData);
      toast.success('Demande d\'avatar soumise ! L\'admin va la traiter.');
      setTrainingVideo(null);
      setAvatarDescription('');
      await fetchAvatar();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de la soumission");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteAvatar = async () => {
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

  // --- Profile ---
  const handleChange = (name, value) => setUser(prev => ({ ...prev, [name]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await userService.updateMe(user);
      setUser(data);
      toast.success('Profil mis à jour avec succès');
    } catch (error) {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await userService.deleteMe();
      removeToken();
      toast.success('Compte supprimé avec succès');
      navigate('/');
    } catch (error) {
      toast.error('Erreur lors de la suppression du compte');
    }
  };

  const openOAuthPopup = (url, platformName) => {
    const width = 600, height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(url, `${platformName}_oauth`,
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes`);
    if (popup) {
      const timer = setInterval(() => { if (popup.closed) { clearInterval(timer); refetchUser(); } }, 500);
    }
  };

  const handleConnect = async (platform) => {
    setConnecting(platform);
    try {
      const data = await userService.connectPlatform(platform);
      if (data.success && data.authUrl) openOAuthPopup(data.authUrl, platform);
      else toast.error(data.error || 'Erreur lors de la connexion', { duration: 6000 });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Impossible de contacter le serveur', { duration: 6000 });
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (platform) => {
    try {
      const data = await userService.disconnectPlatform(platform);
      if (data.success) {
        const field = SOCIAL_PLATFORMS.find(p => p.id === platform)?.field;
        if (field) setUser(prev => ({ ...prev, [field]: null }));
        toast.success(`${platform.charAt(0).toUpperCase() + platform.slice(1)} déconnecté`);
      } else {
        toast.error(data.error || 'Erreur lors de la déconnexion', { duration: 6000 });
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erreur lors de la déconnexion', { duration: 6000 });
    }
  };

  const incompleteSections = useMemo(() => {
    if (!user) return [];
    return Object.entries(REQUIRED_FIELDS)
      .filter(([, fields]) => fields.some(f => !user[f]))
      .map(([section]) => section);
  }, [user]);

  const isProfileComplete = incompleteSections.length === 0;
  const avatarStatusConfig = avatar ? AVATAR_STATUS[avatar.status] || AVATAR_STATUS.in_progress : null;

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#5B6CFF]" />
        <p className="text-sm text-slate-400 font-inter">Chargement...</p>
      </div>
    );
  }

  // --- Section renderers ---
  const renderIdentity = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="Nom" name="nom" value={user?.nom} onChange={handleChange}
          hint="Votre nom complet tel qu'il apparaîtra dans vos contenus générés." />
        <Field label="Username" name="username" value={user?.username} onChange={handleChange}
          hint="Votre identifiant unique (sans espaces, ex: martin_dupont)." />
        <Field label="Email" name="email" value={user?.email} onChange={handleChange} readOnly />
        <Field label="Nom affiché" name="user_name" value={user?.user_name} onChange={handleChange}
          hint="Le nom public affiché dans vos posts." />
        <Field label="URL Photo" name="photo_url" value={user?.photo_url} onChange={handleChange}
          hint={"Comment obtenir l'URL depuis Google Drive :\n1. Uploadez votre photo sur Google Drive\n2. Clic droit → « Partager »\n3. Accès « Tout le monde avec le lien »\n4. Copiez l'ID et collez le lien ici."} />
        <div className="space-y-2">
          <Label className="text-sm font-medium text-slate-300 font-inter">Sexe</Label>
          <Select value={user?.sexe || ''} onValueChange={(v) => handleChange('sexe', v)}>
            <SelectTrigger data-testid="field-sexe" className="bg-slate-950/50 border-slate-800 focus:border-[#5B6CFF] text-slate-200">
              <SelectValue placeholder="Sélectionner" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800">
              <SelectItem value="homme" className="text-slate-200 focus:bg-slate-800">Homme</SelectItem>
              <SelectItem value="femme" className="text-slate-200 focus:bg-slate-800">Femme</SelectItem>
              <SelectItem value="autre" className="text-slate-200 focus:bg-slate-800">Autre</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Field label="Style vestimentaire" name="style_vestimentaire" value={user?.style_vestimentaire} onChange={handleChange}
          hint="Ex: Casual, Business, Sportif, Élégant, Streetwear…" />
        <div className="flex items-center justify-between p-4 bg-slate-950/30 rounded-lg border border-slate-800">
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium text-slate-300 font-inter">Utiliser la photo</Label>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300 cursor-help transition-colors" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs bg-slate-800 border border-slate-700 text-slate-200 text-xs leading-relaxed" side="top">
                  Votre photo sera intégrée dans les contenus générés.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Switch checked={user?.use_photo || false} onCheckedChange={(c) => handleChange('use_photo', c)} data-testid="toggle-use-photo" />
        </div>
      </div>
    </div>
  );

  const renderConnections = () => (
    <div className="space-y-4">
      <p className="text-sm text-slate-400 font-inter">Connectez vos réseaux sociaux via Late pour publier automatiquement.</p>
      <div className="grid grid-cols-1 gap-3">
        {SOCIAL_PLATFORMS.map((platform) => {
          const isConnected = !!user?.[platform.field];
          const isLoading = connecting === platform.id;
          return (
            <div key={platform.id} data-testid={`connect-card-${platform.id}`}
              className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50 p-4 transition-all duration-300 hover:border-slate-700">
              <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${platform.color}`} />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <platform.icon className="w-6 h-6 text-white" />
                  <div>
                    <h3 className="text-white font-semibold font-sora text-sm">{platform.name}</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {isConnected ? (
                        <><Check className="w-3 h-3 text-emerald-400" /><span className="text-xs text-emerald-400 font-inter">Connecté</span></>
                      ) : (
                        <span className="text-xs text-slate-500 font-inter">Non connecté</span>
                      )}
                    </div>
                    {isConnected && <p className="text-xs text-slate-500 font-inter mt-0.5 truncate max-w-[200px]">{user[platform.field]}</p>}
                  </div>
                </div>
                {isConnected ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" data-testid={`disconnect-${platform.id}`} className="text-slate-400 hover:text-red-400 hover:bg-red-500/10 font-inter text-xs">
                        <Unplug className="w-3.5 h-3.5 mr-1" />Déconnecter
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-slate-900 border-slate-800">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-white font-sora">Déconnecter {platform.name}</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400 font-inter">Vous pourrez le reconnecter à tout moment.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 font-inter">Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDisconnect(platform.id)} data-testid={`confirm-disconnect-${platform.id}`} className="bg-red-600 hover:bg-red-700 text-white font-inter">Déconnecter</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <Button size="sm" disabled={isLoading} onClick={() => handleConnect(platform.id)} data-testid={`connect-${platform.id}`}
                    className={`bg-gradient-to-r ${platform.color} hover:opacity-90 text-white font-inter text-xs`}>
                    {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <ExternalLink className="w-3.5 h-3.5 mr-1" />}
                    Connecter
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderSchedules = () => (
    <div className="space-y-4">
      <p className="text-sm text-slate-400 font-inter">Fréquence et jours de publication par réseau.</p>
      {connectedPlatforms.length === 0 && (
        <p className="text-center py-8 text-slate-500 font-inter text-sm">
          Aucun réseau connecté. Allez dans <button onClick={() => setActiveSection('connections')} className="text-[#5B6CFF] hover:underline">Réseaux sociaux</button> pour lier vos comptes.
        </p>
      )}
      {!schedulesLoaded && connectedPlatforms.length > 0 && (
        <div className="flex items-center justify-center py-8 gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[#5B6CFF]" />
          <p className="text-sm text-slate-400 font-inter">Chargement...</p>
        </div>
      )}
      {schedulesLoaded && (
        <div className="space-y-3">
          {schedules.map((schedule) => {
            const pi = SOCIAL_PLATFORMS.find(p => p.id === schedule.platform);
            if (!pi) return null;
            const showDays = schedule.frequency === 'custom' || schedule.frequency === '3_per_week';
            return (
              <div key={schedule.platform} data-testid={`schedule-card-${schedule.platform}`}
                className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${pi.color}`} />
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <pi.icon className="w-5 h-5 text-white" />
                    <h3 className="text-white font-semibold font-sora text-sm">{pi.name}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-slate-400 font-inter">Actif</Label>
                    <Switch checked={schedule.is_active}
                      onCheckedChange={(c) => handleScheduleChange(schedule.platform, 'is_active', c)}
                      data-testid={`schedule-toggle-${schedule.platform}`} />
                  </div>
                </div>
                {schedule.is_active && (
                  <div className="space-y-3 pt-3 border-t border-slate-800">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-slate-400 font-inter">Fréquence</Label>
                        <Select value={schedule.frequency} onValueChange={(v) => handleScheduleChange(schedule.platform, 'frequency', v)}>
                          <SelectTrigger data-testid={`schedule-freq-${schedule.platform}`} className="bg-slate-950/50 border-slate-800 focus:border-[#5B6CFF] text-slate-200 text-xs h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-900 border-slate-800">
                            {FREQUENCIES.map(f => <SelectItem key={f.value} value={f.value} className="text-slate-200 focus:bg-slate-800 text-xs">{f.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-slate-400 font-inter flex items-center gap-1"><Clock className="w-3 h-3" /> Heure</Label>
                        <input type="time" value={schedule.preferred_time || '09:00'}
                          onChange={(e) => handleScheduleChange(schedule.platform, 'preferred_time', e.target.value)}
                          data-testid={`schedule-time-${schedule.platform}`}
                          className="w-full rounded-md bg-slate-950/50 border border-slate-800 focus:border-[#5B6CFF] text-slate-200 text-xs px-3 py-1.5 h-8 outline-none" />
                      </div>
                    </div>
                    {showDays && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-slate-400 font-inter">Jours</Label>
                        <div className="flex gap-1.5">
                          {DAYS.map(day => {
                            const sel = (schedule.days_of_week || []).includes(day.value);
                            return (
                              <button key={day.value} type="button" onClick={() => handleToggleDay(schedule.platform, day.value)}
                                data-testid={`schedule-day-${schedule.platform}-${day.value}`}
                                className={`px-2.5 py-1 rounded-md text-xs font-inter font-medium transition-all ${
                                  sel ? 'bg-[#5B6CFF]/20 text-white border border-[#5B6CFF]/50'
                                    : 'bg-slate-950/50 text-slate-500 border border-slate-800 hover:border-slate-600'}`}>
                                {day.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {schedulesLoaded && connectedPlatforms.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={handleSaveSchedules} disabled={savingSchedules} data-testid="save-schedules-btn"
            className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] hover:opacity-90 font-inter text-xs">
            {savingSchedules ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
            Sauvegarder
          </Button>
        </div>
      )}
    </div>
  );

  const renderGptUrls = () => (
    <div className="grid grid-cols-1 gap-5">
      <Field label="GPT URL LinkedIn" name="gpt_url_linkedin" value={user?.gpt_url_linkedin} onChange={handleChange}
        hint="L'URL de votre GPT pour LinkedIn. Format : https://chat.openai.com/g/g-XXXXXXX" />
      <Field label="GPT URL Instagram" name="gpt_url_instagram" value={user?.gpt_url_instagram} onChange={handleChange}
        hint="L'URL de votre GPT pour Instagram." />
      <Field label="GPT URL Sujets" name="gpt_url_sujets" value={user?.gpt_url_sujets} onChange={handleChange}
        hint="L'URL du GPT pour générer des idées de sujets." />
      <Field label="GPT URL Default" name="gpt_url_default" value={user?.gpt_url_default} onChange={handleChange}
        hint="L'URL du GPT par défaut." />
    </div>
  );

  const renderApiKeys = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-5">
        <Field label="OpenRouter API Key" name="api_key_gemini" value={user?.api_key_gemini} onChange={handleChange} type="password" hasValue={!!user?.api_key_gemini}
          hint={"Comment obtenir votre clé :\n1. Allez sur openrouter.ai\n2. Créez un compte\n3. Keys → Create Key\n4. Collez-la ici."} />
      </div>
      <p className="text-xs text-slate-500 font-inter">La clé API est stockée de manière sécurisée.</p>
    </div>
  );

  const renderStyle = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <ColorField label="Couleur Principale" name="couleur_principale" value={user?.couleur_principale} onChange={handleChange} />
        <ColorField label="Couleur Secondaire" name="couleur_secondaire" value={user?.couleur_secondaire} onChange={handleChange} />
        <ColorField label="Couleur Accent" name="couleur_accent" value={user?.couleur_accent} onChange={handleChange} />
      </div>
      <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/50">
        <h3 className="text-xs font-medium text-slate-400 mb-3 font-inter">Aperçu</h3>
        <div className="flex gap-3 items-center">
          <div className="w-16 h-16 rounded-xl shadow-lg transition-all" style={{ backgroundColor: user?.couleur_principale || '#003D2E' }} data-testid="preview-principale" />
          <div className="w-16 h-16 rounded-xl shadow-lg transition-all" style={{ backgroundColor: user?.couleur_secondaire || '#0077FF' }} data-testid="preview-secondaire" />
          <div className="w-16 h-16 rounded-xl shadow-lg transition-all" style={{ backgroundColor: user?.couleur_accent || '#3AFFA3' }} data-testid="preview-accent" />
        </div>
        <div className="mt-3 p-3 rounded-lg" style={{ background: `linear-gradient(135deg, ${user?.couleur_principale || '#003D2E'}, ${user?.couleur_secondaire || '#0077FF'})` }}>
          <p className="text-white font-sora font-semibold text-sm">Dégradé Preview</p>
          <p className="text-xs mt-0.5" style={{ color: user?.couleur_accent || '#3AFFA3' }}>Texte accent</p>
        </div>
      </div>
    </div>
  );

  const renderAvatar = () => {
    if (avatarLoading) {
      return (
        <div className="flex items-center justify-center py-8 gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[#5B6CFF]" />
          <p className="text-sm text-slate-400 font-inter">Chargement...</p>
        </div>
      );
    }

    if (avatar) {
      return (
        <div className="space-y-4">
          {/* Status bar */}
          <div className={`flex items-center gap-3 px-4 py-3 rounded-lg ${avatarStatusConfig.bg}`}>
            <avatarStatusConfig.icon className={`w-4 h-4 ${avatarStatusConfig.color} ${avatar.status === 'in_progress' ? 'animate-spin' : ''}`} />
            <span className={`text-sm font-medium font-inter ${avatarStatusConfig.color}`}>{avatarStatusConfig.label}</span>
            {avatar.avatar_name && <span className="text-slate-400 font-inter text-sm">— {avatar.avatar_name}</span>}
          </div>

          {/* Pending info */}
          {avatar.status === 'pending' && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <Info className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-300 font-inter">
                Votre demande a été soumise et est en cours de traitement.
              </p>
            </div>
          )}

          {/* In progress info */}
          {avatar.status === 'in_progress' && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
              <Info className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-300 font-inter">Votre avatar est en cours de création. Ce processus peut prendre plusieurs heures.</p>
            </div>
          )}

          {/* Consent link (from admin) */}
          {avatar.consent_url && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[#5B6CFF]/5 border border-[#5B6CFF]/20">
              <Info className="w-4 h-4 text-[#5B6CFF] mt-0.5 flex-shrink-0" />
              <div className="text-xs font-inter">
                <p className="text-white font-medium mb-1">Lien de consentement HeyGen</p>
                <a href={avatar.consent_url} target="_blank" rel="noopener noreferrer"
                  className="text-[#5B6CFF] hover:underline break-all">{avatar.consent_url}</a>
              </div>
            </div>
          )}

          {/* Preview images (from HeyGen, shown when complete) */}
          {avatar.status === 'complete' && avatar.preview_image_url && (
            <div>
              <p className="text-xs text-slate-400 mb-2 font-inter">Aperçu de votre avatar</p>
              <div className="flex flex-wrap gap-3">
                {avatar.preview_image_url.split(',').map((url, i) => (
                  <img key={i} src={url.trim()} alt={`Avatar preview ${i + 1}`}
                    className="w-32 h-32 rounded-lg border border-white/10 object-cover" data-testid={`avatar-preview-${i}`} />
                ))}
              </div>
            </div>
          )}

          {/* Training video (shown while pending/in_progress, removed after complete) */}
          {avatar.status !== 'complete' && avatar.training_video_url && (
            <div>
              <p className="text-xs text-slate-400 mb-1.5 font-inter">Votre vidéo d'entraînement</p>
              <video src={avatar.training_video_url} controls className="max-w-xs rounded-lg border border-white/10" data-testid="avatar-preview-video" />
            </div>
          )}

          {/* Error */}
          {avatar.status === 'failed' && avatar.error_message && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-red-300 text-xs font-inter">{avatar.error_message}</p>
            </div>
          )}

          {/* Description */}
          {avatar.description && (
            <div>
              <p className="text-xs text-slate-500 font-inter mb-1">Description</p>
              <p className="text-sm text-slate-300 font-inter">{avatar.description}</p>
            </div>
          )}

          {/* Info */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            {avatar.avatar_id && (
              <div>
                <p className="text-slate-500 font-inter">ID Avatar</p>
                <p className="text-slate-300 font-mono text-[10px] mt-0.5">{avatar.avatar_id}</p>
              </div>
            )}
            {avatar.created_at && (
              <div>
                <p className="text-slate-500 font-inter">Soumis le</p>
                <p className="text-slate-300 font-inter mt-0.5">{new Date(avatar.created_at).toLocaleDateString('fr-FR')}</p>
              </div>
            )}
          </div>

          {/* Delete */}
          <div className="flex gap-2">
            <button onClick={handleDeleteAvatar} disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors font-inter text-xs disabled:opacity-50"
              data-testid="delete-avatar-btn">
              <Trash2 className="w-3.5 h-3.5" />{deleting ? 'Suppression...' : 'Supprimer la demande'}
            </button>
          </div>
        </div>
      );
    }

    // Create form
    return (
      <form onSubmit={handleCreateAvatar} className="space-y-4">
        <p className="text-sm text-slate-400 font-inter">
          Soumettez vos vidéos et une description pour que l'administrateur crée votre avatar digital.
        </p>
        <div className="flex items-start gap-2 p-3 rounded-lg bg-[#5B6CFF]/5 border border-[#5B6CFF]/20">
          <Info className="w-4 h-4 text-[#5B6CFF] mt-0.5 flex-shrink-0" />
          <div className="text-xs text-slate-300 font-inter space-y-1">
            <p className="font-medium text-white">Vidéo d'entraînement :</p>
            <ul className="list-disc list-inside space-y-0.5 text-slate-400">
              <li>Min. 2 min, 720p+, MP4</li>
              <li>Regardez la caméra, parlez clairement</li>
              <li>Fond neutre, bon éclairage</li>
            </ul>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-300 font-inter">Description de l'avatar</label>
          <textarea
            value={avatarDescription}
            onChange={(e) => setAvatarDescription(e.target.value)}
            placeholder="Décrivez comment vous souhaitez que votre avatar apparaisse (tenue, style, ton de voix, etc.)"
            rows={3}
            className="w-full rounded-lg bg-slate-950/50 border border-slate-800 focus:border-[#5B6CFF] text-slate-200 text-sm px-3 py-2 outline-none resize-none font-inter placeholder:text-slate-600"
            data-testid="avatar-description"
          />
        </div>

        {/* Video upload */}
        <FileDropZone id="training" label="Vidéo d'entraînement" description="Min. 2 min, 720p+, MP4"
          accept="video/*" file={trainingVideo} onFileChange={setTrainingVideo} />

        <button type="submit" disabled={creating || !trainingVideo}
          className="w-full py-2.5 px-4 rounded-lg font-medium font-inter text-white text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] hover:shadow-lg hover:shadow-[#5B6CFF]/25"
          data-testid="create-avatar-btn">
          {creating ? (
            <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Upload en cours...</span>
          ) : (
            <span className="flex items-center justify-center gap-2"><Video className="w-4 h-4" />Soumettre ma demande</span>
          )}
        </button>
      </form>
    );
  };

  const sectionRenderers = {
    identity: renderIdentity,
    connections: renderConnections,
    schedules: renderSchedules,
    gpt_urls: renderGptUrls,
    api_keys: renderApiKeys,
    style: renderStyle,
    avatar: renderAvatar,
  };

  const currentSection = SETTINGS_SECTIONS.find(s => s.id === activeSection);

  return (
    <div className="h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-sora text-white">Paramètres</h1>
          <p className="text-slate-400 mt-0.5 font-inter text-sm">Gérez votre profil, connexions et avatar</p>
        </div>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" data-testid="delete-account-btn" className="text-red-400 hover:text-red-300 hover:bg-red-500/10 font-inter text-xs">
                <Trash2 className="w-3.5 h-3.5 mr-1" />Supprimer
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-slate-900 border-slate-800">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-white font-sora">Supprimer mon compte</AlertDialogTitle>
                <AlertDialogDescription className="text-slate-400 font-inter">Cette action est irréversible.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 font-inter">Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteAccount} data-testid="confirm-delete-account-btn" className="bg-red-600 hover:bg-red-700 text-white font-inter">Supprimer</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button onClick={handleSave} disabled={saving} size="sm" data-testid="save-btn"
            className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] hover:opacity-90 font-inter text-xs">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
            Sauvegarder
          </Button>
        </div>
      </div>

      {/* Profile incomplete warning */}
      {!isProfileComplete && (
        <div className="mb-4 flex items-start gap-3 p-3 rounded-xl border border-orange-500/30 bg-orange-500/10">
          <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-orange-300 font-inter">Profil incomplet</p>
            <p className="text-xs text-orange-400/80 mt-0.5 font-inter">Remplissez tous les champs requis pour que le système fonctionne.</p>
          </div>
        </div>
      )}

      {/* Two-panel layout */}
      <div className="flex gap-6 min-h-[calc(100vh-220px)]">

        {/* Left sub-nav */}
        <nav className="w-52 flex-shrink-0 space-y-1 hidden md:block">
          {SETTINGS_SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            const isIncomplete = incompleteSections.includes(section.id);
            const hasAvatarBadge = section.id === 'avatar' && avatar?.status;

            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                data-testid={`settings-tab-${section.id}`}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200 font-inter group ${
                  isActive
                    ? 'bg-gradient-to-r from-[#5B6CFF]/15 to-[#8A6CFF]/10 text-white border-l-2 border-[#5B6CFF]'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-[#5B6CFF]' : 'text-slate-500 group-hover:text-slate-300'}`} />
                <span className="text-sm font-medium flex-1 truncate">{section.title}</span>
                {isIncomplete && <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" />}
                {hasAvatarBadge && avatar.status === 'complete' && <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />}
                {hasAvatarBadge && avatar.status === 'in_progress' && <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse flex-shrink-0" />}
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-[#5B6CFF] flex-shrink-0" />}
              </button>
            );
          })}
        </nav>

        {/* Mobile section selector */}
        <div className="md:hidden w-full mb-4">
          <Select value={activeSection} onValueChange={setActiveSection}>
            <SelectTrigger className="bg-slate-950/50 border-slate-800 text-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800">
              {SETTINGS_SECTIONS.map(s => (
                <SelectItem key={s.id} value={s.id} className="text-slate-200 focus:bg-slate-800">{s.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Right content panel */}
        <div className="flex-1 min-w-0">
          <div className="rounded-xl border border-white/5 bg-slate-900/30 backdrop-blur-sm p-6">
            {/* Section title */}
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/5">
              {currentSection && (
                <>
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-[#5B6CFF]/20 to-[#8A6CFF]/20 border border-[#5B6CFF]/20">
                    <currentSection.icon className="w-4.5 h-4.5 text-[#5B6CFF]" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold font-sora text-white">{currentSection.title}</h2>
                  </div>
                </>
              )}
            </div>

            {/* Content */}
            <div className="animate-fade-in">
              {sectionRenderers[activeSection]?.()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
