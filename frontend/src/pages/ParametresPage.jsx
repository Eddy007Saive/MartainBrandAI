import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  User, Link, Key, Palette, Save, Loader2, Trash2, AlertTriangle, Info,
  Plug, Check, ExternalLink, Unplug, Calendar, Clock, Video, Upload,
  CheckCircle, XCircle, AlertCircle, ChevronRight, Megaphone, Settings, CreditCard, Sparkles,
  Plus, Image as ImageIcon,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
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
import InvoicesList from '../components/InvoicesList';
import { COMMON_TIMEZONES } from '../lib/tz';
import { PageHeader } from '../components/PageHeader';
import { userService } from '../services/userService';
import { billingService } from '../services/billingService';
import { scheduleService } from '../services/scheduleService';
import { heygenService } from '../services/heygenService';
import { templateService } from '../services/templateService';
import { removeToken, setToken } from '../lib/auth';
import { useUser } from '../context/UserContext';
import { SOCIAL_PLATFORMS } from '../constants/platforms';
import { DAYS, DEFAULT_SCHEDULE } from '../constants/schedules';
import QuotaGauge from '../components/QuotaGauge';

const REQUIRED_FIELDS = {
  identity: ['nom', 'username', 'user_name', 'photo_url', 'sexe', 'style_vestimentaire'],
  marque: ['secteur', 'voix_marque'],
  style: ['couleur_principale', 'couleur_secondaire', 'couleur_accent'],
};

// Avatar vidéo IA (HeyGen) désactivé pour l'instant -> affiché « à venir ».
// Passer à true pour réactiver toute la section.
const HEYGEN_AVATAR_ENABLED = false;

const SETTINGS_SECTIONS = [
  { id: 'identity', title: 'Identité', icon: User },
  { id: 'marque', title: 'Voix de marque', icon: Megaphone },
  { id: 'connections', title: 'Réseaux sociaux', icon: Plug },
  { id: 'schedules', title: 'Planification', icon: Calendar },
  { id: 'abonnement', title: 'Abonnement', icon: CreditCard },
  { id: 'style', title: 'Style & Couleurs', icon: Palette },
  { id: 'avatar', title: 'Avatar vidéo', icon: Video, soon: true },
];

// Offre unique Pro (le détail des quotas est paramétrable en admin)
const PRO_OFFER = {
  price: '279€',
  inclus: ['100 sujets / mois', '50 posts / mois', '50 images standard', '20 images HD', '10 carrousels'],
  feats: ['Les 5 réseaux', 'Carrousels + planification', 'Analytics + commentaires', 'Notifications push'],
};

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

// --- TextareaField (champs longs de la voix de marque) ---
function TextareaField({ label, name, value, placeholder, onChange, rows = 3, hint }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-300 font-inter">{label}</label>
      {hint && <p className="text-xs text-slate-500 font-inter">{hint}</p>}
      <textarea
        value={value || ''}
        onChange={(e) => onChange(name, e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-lg bg-slate-950/50 border border-slate-800 focus:border-[#5B6CFF] text-slate-200 text-sm px-3 py-2 outline-none resize-y font-inter placeholder:text-slate-600"
        data-testid={`field-${name}`}
      />
    </div>
  );
}

export default function ParametresPage() {
  const navigate = useNavigate();
  const { user, setUser, refetchUser } = useUser();
  const [saving, setSaving] = useState(false);
  // Section active pilotée par l'URL (?s=) -> synchronisée avec la sous-nav du sidebar (DashboardLayout)
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection = searchParams.get('s') || 'identity';
  const setActiveSection = (id) => setSearchParams({ s: id });
  const [connecting, setConnecting] = useState(null);
  const [socialMeta, setSocialMeta] = useState({}); // {platform: {username, name, avatar, url, followers}}
  const [exReseau, setExReseau] = useState('linkedin');

  // Schedules
  const connectedPlatforms = SOCIAL_PLATFORMS.filter(p => user?.[p.field]);
  useEffect(() => {
    if (activeSection === 'connections' && connectedPlatforms.length) {
      userService.socialAccounts().then((d) => setSocialMeta(d.accounts || {})).catch(() => {});
    }
  }, [activeSection, connectedPlatforms.length]);
  const [schedules, setSchedules] = useState([]);
  const [schedulesLoaded, setSchedulesLoaded] = useState(false);
  const [savingSchedules, setSavingSchedules] = useState(false);

  // Inspirations visuelles
  const [inspirations, setInspirations] = useState([]);
  const [inspiLoaded, setInspiLoaded] = useState(false);
  const [uploadingInspi, setUploadingInspi] = useState(false);
  const inspiInputRef = useRef(null);

  // Templates de marque
  const [templates, setTemplates] = useState([]);
  const [tplOpen, setTplOpen] = useState(false);
  const [tplNom, setTplNom] = useState('');
  const [tplNote, setTplNote] = useState('');
  const [tplImages, setTplImages] = useState([]);
  const [tplSaving, setTplSaving] = useState(false);
  const [tplUploading, setTplUploading] = useState(false);
  const tplInputRef = useRef(null);
  const toggleTplImage = (url) => setTplImages((p) => (p.includes(url) ? p.filter((u) => u !== url) : [...p, url]));

  const handleTplUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setTplUploading(true);
    try {
      let latest;
      for (const f of files) {
        if (!f.type.startsWith('image/')) { toast.error(`${f.name} : pas une image`); continue; }
        if (f.size > 10 * 1024 * 1024) { toast.error(`${f.name} : trop lourde (10 Mo max)`); continue; }
        latest = await userService.addInspiration(f);
      }
      if (latest) {
        const urls = latest.images || [];
        const news = urls.filter((u) => !inspirations.includes(u));
        setInspirations(urls);
        setTplImages((prev) => [...prev, ...news]); // auto-sélectionne les nouvelles
        toast.success('Image ajoutée');
      }
    } catch (err) {
      toast.error("Échec de l'upload");
    } finally {
      setTplUploading(false);
      if (tplInputRef.current) tplInputRef.current.value = '';
    }
  };

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

  // Refetch quand on entre dans la section OU quand `user` se peuple (fetchSchedules change d'identité).
  // Sans ça, un chargement de page directement sur Planification (user pas encore prêt) fige des schedules vides.
  useEffect(() => {
    if (activeSection === 'schedules') fetchSchedules();
  }, [activeSection, fetchSchedules]);

  // Retour du paiement Stripe : on resynchronise l'abonnement (filet si webhook manqué)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('paiement') === 'ok') {
      billingService.sync()
        .then(() => { toast.success('Abonnement activé ✨'); refetchUser?.(); })
        .catch(() => {})
        .finally(() => window.history.replaceState({}, '', window.location.pathname));
    } else if (params.get('paiement') === 'annule') {
      toast.info('Paiement annulé');
      window.history.replaceState({}, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Inspirations visuelles + Templates de marque ---
  useEffect(() => {
    if (activeSection === 'style' && !inspiLoaded) {
      userService.listInspirations()
        .then((d) => setInspirations(d.images || []))
        .catch(() => {})
        .finally(() => setInspiLoaded(true));
      templateService.list().then((d) => setTemplates(d || [])).catch(() => {});
    }
  }, [activeSection, inspiLoaded]);

  const handleCreateTemplate = async () => {
    if (!tplNom.trim()) { toast.error('Donne un nom au template'); return; }
    setTplSaving(true);
    try {
      const t = await templateService.create({ nom: tplNom.trim(), images: tplImages, note: tplNote.trim() });
      setTemplates((p) => [t, ...p]);
      setTplNom(''); setTplNote(''); setTplImages([]); setTplOpen(false);
      toast.success('Template créé');
    } catch (err) {
      toast.error('Échec de la création');
    } finally {
      setTplSaving(false);
    }
  };

  const handleDeleteTemplate = async (id) => {
    try {
      await templateService.remove(id);
      setTemplates((p) => p.filter((t) => t.id !== id));
    } catch (err) {
      toast.error('Échec de la suppression');
    }
  };

  const handleInspiUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploadingInspi(true);
    try {
      let latest;
      for (const f of files) {
        if (!f.type.startsWith('image/')) { toast.error(`${f.name} : pas une image`); continue; }
        if (f.size > 10 * 1024 * 1024) { toast.error(`${f.name} : trop lourde (10 Mo max)`); continue; }
        latest = await userService.addInspiration(f);
      }
      if (latest) { setInspirations(latest.images || []); toast.success('Inspiration(s) ajoutée(s)'); }
    } catch (err) {
      toast.error("Échec de l'upload");
    } finally {
      setUploadingInspi(false);
      if (inspiInputRef.current) inspiInputRef.current.value = '';
    }
  };

  const handleInspiDelete = async (url) => {
    try {
      const d = await userService.removeInspiration(url);
      setInspirations(d.images || []);
    } catch (err) {
      toast.error('Échec de la suppression');
    }
  };

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

  // Upload de la photo de profil
  const photoInputRef = useRef(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const logoInputRef = useRef(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Choisissez une image (jpg, png, webp).'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('Image trop lourde (max 10 Mo).'); return; }
    setUploadingPhoto(true);
    try {
      const { photo_url } = await userService.uploadPhoto(file);
      handleChange('photo_url', photo_url);
      toast.success('Photo mise à jour');
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Échec de l'upload de la photo");
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  // Avatar (photo de profil affichée dans la sidebar)
  const avatarInputRef = useRef(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Choisissez une image (jpg, png, webp).'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('Image trop lourde (max 10 Mo).'); return; }
    setUploadingAvatar(true);
    try {
      const { avatar_url } = await userService.uploadAvatar(file);
      handleChange('avatar_url', avatar_url);
      toast.success('Avatar mis à jour');
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Échec de l'upload de l'avatar");
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  // Changement de mot de passe
  const [pwdOld, setPwdOld] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [changingPwd, setChangingPwd] = useState(false);
  const handleChangePassword = async () => {
    if (!pwdOld || !pwdNew) { toast.error('Remplis les deux champs.'); return; }
    if (pwdNew.length < 6) { toast.error('Le nouveau mot de passe doit faire au moins 6 caractères.'); return; }
    setChangingPwd(true);
    try {
      const data = await userService.changePassword(pwdOld, pwdNew);
      if (data?.token) setToken(data.token);  // garde CET appareil connecté ; les autres seront déconnectés
      toast.success('Mot de passe changé ✓ — les autres appareils seront déconnectés.');
      setPwdOld(''); setPwdNew('');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Échec du changement de mot de passe');
    } finally {
      setChangingPwd(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Choisissez une image (png, svg, webp).'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('Image trop lourde (max 10 Mo).'); return; }
    setUploadingLogo(true);
    try {
      const { logo_url } = await userService.uploadLogo(file);
      handleChange('logo_url', logo_url);
      toast.success('Logo mis à jour');
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Échec de l'upload du logo");
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleLogoDelete = async () => {
    setUploadingLogo(true);
    try {
      await userService.deleteLogo();
      handleChange('logo_url', null);
      toast.success('Logo retiré');
    } catch (err) {
      toast.error("Échec de la suppression du logo");
    } finally {
      setUploadingLogo(false);
    }
  };

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
      navigate('/login');
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
    <div className="space-y-5">
      {/* ---- MÉDIAS : avatar, photo, logo ---- */}
      <section className="rounded-2xl border border-white/[0.07] bg-slate-950/40">
        <div className="px-5 pt-4 pb-1 text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold font-inter">Médias</div>
        <div className="px-5 divide-y divide-white/[0.06]">
          {/* Avatar (menu) */}
          <div className="flex items-center gap-4 py-4">
            <div className="relative w-14 h-14 rounded-full overflow-hidden bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] grid place-items-center flex-shrink-0 ring-1 ring-white/15">
              {user?.avatar_url
                ? <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                : <span className="text-white text-lg font-semibold font-sora">{(user?.nom || user?.username || 'U').charAt(0).toUpperCase()}</span>}
              {uploadingAvatar && <div className="absolute inset-0 bg-black/60 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-white" /></div>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-medium text-white font-sora">Avatar</p>
              <p className="text-[11.5px] text-slate-500 font-inter">Photo affichée dans le menu · JPG/PNG/WebP, 10 Mo max.</p>
            </div>
            <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
            <Button type="button" size="sm" onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar}
              className="bg-[#5B6CFF]/15 text-[#8A6CFF] hover:bg-[#5B6CFF]/25 border border-[#5B6CFF]/30 font-inter shrink-0">
              <Upload className="w-4 h-4 mr-1.5" />{user?.avatar_url ? 'Changer' : 'Importer'}
            </Button>
          </div>

          {/* Photo de profil + toggle */}
          <div className="flex items-center gap-4 py-4 flex-wrap">
            <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-slate-800/60 border border-white/10 grid place-items-center flex-shrink-0">
              {user?.photo_url ? <img src={user.photo_url} alt="Photo de profil" className="w-full h-full object-cover" /> : <User className="w-6 h-6 text-slate-600" />}
              {uploadingPhoto && <div className="absolute inset-0 bg-black/60 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-white" /></div>}
            </div>
            <div className="flex-1 min-w-[180px]">
              <p className="text-[13.5px] font-medium text-white font-sora">Photo de profil</p>
              <p className="text-[11.5px] text-slate-500 font-inter">Utilisée dans tes visuels générés si activée · 10 Mo max.</p>
            </div>
            <div className="flex items-center gap-2 mr-1">
              <Label className="text-[12.5px] font-medium text-slate-400 font-inter">Utiliser</Label>
              <Switch checked={user?.use_photo || false} onCheckedChange={(c) => handleChange('use_photo', c)} data-testid="toggle-use-photo" />
            </div>
            <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" data-testid="input-photo" />
            <Button type="button" size="sm" onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}
              className="bg-[#5B6CFF]/15 text-[#8A6CFF] hover:bg-[#5B6CFF]/25 border border-[#5B6CFF]/30 font-inter shrink-0">
              <Upload className="w-4 h-4 mr-1.5" />{user?.photo_url ? 'Changer' : 'Importer'}
            </Button>
          </div>

          {/* Logo de marque */}
          <div className="flex items-center gap-4 py-4 flex-wrap">
            <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-white/90 border border-white/10 grid place-items-center flex-shrink-0">
              {user?.logo_url ? <img src={user.logo_url} alt="Logo" className="w-full h-full object-contain p-1.5" /> : <span className="text-[10px] font-semibold text-slate-400 font-sora">LOGO</span>}
              {uploadingLogo && <div className="absolute inset-0 bg-black/60 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-white" /></div>}
            </div>
            <div className="flex-1 min-w-[180px]">
              <p className="text-[13.5px] font-medium text-white font-sora">Logo de marque</p>
              <p className="text-[11.5px] text-slate-500 font-inter">Posé sur tes carrousels · PNG transparent conseillé. Sans logo → initiale de ton nom.</p>
            </div>
            {user?.logo_url && (
              <button type="button" onClick={handleLogoDelete} disabled={uploadingLogo}
                className="text-[12px] text-slate-500 hover:text-red-400 font-inter transition-colors shrink-0">Retirer</button>
            )}
            <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" data-testid="input-logo" />
            <Button type="button" size="sm" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}
              className="bg-[#5B6CFF]/15 text-[#8A6CFF] hover:bg-[#5B6CFF]/25 border border-[#5B6CFF]/30 font-inter shrink-0">
              <Upload className="w-4 h-4 mr-1.5" />{user?.logo_url ? 'Changer' : 'Importer'}
            </Button>
          </div>
        </div>
      </section>

      {/* ---- INFORMATIONS ---- */}
      <section className="rounded-2xl border border-white/[0.07] bg-slate-950/40 p-5">
        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold font-inter mb-4">Informations</div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-4">
          <Field label="Nom" name="nom" value={user?.nom} onChange={handleChange}
            hint="Votre nom complet tel qu'il apparaîtra dans vos contenus générés." />
          <Field label="Username" name="username" value={user?.username} onChange={handleChange}
            hint="Votre identifiant unique (sans espaces, ex: martin_dupont)." />
          <Field label="Email" name="email" value={user?.email} onChange={handleChange} readOnly />
          <Field label="Nom affiché" name="user_name" value={user?.user_name} onChange={handleChange}
            hint="Le nom public affiché dans vos posts." />
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
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-300 font-inter">Fuseau horaire</Label>
            <Select value={user?.timezone || 'Europe/Paris'} onValueChange={(v) => handleChange('timezone', v)}>
              <SelectTrigger data-testid="field-timezone" className="bg-slate-950/50 border-slate-800 focus:border-[#5B6CFF] text-slate-200">
                <SelectValue placeholder="Sélectionner" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 max-h-72">
                {COMMON_TIMEZONES.map((t) => (
                  <SelectItem key={t.value} value={t.value} className="text-slate-200 focus:bg-slate-800">{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-slate-500 font-inter">Vos publications partiront à l'heure de ce fuseau.</p>
          </div>
        </div>
      </section>

      {/* ---- SÉCURITÉ ---- */}
      <section className="rounded-2xl border border-white/[0.07] bg-slate-950/40 p-5 space-y-3">
        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold font-inter">Sécurité</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input type="password" value={pwdOld} onChange={(e) => setPwdOld(e.target.value)} placeholder="Mot de passe actuel"
            className="bg-slate-950/50 border-slate-800 text-slate-200 focus:border-[#5B6CFF]" />
          <Input type="password" value={pwdNew} onChange={(e) => setPwdNew(e.target.value)} placeholder="Nouveau (6 car. min.)"
            className="bg-slate-950/50 border-slate-800 text-slate-200 focus:border-[#5B6CFF]" />
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={handleChangePassword} disabled={changingPwd || !pwdOld || !pwdNew}
            className="bg-[#5B6CFF]/15 text-[#8A6CFF] hover:bg-[#5B6CFF]/25 border border-[#5B6CFF]/30 font-inter">
            {changingPwd ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}Changer le mot de passe
          </Button>
        </div>
      </section>
    </div>
  );

  const renderMarque = () => (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#5B6CFF]/[0.06] border border-[#5B6CFF]/20">
        <Info className="w-4 h-4 text-[#5B6CFF] mt-0.5 flex-shrink-0" />
        <p className="text-xs text-slate-300 font-inter leading-relaxed">
          Ces informations nourrissent l'IA du <span className="text-white font-medium">Studio IA</span>.
          Plus elles sont précises, plus les sujets et les posts générés sonnent juste.
        </p>
      </div>

      {/* POSITIONNEMENT */}
      <section className="rounded-2xl border border-white/[0.07] bg-slate-950/40 p-5">
        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold font-inter mb-4">Positionnement</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
          <Field label="Secteur / activité" name="secteur" value={user?.secteur} onChange={handleChange}
            hint="Ex: Coach business pour entrepreneures, Agence immobilière, Restaurant bistronomique…" />
          <Field label="Audience cible" name="audience" value={user?.audience} onChange={handleChange}
            hint="À qui tu t'adresses. Ex: Freelances 28-45 ans en reconversion." />
        </div>
      </section>

      {/* VOIX & CONTENU */}
      <section className="rounded-2xl border border-white/[0.07] bg-slate-950/40 p-5 space-y-4">
        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold font-inter">Voix &amp; contenu</div>
        <TextareaField label="Voix & ton" name="voix_marque" value={user?.voix_marque} onChange={handleChange} rows={4}
          hint="Ton style d'écriture : tutoiement, direct, chaleureux, pas de jargon, etc."
          placeholder="Ex: Tutoiement, ton chaleureux et direct. Phrases courtes. Honnête (on parle aussi des galères). Zéro promesse magique." />
        <TextareaField label="Piliers / thèmes" name="piliers" value={user?.piliers} onChange={handleChange} rows={3}
          hint="Tes grands sujets récurrents (un par ligne)."
          placeholder={"Mindset & confiance\nMéthode business\nCoulisses & vécu"} />
        <TextareaField label="À éviter absolument" name="a_eviter" value={user?.a_eviter} onChange={handleChange} rows={3}
          hint="Mots, promesses ou tons à bannir."
          placeholder="Ex: pas de promesses chiffrées, pas de jargon corporate, pas de hashtags en pagaille." />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <TextareaField label="Hooks / accroches qui marchent" name="hooks" value={user?.hooks} onChange={handleChange} rows={5}
            hint="Tes meilleures accroches (une par ligne). L'IA s'en inspire pour les posts et les scripts."
            placeholder={"Pendant 2 ans, j'ai bradé mes prix…\nPersonne ne te dira ça, mais…\n90% des freelances font cette erreur"} />
          <TextareaField label="CTA habituels" name="ctas" value={user?.ctas} onChange={handleChange} rows={5}
            hint="Tes appels à l'action récurrents (un par ligne)."
            placeholder={"Commente MÉTHODE\nLien en bio\nDM-moi le mot X\nAbonne-toi pour la suite"} />
        </div>
      </section>

      {/* RÈGLES ÉDITORIALES (la "bible") */}
      <section className="rounded-2xl border border-[#5B6CFF]/25 bg-[#5B6CFF]/[0.05] p-5">
        <TextareaField label="📕 Règles éditoriales (l'IA les respecte à la lettre)" name="regles" value={user?.regles} onChange={handleChange} rows={9}
          hint="Ta « bible » : structure des posts, dosage des CTA, ce qui est interdit, etc. Ces règles priment sur tout le reste. Tu peux coller ton document complet (sections incluses)."
          placeholder={"Ex:\n1. Un seul CTA par post.\n2. Choisis un pilier + un hook de la banque (ou un neuf dans le même esprit).\n3. Respecte la structure et adapte à la plateforme demandée.\n4. Interdits : promesses chiffrées garanties, jargon corporate…\nTu ne violes jamais une règle de la section 4."} />
      </section>

      {/* EXEMPLES DE POSTS PAR RÉSEAU */}
      <section className="rounded-2xl border border-white/[0.07] bg-slate-950/40 p-5 space-y-2">
        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold font-inter">Exemples de posts (par réseau)</div>
        <p className="text-xs text-slate-500 font-inter">
          Colle 1 à 3 de tes meilleurs posts pour chaque réseau (sépare-les par une ligne <span className="text-slate-400">---</span>).
          C'est ce qui calibre le mieux le style des contenus générés. Optionnel mais fortement recommandé.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {[
            { id: 'linkedin', label: 'LinkedIn' },
            { id: 'instagram', label: 'Instagram' },
            { id: 'facebook', label: 'Facebook' },
            { id: 'tiktok', label: 'TikTok' },
          ].map((r) => {
            const rempli = !!user?.[`exemples_${r.id}`];
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setExReseau(r.id)}
                data-testid={`exemples-tab-${r.id}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium font-inter transition-all border flex items-center gap-1.5 ${
                  exReseau === r.id
                    ? 'bg-[#5B6CFF]/15 text-white border-[#5B6CFF]/50'
                    : 'text-slate-400 border-white/10 hover:text-white hover:border-white/20'
                }`}
              >
                {r.label}
                {rempli && <Check className="w-3 h-3 text-emerald-400" />}
              </button>
            );
          })}
        </div>
        <textarea
          value={user?.[`exemples_${exReseau}`] || ''}
          onChange={(e) => handleChange(`exemples_${exReseau}`, e.target.value)}
          rows={8}
          placeholder={`Colle ici tes meilleurs posts ${exReseau}…\n\nPost 1\n---\nPost 2`}
          className="w-full rounded-lg bg-slate-950/50 border border-slate-800 focus:border-[#5B6CFF] text-slate-200 text-sm px-3 py-2 outline-none resize-y font-inter placeholder:text-slate-600"
          data-testid={`field-exemples-${exReseau}`}
        />
      </section>
    </div>
  );

  const CONNECT_HINTS = {
    instagram: 'Publie tes posts et carrousels sur Instagram.',
    facebook: 'Publie tes posts et visuels sur ta page Facebook.',
    linkedin: 'Diffuse tes posts pro sur ton profil LinkedIn.',
    youtube: 'Programme la sortie de tes vidéos et Shorts.',
    tiktok: 'Publie tes formats courts et Reels verticaux.',
    googlebusiness: "Diffuse tes actualités sur ta fiche d'établissement Google.",
  };

  const renderConnections = () => {
    const total = SOCIAL_PLATFORMS.length;
    const nb = connectedPlatforms.length;
    return (
    <div className="space-y-5">
      {/* En-tête + récap de connexion segmenté */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-sm text-slate-400 font-inter max-w-md leading-relaxed">
          Connecte tes comptes pour programmer et publier automatiquement, depuis un seul endroit.
        </p>
        <div className="text-right shrink-0">
          <div className="text-[13px] font-sora font-semibold text-slate-200">
            <span className="text-[#3AFFA3]">{nb}</span> connecté{nb > 1 ? 's' : ''}
            <span className="text-slate-600"> · {total - nb} disponible{total - nb > 1 ? 's' : ''}</span>
          </div>
          <div className="flex gap-1 mt-2 justify-end">
            {SOCIAL_PLATFORMS.map((p) => {
              const on = !!user?.[p.field];
              return <span key={p.id} className="h-1 w-5 rounded-full"
                style={{ background: on ? '#3AFFA3' : 'rgba(255,255,255,.09)', boxShadow: on ? '0 0 9px rgba(58,255,163,.5)' : 'none' }} />;
            })}
          </div>
        </div>
      </div>

      {/* Grille de cards — une carte par réseau */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {SOCIAL_PLATFORMS.map((platform) => {
          const isConnected = !!user?.[platform.field];
          const isLoading = connecting === platform.id;
          const meta = socialMeta[platform.id] || {};
          // Zernio signale un token expiré/révoqué via is_active=false -> le compte doit être RECONNECTÉ
          const needsReconnect = isConnected && meta.is_active === false;
          const hint = CONNECT_HINTS[platform.id] || 'Connecte ton compte pour publier automatiquement.';
          return (
            <div key={platform.id} data-testid={`connect-card-${platform.id}`}
              className={`group relative overflow-hidden rounded-2xl border bg-[#0f172a] p-5 flex flex-col gap-4 transition-all duration-300 ease-[cubic-bezier(.23,1,.32,1)] hover:-translate-y-0.5 hover:border-white/[0.14] hover:shadow-[0_14px_34px_rgba(0,0,0,0.4)] ${needsReconnect ? 'border-amber-500/30' : isConnected ? 'border-[#3AFFA3]/20' : 'border-white/[0.07]'}`}>
              {/* Barre d'accent marque */}
              <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: platform.brand }} />

              {/* En-tête carte : logo + nom + statut */}
              <div className="flex items-center gap-3">
                <span className="w-[46px] h-[46px] rounded-[13px] grid place-items-center shrink-0 bg-[#0a1120] border border-white/[0.07]" style={{ color: platform.brand }}>
                  <platform.icon className="w-[23px] h-[23px] block" />
                </span>
                <div className="font-sora font-semibold text-[15.5px] text-white tracking-tight min-w-0 truncate">{platform.name}</div>
                {needsReconnect ? (
                  <span className="ml-auto shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold font-inter px-2.5 py-1 rounded-full bg-amber-500/[0.12] text-amber-400 border border-amber-500/30">
                    <AlertTriangle className="w-3 h-3" />
                    Reconnexion requise
                  </span>
                ) : isConnected ? (
                  <span className="ml-auto shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold font-inter px-2.5 py-1 rounded-full bg-[#3AFFA3]/[0.12] text-[#3AFFA3] border border-[#3AFFA3]/25">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3AFFA3] opacity-60" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#3AFFA3]" />
                    </span>
                    Connecté
                  </span>
                ) : (
                  <span className="ml-auto shrink-0 text-[11px] font-semibold font-inter px-2.5 py-1 rounded-full bg-white/[0.05] text-slate-500 border border-white/[0.07]">Non connecté</span>
                )}
              </div>

              {/* Corps */}
              {isConnected ? (
                <div className="flex items-center gap-3 p-3 rounded-[13px] bg-[#0a1120] border border-white/[0.07]">
                  {meta.avatar
                    ? <img src={meta.avatar} alt="" className="w-[42px] h-[42px] rounded-[11px] object-cover shrink-0 border border-white/[0.07]" />
                    : <span className="w-[42px] h-[42px] rounded-[11px] grid place-items-center shrink-0 border border-white/[0.07] font-sora font-semibold text-sm" style={{ background: `${platform.brand}22`, color: platform.brand }}>{(meta.name || platform.name).charAt(0)}</span>}
                  <div className="min-w-0">
                    <span className="block font-sora font-semibold text-[13.5px] text-white truncate">{meta.name || 'Compte connecté'}</span>
                    {meta.username && (
                      <span className="block text-[12px] text-slate-500 font-inter truncate mt-0.5">
                        {meta.url
                          ? <a href={meta.url} target="_blank" rel="noopener noreferrer" className="hover:text-slate-300">@{meta.username}</a>
                          : <>@{meta.username}</>}
                      </span>
                    )}
                  </div>
                  {meta.followers != null && (
                    <div className="ml-auto text-right shrink-0">
                      <span className="block font-sora text-sm text-white tabular-nums">{Math.round(meta.followers).toLocaleString('fr-FR')}</span>
                      <span className="block text-[10.5px] text-slate-500 font-inter">abonné{meta.followers > 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[12.5px] text-slate-400 font-inter leading-relaxed">{hint}</p>
              )}

              {/* Action */}
              <div className="mt-auto">
                {needsReconnect ? (
                  <div className="flex gap-2">
                    <button disabled={isLoading} onClick={() => handleConnect(platform.id)} data-testid={`reconnect-${platform.id}`}
                      className="flex-1 inline-flex items-center justify-center gap-2 bg-amber-500/90 text-[#0b1322] font-inter font-semibold text-[13px] rounded-xl px-4 py-2.5 transition-all duration-150 ease-[cubic-bezier(.23,1,.32,1)] active:scale-[0.97] hover:bg-amber-400 disabled:opacity-60 disabled:active:scale-100">
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                      Reconnecter
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button data-testid={`disconnect-${platform.id}`} title="Déconnecter"
                          className="shrink-0 inline-flex items-center justify-center w-[42px] rounded-xl border border-white/[0.07] text-slate-400 transition-all duration-150 ease-[cubic-bezier(.23,1,.32,1)] active:scale-[0.97] hover:text-white hover:border-white/20">
                          <Unplug className="w-4 h-4" />
                        </button>
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
                  </div>
                ) : isConnected ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button data-testid={`disconnect-${platform.id}`}
                        className="w-full inline-flex items-center justify-center gap-1.5 text-[13px] font-medium text-slate-400 rounded-xl px-4 py-2.5 border border-white/[0.07] bg-transparent transition-all duration-150 ease-[cubic-bezier(.23,1,.32,1)] active:scale-[0.97] hover:text-white hover:border-white/20 font-inter">
                        <Unplug className="w-3.5 h-3.5" />Déconnecter
                      </button>
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
                  <button disabled={isLoading} onClick={() => handleConnect(platform.id)} data-testid={`connect-${platform.id}`}
                    className="w-full inline-flex items-center justify-center gap-2 bg-[#e7ecf5] text-[#0b1322] font-inter font-medium text-[13px] rounded-xl px-4 py-2.5 transition-all duration-150 ease-[cubic-bezier(.23,1,.32,1)] active:scale-[0.97] hover:bg-white disabled:opacity-60 disabled:active:scale-100">
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                    Connecter
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
    );
  };

  const freqSummary = (s) => {
    const c = (s.days_of_week || []).length;
    if (!c) return 'Aucun jour';
    return `${c} post${c > 1 ? 's' : ''} / semaine`;
  };

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
            return (
              <div key={schedule.platform} data-testid={`schedule-card-${schedule.platform}`}
                className="rounded-2xl border border-white/[0.07] bg-slate-950/40 p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="w-[34px] h-[34px] rounded-[11px] grid place-items-center bg-[#0a1120] border border-white/[0.07]" style={{ color: pi.brand }}>
                      <pi.icon className="w-[17px] h-[17px]" />
                    </span>
                    <h3 className="text-white font-semibold font-sora text-[14.5px]">{pi.name}</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    {schedule.is_active && (
                      <span className="text-xs text-slate-500 font-inter tabular-nums hidden sm:inline">{freqSummary(schedule)}</span>
                    )}
                    <Switch checked={schedule.is_active}
                      onCheckedChange={(c) => handleScheduleChange(schedule.platform, 'is_active', c)}
                      data-testid={`schedule-toggle-${schedule.platform}`} />
                  </div>
                </div>
                {schedule.is_active && (
                  <div className="pt-3 border-t border-white/[0.06]">
                    <div className="flex items-end gap-8 flex-wrap">
                      <div>
                        <div className="text-xs text-slate-400 font-inter mb-2">Jours de publication</div>
                        <div className="flex gap-1.5">
                          {DAYS.map(day => {
                            const sel = (schedule.days_of_week || []).includes(day.value);
                            return (
                              <button key={day.value} type="button" onClick={() => handleToggleDay(schedule.platform, day.value)}
                                data-testid={`schedule-day-${schedule.platform}-${day.value}`}
                                title={day.label}
                                className={`w-[30px] h-[30px] rounded-[9px] grid place-items-center text-xs font-semibold font-inter transition-all duration-150 ${
                                  sel ? 'text-white border-0 shadow-[0_4px_12px_rgba(91,108,255,0.3)] bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF]'
                                    : 'bg-slate-950/50 text-slate-500 border border-white/[0.07] hover:border-slate-600'}`}>
                                {day.label.charAt(0)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 font-inter mb-2 flex items-center gap-1"><Clock className="w-3 h-3" /> Heure</div>
                        <input type="time" value={schedule.preferred_time || '09:00'}
                          onChange={(e) => handleScheduleChange(schedule.platform, 'preferred_time', e.target.value)}
                          data-testid={`schedule-time-${schedule.platform}`}
                          className="w-[120px] rounded-lg bg-slate-950/50 border border-white/[0.07] focus:border-[#5B6CFF] text-slate-200 text-sm px-3 py-2 outline-none" />
                      </div>
                    </div>
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
            className="bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] text-white hover:opacity-90 font-inter text-sm px-5 shadow-[0_8px_20px_rgba(91,108,255,0.35)]">
            {savingSchedules ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Enregistrer la planification
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
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/[0.07] bg-slate-950/40 p-5">
        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold font-inter mb-4">Palette de marque</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <ColorField label="Couleur Principale" name="couleur_principale" value={user?.couleur_principale} onChange={handleChange} />
          <ColorField label="Couleur Secondaire" name="couleur_secondaire" value={user?.couleur_secondaire} onChange={handleChange} />
          <ColorField label="Couleur Accent" name="couleur_accent" value={user?.couleur_accent} onChange={handleChange} />
        </div>
      </section>
      <div className="p-5 rounded-2xl border border-white/[0.07] bg-slate-950/40">
        <h3 className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold font-inter mb-3">Aperçu</h3>
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

      {/* Inspirations visuelles */}
      <div className="p-5 rounded-2xl border border-white/[0.07] bg-slate-950/40 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white font-sora">Inspirations visuelles</h3>
            <p className="text-xs text-slate-500 font-inter mt-0.5 leading-relaxed">
              Ajoutez des images dont vous aimez le style. L'IA s'en inspire (composition, couleurs, ambiance) pour générer vos visuels.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Switch checked={user?.use_inspirations ?? true} onCheckedChange={(c) => handleChange('use_inspirations', c)} data-testid="toggle-use-inspirations" />
              <span className="text-xs text-slate-400 font-inter">Utiliser mes inspirations à la génération</span>
            </div>
          </div>
          <input ref={inspiInputRef} type="file" accept="image/*" multiple onChange={handleInspiUpload} className="hidden" data-testid="input-inspiration" />
          <Button
            type="button" size="sm" onClick={() => inspiInputRef.current?.click()} disabled={uploadingInspi}
            className="bg-[#5B6CFF]/15 text-[#8A6CFF] hover:bg-[#5B6CFF]/25 border border-[#5B6CFF]/30 font-inter flex-shrink-0"
          >
            {uploadingInspi ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
            Ajouter
          </Button>
        </div>

        {!inspiLoaded ? (
          <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[#5B6CFF]" /></div>
        ) : inspirations.length === 0 ? (
          <p className="text-xs text-slate-600 font-inter py-4 text-center">Aucune inspiration pour l'instant. Ajoutez des images que vous aimez.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {inspirations.map((url) => (
              <div key={url} className="relative group aspect-square rounded-lg overflow-hidden border border-white/10">
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => handleInspiDelete(url)}
                  className="absolute top-1 right-1 w-6 h-6 rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-500/80"
                  title="Supprimer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Templates de marque */}
      <div className="p-5 rounded-2xl border border-white/[0.07] bg-slate-950/40 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white font-sora">Templates de marque</h3>
            <p className="text-xs text-slate-500 font-inter mt-0.5 leading-relaxed">
              Un style réutilisable (images de référence + note). Au moment de générer un visuel, choisissez un template pour garder vos posts cohérents.
            </p>
          </div>
          <Button type="button" size="sm" onClick={() => setTplOpen((v) => !v)}
            className="bg-[#3AFFA3]/15 text-[#3AFFA3] hover:bg-[#3AFFA3]/25 border border-[#3AFFA3]/30 font-inter flex-shrink-0">
            <Plus className="w-4 h-4 mr-1.5" />{tplOpen ? 'Annuler' : 'Nouveau'}
          </Button>
        </div>

        {/* Formulaire de création */}
        {tplOpen && (
          <div className="rounded-lg border border-white/10 bg-slate-900/50 p-3 space-y-3">
            <Input value={tplNom} onChange={(e) => setTplNom(e.target.value)} placeholder="Nom du template (ex. Citation, Promo…)"
              className="bg-slate-950/60 border-slate-800 text-slate-200 text-sm" maxLength={80} />
            <Textarea value={tplNote} onChange={(e) => setTplNote(e.target.value)} rows={2}
              placeholder="Note de style (optionnel) — ex. fond sombre, vert de la marque, texte gros, ambiance minimaliste…"
              className="bg-slate-950/60 border-slate-800 text-slate-200 text-sm" />
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="text-xs text-slate-400 font-inter">Images de référence du template ({tplImages.length} choisie{tplImages.length > 1 ? 's' : ''})</p>
                <input ref={tplInputRef} type="file" accept="image/*" multiple onChange={handleTplUpload} className="hidden" />
                <button type="button" onClick={() => tplInputRef.current?.click()} disabled={tplUploading}
                  className="text-xs text-[#3AFFA3] hover:text-white font-inter inline-flex items-center gap-1 disabled:opacity-50 flex-shrink-0">
                  {tplUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Ajouter une image
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {inspirations.map((url) => {
                  const on = tplImages.includes(url);
                  return (
                    <button key={url} type="button" onClick={() => toggleTplImage(url)}
                      className={`relative w-12 h-12 rounded-md overflow-hidden border-2 transition-all ${on ? 'border-[#3AFFA3]' : 'border-white/10 opacity-50 hover:opacity-80'}`}>
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      {on && <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-[#3AFFA3] text-[#0b1322] grid place-items-center text-[9px] font-bold">✓</span>}
                    </button>
                  );
                })}
                {inspirations.length === 0 && (
                  <p className="text-xs text-slate-600 font-inter">Aucune image. Clique sur « Ajouter une image » pour en importer.</p>
                )}
              </div>
            </div>
            <Button onClick={handleCreateTemplate} disabled={tplSaving || !tplNom.trim()} size="sm"
              className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white hover:opacity-90 font-inter">
              {tplSaving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />}Enregistrer le template
            </Button>
          </div>
        )}

        {/* Liste des templates */}
        {templates.length === 0 ? (
          <p className="text-xs text-slate-600 font-inter py-3 text-center">Aucun template pour l'instant.</p>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-white/8 bg-slate-900/40">
                <div className="flex -space-x-2 flex-shrink-0">
                  {(t.images || []).slice(0, 3).map((u) => (
                    <img key={u} src={u} alt="" className="w-9 h-9 rounded-md object-cover border border-slate-800" />
                  ))}
                  {(!t.images || t.images.length === 0) && <div className="w-9 h-9 rounded-md bg-slate-800 grid place-items-center"><ImageIcon className="w-4 h-4 text-slate-600" /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-200 font-medium truncate">{t.nom}</div>
                  {t.note && <div className="text-[11px] text-slate-500 truncate">{t.note}</div>}
                </div>
                <button onClick={() => handleDeleteTemplate(t.id)} title="Supprimer"
                  className="w-8 h-8 grid place-items-center rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 flex-shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderAvatar = () => {
    // Avatar vidéo IA (HeyGen) : mis en pause -> présenté comme fonctionnalité à venir.
    // Pour le réactiver plus tard : passer HEYGEN_AVATAR_ENABLED à true (voir haut du fichier).
    if (!HEYGEN_AVATAR_ENABLED) return (
      <div className="flex flex-col items-center justify-center text-center py-14 px-6 rounded-2xl border border-dashed border-white/10 bg-slate-950/30">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] flex items-center justify-center mb-4">
          <Video className="w-7 h-7 text-white" />
        </div>
        <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#8A6CFF]/15 text-[#b9a6ff] border border-[#8A6CFF]/30 uppercase tracking-wide">
          Bientôt disponible
        </span>
        <h3 className="text-white font-semibold font-sora text-lg mt-3">Avatar vidéo IA</h3>
        <p className="text-sm text-slate-400 font-inter mt-1.5 max-w-md">
          Génère des vidéos avec ton avatar IA à partir d'un simple texte. Cette fonctionnalité arrive prochainement — on te préviendra dès qu'elle est prête.
        </p>
      </div>
    );

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
          className="w-full py-2.5 px-4 rounded-lg font-medium font-inter text-[#0b1322] text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-[#e7ecf5] hover:bg-white"
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

  const upgrade = async (plan) => {
    try { await billingService.checkout(plan); }
    catch (e) { toast.error(e.response?.data?.detail || 'Paiement indisponible pour le moment.'); }
  };
  const manageBilling = async () => {
    try { await billingService.portal(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Portail indisponible.'); }
  };

  const renderAbonnement = () => {
    const isPro = (user?.plan || 'gratuit') === 'pro';
    return (
      <div className="space-y-5">
        {/* Jauge des résultats inclus (déplacée depuis l'Accueil) */}
        <QuotaGauge />

        <div className="flex items-center gap-4 flex-wrap p-4 rounded-2xl border border-[#5B6CFF]/25"
          style={{ background: 'linear-gradient(120deg, rgba(91,108,255,.13), rgba(138,108,255,.05))' }}>
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] grid place-items-center shrink-0 shadow-[0_8px_20px_rgba(91,108,255,.35)]">
            <CreditCard className="w-[21px] h-[21px] text-white" />
          </div>
          <div className="min-w-0">
            <div className="font-sora font-bold text-white text-[15px] flex items-center gap-2">
              Offre {isPro ? 'Pro' : 'Essai / Gratuit'}
              {isPro && <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#3AFFA3]/12 text-[#3AFFA3] border border-[#3AFFA3]/25">Actif</span>}
            </div>
            {isPro && user?.plan_cancel_at ? (
              <div className="text-xs text-amber-400 mt-1 font-inter">Résilié — actif jusqu'au {new Date(user.plan_cancel_at).toLocaleDateString('fr-FR')}</div>
            ) : isPro && user?.plan_renews_at ? (
              <div className="text-xs text-slate-400 mt-1 font-inter">Renouvellement le {new Date(user.plan_renews_at).toLocaleDateString('fr-FR')}</div>
            ) : null}
          </div>
          {isPro && (
            <Button size="sm" onClick={manageBilling} className="ml-auto bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10">
              <CreditCard className="w-4 h-4 mr-1.5" />Gérer
            </Button>
          )}
        </div>

        <div className="max-w-md">
          <div className="relative rounded-2xl border border-[#5B6CFF]/50 bg-[#5B6CFF]/[0.06] p-6 flex flex-col">
            <div className="font-semibold font-sora text-white text-lg">Pro</div>
            <div className="mt-1"><span className="text-3xl font-bold font-sora">{PRO_OFFER.price}</span><span className="text-sm text-slate-500"> /mois</span></div>
            <div className="text-xs text-slate-400 mt-3 font-inter uppercase tracking-wide">Inclus chaque mois</div>
            <ul className="mt-2 space-y-1.5">
              {PRO_OFFER.inclus.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[13px] text-slate-200 font-inter">
                  <Check className="w-3.5 h-3.5 text-[#3AFFA3] shrink-0 mt-0.5" />{f}
                </li>
              ))}
            </ul>
            <div className="text-xs text-slate-400 mt-4 font-inter uppercase tracking-wide">Et aussi</div>
            <ul className="mt-2 space-y-1.5 flex-1">
              {PRO_OFFER.feats.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[12.5px] text-slate-400 font-inter">
                  <Check className="w-3.5 h-3.5 text-[#3AFFA3] shrink-0 mt-0.5" />{f}
                </li>
              ))}
            </ul>
            <div className="mt-5">
              {isPro ? (
                <div className="text-center text-[12.5px] text-slate-500 py-2 border border-white/[0.06] rounded-lg">Ton forfait actuel</div>
              ) : (
                <Button onClick={() => upgrade('pro')}
                  className="w-full bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white hover:opacity-90">
                  Passer Pro
                </Button>
              )}
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-500 font-inter flex items-center gap-1.5"><Info className="w-3.5 h-3.5" />Paiement sécurisé par Stripe · annulable à tout moment.</p>

        {/* Factures */}
        <InvoicesList />
      </div>
    );
  };

  const sectionRenderers = {
    identity: renderIdentity,
    marque: renderMarque,
    connections: renderConnections,
    schedules: renderSchedules,
    abonnement: renderAbonnement,
    style: renderStyle,
    avatar: renderAvatar,
  };

  const currentSection = SETTINGS_SECTIONS.find(s => s.id === activeSection);

  return (
    <div className="h-full">
      {/* Header */}
      <PageHeader
        icon={Settings}
        title="Paramètres"
        subtitle="Gérez votre profil, votre marque et vos connexions"
        actions={
          <>
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
              className="bg-[#e7ecf5] text-[#0b1322] hover:bg-white font-inter text-xs">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
              Sauvegarder
            </Button>
          </>
        }
      />

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

      {/* Contenu — pleine largeur (la navigation des sections vit dans le sidebar du shell) */}
      <div className="w-full">

        {/* Sélecteur de section (mobile — le sidebar desktop porte la sous-nav) */}
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

        {/* Panneau de contenu */}
        <div className="min-w-0">
          <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a] p-6 md:p-7">
            {/* Section title */}
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/[0.06]">
              {currentSection && (
                <>
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-[#5B6CFF]/20 to-[#8A6CFF]/20 border border-[#5B6CFF]/20">
                    <currentSection.icon className="w-[18px] h-[18px] text-[#8A6CFF]" />
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
