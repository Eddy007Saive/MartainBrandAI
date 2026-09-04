import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import {
  User, Link, Key, Palette, Save, Loader2, Trash2, AlertTriangle, Info,
  Plug, Check, ExternalLink, Unplug, Calendar, Clock, Video, Upload,
  CheckCircle, XCircle, AlertCircle, ChevronRight, Megaphone, Settings, CreditCard, Sparkles,
  Plus, Image as ImageIcon, X, Repeat, Lock, Package, Pencil } from 'lucide-react';
import { Button } from '../components/ui/button';
import { ChampMarque, ChampListe } from '../components/ChampsMarque';
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
import { track } from '../lib/analytics';
import InvoicesList from '../components/InvoicesList';
import { COMMON_TIMEZONES } from '../lib/tz';
import { PageHeader } from '../components/PageHeader';
import { userService } from '../services/userService';
import RemplirDepuisSite from '../components/RemplirDepuisSite';
import { billingService } from '../services/billingService';
import { useAbonnement } from '../context/AbonnementContext';
import Resiliation from '../components/Resiliation';
import { scheduleService } from '../services/scheduleService';
import { heygenService } from '../services/heygenService';
import { contenuService } from '../services/contenuService';
import { templateService } from '../services/templateService';
import { offersService } from '../services/offersService';
import { logout, removeToken, setToken } from '../lib/auth';
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
  { id: 'identity', titleKey: 'nav.identity', icon: User },
  { id: 'marque', titleKey: 'nav.brandVoice', icon: Megaphone },
  { id: 'offres', titleKey: 'nav.offers', icon: Package },
  { id: 'connections', titleKey: 'nav.socials', icon: Plug },
  { id: 'schedules', titleKey: 'nav.planning', icon: Calendar },
  { id: 'abonnement', titleKey: 'nav.subscription', icon: CreditCard },
  { id: 'style', titleKey: 'nav.style', icon: Palette },
  { id: 'banque', titleKey: 'nav.banque', icon: ImageIcon },
  { id: 'avatar', titleKey: 'nav.avatar', icon: Video, soon: true },
];

// Offre unique Pro (le détail des quotas est paramétrable en admin)
const PRO_OFFER = {
  price: '279€',
  inclus: ['params.abonnement.inclus1', 'params.abonnement.inclus2', 'params.abonnement.inclus3', 'params.abonnement.inclus4', 'params.abonnement.inclus5'],
  feats: ['params.abonnement.feats1', 'params.abonnement.feats2', 'params.abonnement.feats3', 'params.abonnement.feats4'],
};

const AVATAR_STATUS = {
  pending: { labelKey: 'params.avatar.statutPending', color: 'text-amber-400', bg: 'bg-amber-400/10', icon: Clock },
  in_progress: { labelKey: 'params.avatar.statutInProgress', color: 'text-yellow-400', bg: 'bg-yellow-400/10', icon: Loader2 },
  complete: { labelKey: 'params.avatar.statutComplete', color: 'text-emerald-400', bg: 'bg-emerald-400/10', icon: CheckCircle },
  failed: { labelKey: 'params.avatar.statutFailed', color: 'text-red-400', bg: 'bg-red-400/10', icon: XCircle },
};

// --- FileDropZone ---
function FileDropZone({ label, description, accept, file, onFileChange, id }) {
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type.startsWith('video/')) onFileChange(dropped);
    else toast.error(t('params.avatar.deposerVideo'));
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
          <p className="text-[#5B6CFF] text-xs font-inter">{t('params.avatar.cliquerChanger')}</p>
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

// Carte de section. Le liseré de lumière en haut est ce qui souleve une
// surface sombre : une ombre noire sur un fond noir ne se voit pas.
function Bloc({ titre, sous, phare, children }) {
  return (
    <section className={`relative rounded-2xl border p-5 ${phare
      ? 'border-[#5B6CFF]/[0.28] bg-gradient-to-b from-[#5B6CFF]/[0.06] to-[#5B6CFF]/[0.02] shadow-[inset_0_1px_0_rgba(160,175,255,0.1),0_1px_2px_rgba(0,0,0,0.35),0_16px_40px_-14px_rgba(91,108,255,0.28)]'
      : 'border-white/[0.07] bg-[#0f172a] shadow-[inset_0_1px_0_rgba(255,255,255,0.045),0_1px_2px_rgba(0,0,0,0.35),0_6px_18px_-6px_rgba(0,0,0,0.5)]'}`}>
      {titre && (
        <div className="mb-4">
          <div className="font-sora text-[14px] font-bold text-white">{titre}</div>
          {sous && <p className="text-[12.5px] text-slate-500 font-inter mt-1 max-w-[56ch]">{sous}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

// Wrapper « label + enfant libre » : contrairement à <Field/> (qui rend son
// propre Input et attend onChange(name, value)), Champ n'impose rien sur le
// contrôle enfant — pour les formulaires mêlant Input / Select / Textarea.
function Champ({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-300 font-inter">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-500 font-inter">{hint}</p>}
    </div>
  );
}

export default function ParametresPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, setUser, refetchUser } = useUser();
  // L'abonnement reel (Stripe), pas la colonne `plan` qui n'existe plus.
  const { usage, recharger: rechargerAbo } = useAbonnement();
  const [resilOuvert, setResilOuvert] = useState(false);
  const [saving, setSaving] = useState(false);
  // Section active pilotée par l'URL (?s=) -> synchronisée avec la sous-nav du sidebar (DashboardLayout)
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection = searchParams.get('s') || 'identity';
  const setActiveSection = (id) => setSearchParams({ s: id });
  const [connecting, setConnecting] = useState(null);
  const [socialMeta, setSocialMeta] = useState({}); // {platform: {username, name, avatar, url, followers}}
  const [exReseau, setExReseau] = useState('linkedin');
  // Offres / produits du client
  const [offres, setOffres] = useState([]);
  const [offresLoaded, setOffresLoaded] = useState(false);
  const OFFRE_VIDE = { name: '', type: 'service', price: '', description: '', benefits: '', url: '' };
  const [offreForm, setOffreForm] = useState(OFFRE_VIDE);
  const [offreEditId, setOffreEditId] = useState(null); // id en édition, ou null (création)
  const [offreSaving, setOffreSaving] = useState(false);
  useEffect(() => {
    if (activeSection === 'offres' && !offresLoaded) {
      offersService.list().then((d) => { setOffres(d || []); setOffresLoaded(true); }).catch(() => setOffresLoaded(true));
    }
  }, [activeSection, offresLoaded]);
  // Reference du dernier etat enregistre : sert a savoir s'il reste quelque
  // chose a sauvegarder, et donc a afficher la barre du bas.
  const [refSauve, setRefSauve] = useState(null);
  useEffect(() => {
    if (user && refSauve === null) setRefSauve(JSON.stringify(user));
  }, [user, refSauve]);
  const nonEnregistre = refSauve !== null && !!user && JSON.stringify(user) !== refSauve;

  // Schedules
  const connectedPlatforms = SOCIAL_PLATFORMS.filter(p => user?.[p.field]);
  // Un compte en essai a droit a UN reseau : le temps de voir le produit
  // de bout en bout — generer, planifier, publier, lire les commentaires —
  // sans qu'un compte qui ne restera peut-etre pas coute six connexions.
  const essaiUnSeulReseau = usage?.subscription?.status === 'trialing'
    && connectedPlatforms.length >= 1;
  useEffect(() => {
    if (activeSection === 'connections' && connectedPlatforms.length) {
      userService.socialAccounts().then((d) => setSocialMeta(d.accounts || {})).catch(() => {});
    }
  }, [activeSection, connectedPlatforms.length]);
  const [schedules, setSchedules] = useState([]);
  const [schedulesLoaded, setSchedulesLoaded] = useState(false);
  const [savingSchedules, setSavingSchedules] = useState(false);

  // Banque d'images de la marque — chargée à l'ouverture de l'onglet seulement.
  const [banque, setBanque] = useState(null);          // null = pas encore chargée
  const [banqueUpload, setBanqueUpload] = useState(false);
  useEffect(() => {
    if (activeSection !== 'banque' || banque !== null) return;
    contenuService.reelBanque().then(setBanque).catch(() => setBanque([]));
  }, [activeSection, banque]);

  const ajouterALaBanque = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setBanqueUpload(true);
    try {
      for (const f of list) {
        const a = await contenuService.reelBanqueAjouter(f);
        setBanque((prev) => [a, ...(prev || [])]);
      }
      toast.success(t('params.banque.ajoutee', { n: list.length }));
    } catch (e) {
      toast.error(e.response?.data?.detail || t('params.banque.echec'));
    } finally { setBanqueUpload(false); }
  };

  const supprimerDeLaBanque = async (img) => {
    const avant = banque;
    setBanque((prev) => (prev || []).filter((x) => x.id !== img.id));   // retrait optimiste
    try {
      await contenuService.reelBanqueSupprimer(img.id);
    } catch (e) {
      setBanque(avant);
      toast.error(e.response?.data?.detail || t('params.banque.echecSuppr'));
    }
  };

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
        if (!f.type.startsWith('image/')) { toast.error(t('params.commun.pasUneImage', { name: f.name })); continue; }
        if (f.size > 10 * 1024 * 1024) { toast.error(t('params.commun.tropLourde', { name: f.name })); continue; }
        latest = await userService.addInspiration(f);
      }
      if (latest) {
        const urls = latest.images || [];
        const news = urls.filter((u) => !inspirations.includes(u));
        setInspirations(urls);
        setTplImages((prev) => [...prev, ...news]); // auto-sélectionne les nouvelles
        toast.success(t('params.style.imageAjoutee'));
      }
    } catch (err) {
      toast.error(t('params.commun.echecUpload'));
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
        .then(() => { toast.success(t('params.abonnement.activeToast')); refetchUser?.(); })
        .catch(() => {})
        .finally(() => window.history.replaceState({}, '', window.location.pathname));
    } else if (params.get('paiement') === 'annule') {
      toast.info(t('params.abonnement.paiementAnnule'));
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
    if (!tplNom.trim()) { toast.error(t('params.style.donneNom')); return; }
    setTplSaving(true);
    try {
      const created = await templateService.create({ nom: tplNom.trim(), images: tplImages, note: tplNote.trim() });
      setTemplates((p) => [created, ...p]);
      setTplNom(''); setTplNote(''); setTplImages([]); setTplOpen(false);
      toast.success(t('params.style.templateCree'));
    } catch (err) {
      toast.error(t('params.style.echecCreation'));
    } finally {
      setTplSaving(false);
    }
  };

  const handleDeleteTemplate = async (id) => {
    try {
      await templateService.remove(id);
      setTemplates((p) => p.filter((t) => t.id !== id));
    } catch (err) {
      toast.error(t('params.commun.echecSuppression'));
    }
  };

  const handleInspiUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploadingInspi(true);
    try {
      let latest;
      for (const f of files) {
        if (!f.type.startsWith('image/')) { toast.error(t('params.commun.pasUneImage', { name: f.name })); continue; }
        if (f.size > 10 * 1024 * 1024) { toast.error(t('params.commun.tropLourde', { name: f.name })); continue; }
        latest = await userService.addInspiration(f);
      }
      if (latest) { setInspirations(latest.images || []); toast.success(t('params.style.inspirationAjoutee')); }
    } catch (err) {
      toast.error(t('params.commun.echecUpload'));
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
      toast.error(t('params.commun.echecSuppression'));
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
      toast.success(t('params.planif.sauvegardee'));
    } catch (error) {
      toast.error(t('params.planif.erreurSauvegarde'));
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
    if (!trainingVideo) { toast.error(t('params.avatar.ajouterVideo')); return; }
    setCreating(true);
    try {
      const formData = new FormData();
      formData.append('training_video', trainingVideo);
      formData.append('description', avatarDescription);
      await heygenService.createAvatar(formData);
      toast.success(t('params.avatar.demandeSoumise'));
      setTrainingVideo(null);
      setAvatarDescription('');
      await fetchAvatar();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('params.avatar.erreurSoumission'));
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteAvatar = async () => {
    if (!window.confirm(t('params.avatar.confirmSupprimer'))) return;
    setDeleting(true);
    try {
      await heygenService.deleteAvatar();
      setAvatar(null);
      toast.success(t('params.avatar.supprime'));
    } catch (error) {
      toast.error(t('params.avatar.erreurSuppression'));
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
    if (!file.type.startsWith('image/')) { toast.error(t('params.identite.choisirImage')); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error(t('params.identite.imageTropLourde')); return; }
    setUploadingPhoto(true);
    try {
      const { photo_url } = await userService.uploadPhoto(file);
      handleChange('photo_url', photo_url);
      toast.success(t('params.identite.photoMaj'));
    } catch (err) {
      toast.error(err?.response?.data?.detail || t('params.identite.echecUploadPhoto'));
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
    if (!file.type.startsWith('image/')) { toast.error(t('params.identite.choisirImage')); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error(t('params.identite.imageTropLourde')); return; }
    setUploadingAvatar(true);
    try {
      const { avatar_url } = await userService.uploadAvatar(file);
      handleChange('avatar_url', avatar_url);
      toast.success(t('params.identite.avatarMaj'));
    } catch (err) {
      toast.error(err?.response?.data?.detail || t('params.identite.echecUploadAvatar'));
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
    if (!pwdOld || !pwdNew) { toast.error(t('params.identite.remplirDeuxChamps')); return; }
    if (pwdNew.length < 6) { toast.error(t('params.identite.mdpTropCourt')); return; }
    setChangingPwd(true);
    try {
      const data = await userService.changePassword(pwdOld, pwdNew);
      // Le mot de passe EST change a ce stade. Si le jeton de rafraichissement
      // est inutilisable, setToken leve : on ne doit pas pour autant annoncer
      // un echec — on termine proprement la session au lieu de mentir.
      try {
        if (data?.token) setToken(data.token);  // garde CET appareil connecté ; les autres seront déconnectés
      } catch {
        logout();
        window.location.href = '/login';
        return;
      }
      toast.success(t('params.identite.mdpChange'));
      setPwdOld(''); setPwdNew('');
    } catch (err) {
      toast.error(err?.response?.data?.detail || t('params.identite.echecChangementMdp'));
    } finally {
      setChangingPwd(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error(t('params.identite.choisirImageLogo')); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error(t('params.identite.imageTropLourde')); return; }
    setUploadingLogo(true);
    try {
      const { logo_url } = await userService.uploadLogo(file);
      handleChange('logo_url', logo_url);
      toast.success(t('params.identite.logoMaj'));
    } catch (err) {
      toast.error(err?.response?.data?.detail || t('params.identite.echecUploadLogo'));
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
      toast.success(t('params.identite.logoRetire'));
    } catch (err) {
      toast.error(t('params.identite.echecSuppressionLogo'));
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await userService.updateMe(user);
      setUser(data);
      setRefSauve(JSON.stringify(data));
      toast.success(t('params.entete.profilMisAJour'));
    } catch (error) {
      toast.error(t('params.entete.erreurSauvegarde'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await userService.deleteMe();
      removeToken();
      toast.success(t('params.entete.compteSupprime'));
      navigate('/login');
    } catch (error) {
      toast.error(t('params.entete.erreurSuppressionCompte'));
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
    track('reseau_connexion_lancee', { reseau: platform });
    try {
      const data = await userService.connectPlatform(platform);
      if (data.success && data.authUrl) openOAuthPopup(data.authUrl, platform);
      else toast.error(data.error || t('params.reseaux.erreurConnexion'), { duration: 6000 });
    } catch (error) {
      toast.error(error.response?.data?.detail || t('params.reseaux.serveurInjoignable'), { duration: 6000 });
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
        toast.success(t('params.reseaux.deconnecteToast', { platform: platform.charAt(0).toUpperCase() + platform.slice(1) }));
      } else {
        toast.error(data.error || t('params.reseaux.erreurDeconnexion'), { duration: 6000 });
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || t('params.reseaux.erreurDeconnexion'), { duration: 6000 });
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
        <p className="text-sm text-slate-400 font-inter">{t('params.commun.chargement')}</p>
      </div>
    );
  }

  // --- Section renderers ---
  const renderIdentity = () => (
    <div className="space-y-5">
      {/* ---- MÉDIAS : avatar, photo, logo ---- */}
      <section className="rounded-2xl border border-white/[0.07] bg-slate-950/40">
        <div className="px-5 pt-4 pb-1 text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold font-inter">{t('params.identite.medias')}</div>
        <div className="px-5 divide-y divide-white/[0.06]">
          {/* Avatar (menu) */}
          <div className="flex items-center gap-4 py-4">
            <div className="relative w-14 h-14 rounded-full overflow-hidden bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] grid place-items-center flex-shrink-0 ring-1 ring-white/15">
              {user?.avatar_url
                ? <img src={user.avatar_url} alt={t('params.identite.avatarAlt')} className="w-full h-full object-cover" />
                : <span className="text-white text-lg font-semibold font-sora">{(user?.nom || user?.username || 'U').charAt(0).toUpperCase()}</span>}
              {uploadingAvatar && <div className="absolute inset-0 bg-black/60 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-white" /></div>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-medium text-white font-sora">{t('params.identite.avatar')}</p>
              <p className="text-[11.5px] text-slate-500 font-inter">{t('params.identite.avatarDesc')}</p>
            </div>
            <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
            <Button type="button" size="sm" onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar}
              className="bg-[#5B6CFF]/15 text-[#8A6CFF] hover:bg-[#5B6CFF]/25 border border-[#5B6CFF]/30 font-inter shrink-0">
              <Upload className="w-4 h-4 mr-1.5" />{user?.avatar_url ? t('params.commun.changer') : t('params.commun.importer')}
            </Button>
          </div>

          {/* Photo de profil + toggle */}
          <div className="flex items-center gap-4 py-4 flex-wrap">
            <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-slate-800/60 border border-white/10 grid place-items-center flex-shrink-0">
              {user?.photo_url ? <img src={user.photo_url} alt={t('params.identite.photoProfil')} className="w-full h-full object-cover" /> : <User className="w-6 h-6 text-slate-600" />}
              {uploadingPhoto && <div className="absolute inset-0 bg-black/60 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-white" /></div>}
            </div>
            <div className="flex-1 min-w-[180px]">
              <p className="text-[13.5px] font-medium text-white font-sora">{t('params.identite.photoProfil')}</p>
              <p className="text-[11.5px] text-slate-500 font-inter">{t('params.identite.photoProfilDesc')}</p>
            </div>
            <div className="flex items-center gap-2 mr-1">
              <Label className="text-[12.5px] font-medium text-slate-400 font-inter">{t('params.identite.utiliser')}</Label>
              <Switch checked={user?.use_photo || false} onCheckedChange={(c) => handleChange('use_photo', c)} data-testid="toggle-use-photo" />
            </div>
            <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" data-testid="input-photo" />
            <Button type="button" size="sm" onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}
              className="bg-[#5B6CFF]/15 text-[#8A6CFF] hover:bg-[#5B6CFF]/25 border border-[#5B6CFF]/30 font-inter shrink-0">
              <Upload className="w-4 h-4 mr-1.5" />{user?.photo_url ? t('params.commun.changer') : t('params.commun.importer')}
            </Button>
          </div>

          {/* Logo de marque */}
          <div className="flex items-center gap-4 py-4 flex-wrap">
            <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-white/90 border border-white/10 grid place-items-center flex-shrink-0">
              {user?.logo_url ? <img src={user.logo_url} alt={t('params.identite.logoAlt')} className="w-full h-full object-contain p-1.5" /> : <span className="text-[10px] font-semibold text-slate-400 font-sora">LOGO</span>}
              {uploadingLogo && <div className="absolute inset-0 bg-black/60 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-white" /></div>}
            </div>
            <div className="flex-1 min-w-[180px]">
              <p className="text-[13.5px] font-medium text-white font-sora">{t('params.identite.logoMarque')}</p>
              <p className="text-[11.5px] text-slate-500 font-inter">{t('params.identite.logoMarqueDesc')}</p>
            </div>
            {user?.logo_url && (
              <button type="button" onClick={handleLogoDelete} disabled={uploadingLogo}
                className="text-[12px] text-slate-500 hover:text-red-400 font-inter transition-colors shrink-0">{t('params.commun.retirer')}</button>
            )}
            <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" data-testid="input-logo" />
            <Button type="button" size="sm" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}
              className="bg-[#5B6CFF]/15 text-[#8A6CFF] hover:bg-[#5B6CFF]/25 border border-[#5B6CFF]/30 font-inter shrink-0">
              <Upload className="w-4 h-4 mr-1.5" />{user?.logo_url ? t('params.commun.changer') : t('params.commun.importer')}
            </Button>
          </div>
        </div>
      </section>

      {/* ---- INFORMATIONS ---- */}
      <section className="rounded-2xl border border-white/[0.07] bg-slate-950/40 p-5">
        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold font-inter mb-4">{t('params.identite.informations')}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-4">
          <Field label={t('params.identite.nom')} name="nom" value={user?.nom} onChange={handleChange}
            hint={t('params.identite.nomHint')} />
          <Field label={t('params.identite.username')} name="username" value={user?.username} onChange={handleChange}
            hint={t('params.identite.usernameHint')} />
          <Field label={t('params.identite.email')} name="email" value={user?.email} onChange={handleChange} readOnly />
          <Field label={t('params.identite.nomAffiche')} name="user_name" value={user?.user_name} onChange={handleChange}
            hint={t('params.identite.nomAfficheHint')} />
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-300 font-inter">{t('params.identite.sexe')}</Label>
            <Select value={user?.sexe || ''} onValueChange={(v) => handleChange('sexe', v)}>
              <SelectTrigger data-testid="field-sexe" className="bg-slate-950/50 border-slate-800 focus:border-[#5B6CFF] text-slate-200">
                <SelectValue placeholder={t('params.identite.selectionner')} />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800">
                <SelectItem value="homme" className="text-slate-200 focus:bg-slate-800">{t('params.identite.homme')}</SelectItem>
                <SelectItem value="femme" className="text-slate-200 focus:bg-slate-800">{t('params.identite.femme')}</SelectItem>
                <SelectItem value="autre" className="text-slate-200 focus:bg-slate-800">{t('params.identite.autre')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Field label={t('params.identite.styleVestimentaire')} name="style_vestimentaire" value={user?.style_vestimentaire} onChange={handleChange}
            hint={t('params.identite.styleVestimentaireHint')} />
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-300 font-inter">{t('params.identite.fuseau')}</Label>
            <Select value={user?.timezone || 'Europe/Paris'} onValueChange={(v) => handleChange('timezone', v)}>
              <SelectTrigger data-testid="field-timezone" className="bg-slate-950/50 border-slate-800 focus:border-[#5B6CFF] text-slate-200">
                <SelectValue placeholder={t('params.identite.selectionner')} />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 max-h-72">
                {COMMON_TIMEZONES.map((t) => (
                  <SelectItem key={t.value} value={t.value} className="text-slate-200 focus:bg-slate-800">{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-slate-500 font-inter">{t('params.identite.fuseauHint')}</p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-300 font-inter">{t('params.identite.langueContenu')}</Label>
            <Select value={user?.langue || 'fr'} onValueChange={(v) => handleChange('langue', v)}>
              <SelectTrigger data-testid="field-langue" className="bg-slate-950/50 border-slate-800 focus:border-[#5B6CFF] text-slate-200">
                <SelectValue placeholder={t('params.identite.selectionner')} />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800">
                <SelectItem value="fr" className="text-slate-200 focus:bg-slate-800">🇫🇷 Français</SelectItem>
                <SelectItem value="en" className="text-slate-200 focus:bg-slate-800">🇬🇧 English</SelectItem>
                <SelectItem value="es" className="text-slate-200 focus:bg-slate-800">🇪🇸 Español</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-slate-500 font-inter">{t('params.identite.langueContenuHint')}</p>
          </div>
        </div>
      </section>

      {/* ---- SÉCURITÉ ---- */}
      <section className="rounded-2xl border border-white/[0.07] bg-slate-950/40 p-5 space-y-3">
        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold font-inter">{t('params.identite.securite')}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input type="password" value={pwdOld} onChange={(e) => setPwdOld(e.target.value)} placeholder={t('params.identite.mdpActuel')}
            className="bg-slate-950/50 border-slate-800 text-slate-200 focus:border-[#5B6CFF]" />
          <Input type="password" value={pwdNew} onChange={(e) => setPwdNew(e.target.value)} placeholder={t('params.identite.mdpNouveau')}
            className="bg-slate-950/50 border-slate-800 text-slate-200 focus:border-[#5B6CFF]" />
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={handleChangePassword} disabled={changingPwd || !pwdOld || !pwdNew}
            className="bg-[#5B6CFF]/15 text-[#8A6CFF] hover:bg-[#5B6CFF]/25 border border-[#5B6CFF]/30 font-inter">
            {changingPwd ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}{t('params.identite.changerMdp')}
          </Button>
        </div>
      </section>
    </div>
  );

  // Ce qui compte pour la jauge : les huit champs de fond, plus « au moins un
  // exemple de post » — quatre reseaux remplis ne valent pas huit fois mieux.
  const CHAMPS_MARQUE = ['secteur', 'audience', 'voix_marque', 'a_eviter',
    'piliers', 'hooks', 'ctas', 'regles'];
  const RESEAUX_EX = [
    { id: 'linkedin', label: 'LinkedIn' },
    { id: 'instagram', label: 'Instagram' },
    { id: 'facebook', label: 'Facebook' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'googlebusiness', label: 'Fiche Google' },
    { id: 'twitter', label: 'Twitter/X' },
  ];

  const renderMarque = () => {
    const remplis = CHAMPS_MARQUE.filter((c) => String(user?.[c] || '').trim()).length
      + (RESEAUX_EX.some((r) => String(user?.[`exemples_${r.id}`] || '').trim()) ? 1 : 0);
    const total = CHAMPS_MARQUE.length + 1;

    return (
      <div className="space-y-3.5" data-testid="section-marque">
        {/* L'avancement : une fiche de marque se remplit en plusieurs fois, il
            faut pouvoir savoir ou on en est sans tout relire. */}
        <div className="flex items-end justify-between gap-5">
          <p className="text-[13px] text-slate-400 font-inter max-w-[52ch]">
            <Trans i18nKey="params.marque.intro" components={{ studio: <span className="text-white font-medium" /> }} />
          </p>
          <div className="text-right flex-shrink-0">
            <b className="font-sora text-[15px] text-white font-bold tabular-nums">{remplis}</b>
            <span className="block text-[12px] text-slate-500 font-inter">{t('params.marque.surTotal', { total })}</span>
          </div>
        </div>
        <div className="h-[3px] rounded-full bg-white/[0.07] overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF]
                          transition-[width] [transition-duration:420ms] ease-out-strong"
            style={{ width: `${Math.round((remplis / total) * 100)}%` }} />
        </div>


        {/* POSITIONNEMENT */}
        {/* Pré-remplissage depuis le site du client : le moyen le plus rapide de passer
            l'étape « Décris ta marque » du démarrage (les champs restent modifiables). */}
        <RemplirDepuisSite user={user} onChange={handleChange}
          onRefetch={() => userService.getMe().then((d) => setUser(d)).catch(() => {})} />

        <Bloc titre={t('params.marque.positionnement')} sous={t('params.marque.positionnementSous')}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ChampMarque multi={false} label={t('params.marque.secteur')} name="secteur"
              value={user?.secteur} onChange={handleChange} hint={t('params.marque.secteurHint')}
              placeholder={t('params.marque.secteurPlaceholder')} />
            <ChampMarque multi={false} label={t('params.marque.audience')} name="audience"
              value={user?.audience} onChange={handleChange} hint={t('params.marque.audienceHint')}
              placeholder={t('params.marque.audiencePlaceholder')} />
          </div>
        </Bloc>

        {/* VOIX & TON */}
        <Bloc titre={t('params.marque.voixContenu')} sous={t('params.marque.voixContenuSous')}>
          <div className="space-y-4">
            <ChampMarque label={t('params.marque.voixTon')} name="voix_marque" lignes={3}
              value={user?.voix_marque} onChange={handleChange} hint={t('params.marque.voixTonHint')}
              placeholder={t('params.marque.voixTonPlaceholder')} />
            <ChampMarque label={t('params.marque.aEviter')} name="a_eviter" lignes={2}
              value={user?.a_eviter} onChange={handleChange} hint={t('params.marque.aEviterHint')}
              placeholder={t('params.marque.aEviterPlaceholder')} />
          </div>
        </Bloc>

        {/* MATIERE A ECRIRE — trois listes, une idee par ligne */}
        <Bloc titre={t('params.marque.matiere')} sous={t('params.marque.matiereSous')}>
          <div className="space-y-6">
            <ChampListe label={t('params.marque.piliers')} name="piliers" value={user?.piliers}
              onChange={handleChange} hint={t('params.marque.piliersHint')}
              placeholders={t('params.marque.piliersEx', { returnObjects: true })}
              ajouter={{ label: t('params.marque.ajouterPilier'), retirer: t('params.commun.supprimer') }} />
            <ChampListe label={t('params.marque.hooks')} name="hooks" value={user?.hooks}
              onChange={handleChange} hint={t('params.marque.hooksHint')}
              placeholders={t('params.marque.hooksEx', { returnObjects: true })}
              ajouter={{ label: t('params.marque.ajouterHook'), retirer: t('params.commun.supprimer') }} />
            <ChampListe label={t('params.marque.ctas')} name="ctas" value={user?.ctas}
              onChange={handleChange} hint={t('params.marque.ctasHint')}
              placeholders={t('params.marque.ctasEx', { returnObjects: true })}
              ajouter={{ label: t('params.marque.ajouterCta'), retirer: t('params.commun.supprimer') }} />
          </div>
        </Bloc>

        {/* REGLES EDITORIALES — la bible. Ombre teintee plutot que plus forte :
            la couleur suffit a la faire ressortir sans la faire flotter. */}
        <Bloc phare titre={t('params.marque.regles')} sous={t('params.marque.reglesHint')}>
          <ChampMarque name="regles" lignes={6} value={user?.regles} onChange={handleChange}
            placeholder={t('params.marque.reglesPlaceholder')} />
        </Bloc>

        {/* EXEMPLES PAR RESEAU */}
        <Bloc titre={t('params.marque.exemplesTitre')} sous={t('params.marque.exemplesIntroCourt')}>
          <div className="flex flex-wrap gap-[7px] mb-3">
            {RESEAUX_EX.map((r) => {
              const actif = exReseau === r.id;
              return (
                <button key={r.id} type="button" onClick={() => setExReseau(r.id)}
                  role="tab" aria-selected={actif} data-testid={`exemples-tab-${r.id}`}
                  className={`inline-flex items-center gap-1.5 rounded-[9px] border px-3 py-1.5 text-[12.5px]
                              font-medium font-inter active:scale-[0.97]
                              transition-[color,border-color,background-color,transform,box-shadow]
                              duration-150 ease-out-strong ${actif
                    ? 'bg-[#5B6CFF]/[0.14] border-[#5B6CFF]/50 text-white shadow-[inset_0_1px_0_rgba(160,175,255,0.16),0_4px_12px_-4px_rgba(91,108,255,0.4)]'
                    : 'border-white/[0.07] text-slate-400 hover:text-white hover:border-white/[0.14]'}`}>
                  {r.label}
                  {/* Une pastille sur l'onglet rempli : on voit ce qui reste sans cliquer. */}
                  {!!String(user?.[`exemples_${r.id}`] || '').trim()
                    && <span className="w-[5px] h-[5px] rounded-full bg-[#3AFFA3]" />}
                </button>
              );
            })}
          </div>
          <ChampMarque name={`exemples_${exReseau}`} lignes={6}
            value={user?.[`exemples_${exReseau}`]} onChange={handleChange}
            placeholder={t('params.marque.exemplesPlaceholder', {
              reseau: RESEAUX_EX.find((r) => r.id === exReseau)?.label || exReseau })} />
        </Bloc>
      </div>
    );
  };

  const CONNECT_HINTS = {
    instagram: 'params.reseaux.hintInstagram',
    facebook: 'params.reseaux.hintFacebook',
    linkedin: 'params.reseaux.hintLinkedin',
    youtube: 'params.reseaux.hintYoutube',
    tiktok: 'params.reseaux.hintTiktok',
    googlebusiness: 'params.reseaux.hintGooglebusiness',
    twitter: 'params.reseaux.hintTwitter',
  };

  const renderConnections = () => {
    const total = SOCIAL_PLATFORMS.length;
    const nb = connectedPlatforms.length;
    return (
    <div className="space-y-5" data-testid="section-connections">
      {/* En-tête + récap de connexion segmenté */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-sm text-slate-400 font-inter max-w-md leading-relaxed">
          {t('params.reseaux.intro')}
        </p>
        <div className="text-right shrink-0">
          <div className="text-[13px] font-sora font-semibold text-slate-200">
            <span className="text-[#3AFFA3]">{nb}</span> {t('params.reseaux.connectes', { count: nb })}
            <span className="text-slate-600"> · {total - nb} {t('params.reseaux.disponibles', { count: total - nb })}</span>
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
          // Pendant l'essai : un seul réseau. Les autres se grisent dès qu'un
          // est connecté, et se débloquent au premier prélèvement. Le serveur
          // applique la même règle — griser un bouton n'empêche personne
          // d'appeler l'API, ceci n'est que la politesse de le dire avant.
          const bloqueParEssai = essaiUnSeulReseau && !isConnected;
          const isLoading = connecting === platform.id;
          const meta = socialMeta[platform.id] || {};
          // Zernio signale un token expiré/révoqué via is_active=false -> le compte doit être RECONNECTÉ
          const needsReconnect = isConnected && meta.is_active === false;
          const hint = CONNECT_HINTS[platform.id] ? t(CONNECT_HINTS[platform.id]) : t('params.reseaux.hintDefault');
          return (
            <div key={platform.id} data-testid={`connect-card-${platform.id}`}
              className={`group relative overflow-hidden rounded-2xl border bg-[#0f172a] p-5 flex flex-col gap-4 transition-all duration-300 ease-out-strong hover:-translate-y-0.5 hover:border-white/[0.14] hover:shadow-[0_14px_34px_rgba(0,0,0,0.4)] ${needsReconnect ? 'border-amber-500/30' : isConnected ? 'border-[#3AFFA3]/20' : 'border-white/[0.07]'}`}>
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
                    {t('params.reseaux.reconnexionRequise')}
                  </span>
                ) : isConnected ? (
                  <span className="ml-auto shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold font-inter px-2.5 py-1 rounded-full bg-[#3AFFA3]/[0.12] text-[#3AFFA3] border border-[#3AFFA3]/25">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3AFFA3] opacity-60" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#3AFFA3]" />
                    </span>
                    {t('params.reseaux.connecte')}
                  </span>
                ) : (
                  <span className="ml-auto shrink-0 text-[11px] font-semibold font-inter px-2.5 py-1 rounded-full bg-white/[0.05] text-slate-500 border border-white/[0.07]">{t('params.reseaux.nonConnecte')}</span>
                )}
              </div>

              {/* Corps */}
              {isConnected ? (
                <div className="flex items-center gap-3 p-3 rounded-[13px] bg-[#0a1120] border border-white/[0.07]">
                  {meta.avatar
                    ? <img src={meta.avatar} alt="" className="w-[42px] h-[42px] rounded-[11px] object-cover shrink-0 border border-white/[0.07]" />
                    : <span className="w-[42px] h-[42px] rounded-[11px] grid place-items-center shrink-0 border border-white/[0.07] font-sora font-semibold text-sm" style={{ background: `${platform.brand}22`, color: platform.brand }}>{(meta.name || platform.name).charAt(0)}</span>}
                  <div className="min-w-0">
                    <span className="block font-sora font-semibold text-[13.5px] text-white truncate">{meta.name || t('params.reseaux.compteConnecte')}</span>
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
                      <span className="block text-[10.5px] text-slate-500 font-inter">{t('params.reseaux.abonnes', { count: meta.followers })}</span>
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
                      className="flex-1 inline-flex items-center justify-center gap-2 bg-amber-500/90 text-[#0b1322] font-inter font-semibold text-[13px] rounded-xl px-4 py-2.5 transition-all duration-150 ease-out-strong active:scale-[0.97] hover:bg-amber-400 disabled:opacity-60 disabled:active:scale-100">
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                      {t('params.reseaux.reconnecter')}
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button data-testid={`disconnect-${platform.id}`} title={t('params.reseaux.deconnecter')}
                          className="shrink-0 inline-flex items-center justify-center w-[42px] rounded-xl border border-white/[0.07] text-slate-400 transition-all duration-150 ease-out-strong active:scale-[0.97] hover:text-white hover:border-white/20">
                          <Unplug className="w-4 h-4" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-slate-900 border-slate-800">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-white font-sora">{t('params.reseaux.deconnecterTitre', { platform: platform.name })}</AlertDialogTitle>
                          <AlertDialogDescription className="text-slate-400 font-inter">{t('params.reseaux.deconnecterDesc')}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 font-inter">{t('params.commun.annuler')}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDisconnect(platform.id)} data-testid={`confirm-disconnect-${platform.id}`} className="bg-red-600 hover:bg-red-700 text-white font-inter">{t('params.reseaux.deconnecter')}</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ) : isConnected ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button data-testid={`disconnect-${platform.id}`}
                        className="w-full inline-flex items-center justify-center gap-1.5 text-[13px] font-medium text-slate-400 rounded-xl px-4 py-2.5 border border-white/[0.07] bg-transparent transition-all duration-150 ease-out-strong active:scale-[0.97] hover:text-white hover:border-white/20 font-inter">
                        <Unplug className="w-3.5 h-3.5" />{t('params.reseaux.deconnecter')}
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-slate-900 border-slate-800">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-white font-sora">{t('params.reseaux.deconnecterTitre', { platform: platform.name })}</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400 font-inter">{t('params.reseaux.deconnecterDesc')}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 font-inter">{t('params.commun.annuler')}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDisconnect(platform.id)} data-testid={`confirm-disconnect-${platform.id}`} className="bg-red-600 hover:bg-red-700 text-white font-inter">{t('params.reseaux.deconnecter')}</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <button disabled={isLoading || bloqueParEssai} onClick={() => handleConnect(platform.id)}
                    data-testid={bloqueParEssai ? `connect-${platform.id}-essai` : `connect-${platform.id}`}
                    title={bloqueParEssai ? t('params.reseaux.essaiUnSeul') : undefined}
                    className={`w-full inline-flex items-center justify-center gap-2 font-inter font-medium text-[13px] rounded-xl px-4 py-2.5 transition-all duration-150 ease-out-strong disabled:active:scale-100 ${
                      bloqueParEssai
                        ? 'bg-white/[0.04] text-slate-600 border border-white/[0.06] cursor-not-allowed'
                        : 'bg-[#e7ecf5] text-[#0b1322] active:scale-[0.97] hover:bg-white disabled:opacity-60'}`}>
                    {bloqueParEssai ? <Lock className="w-3.5 h-3.5" />
                      : isLoading ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <ExternalLink className="w-4 h-4" />}
                    {bloqueParEssai ? t('params.reseaux.essaiVerrouille') : t('params.reseaux.connecter')}
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
    if (!c) return t('params.planif.aucunJour');
    return t('params.planif.postsParSemaine', { count: c });
  };

  const renderSchedules = () => (
    <div className="space-y-4">
      <p className="text-sm text-slate-400 font-inter">{t('params.planif.intro')}</p>
      {connectedPlatforms.length === 0 && (
        <p className="text-center py-8 text-slate-500 font-inter text-sm">
          <Trans i18nKey="params.planif.aucunReseau" components={{ lnk: <button onClick={() => setActiveSection('connections')} className="text-[#5B6CFF] hover:underline" /> }} />
        </p>
      )}
      {!schedulesLoaded && connectedPlatforms.length > 0 && (
        <div className="flex items-center justify-center py-8 gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[#5B6CFF]" />
          <p className="text-sm text-slate-400 font-inter">{t('params.commun.chargement')}</p>
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
                        <div className="text-xs text-slate-400 font-inter mb-2">{t('params.planif.joursPublication')}</div>
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
                        <div className="text-xs text-slate-400 font-inter mb-2 flex items-center gap-1"><Clock className="w-3 h-3" /> {t('params.planif.heure')}</div>
                        <input type="time" value={schedule.preferred_time || '09:00'}
                          onChange={(e) => handleScheduleChange(schedule.platform, 'preferred_time', e.target.value)}
                          data-testid={`schedule-time-${schedule.platform}`}
                          className="w-[120px] rounded-lg bg-slate-950/50 border border-white/[0.07] focus:border-[#5B6CFF] text-slate-200 text-sm px-3 py-2 outline-none" />
                      </div>
                    </div>

                    {/* Rythme : les formats se cumulent le même jour, ou se suivent */}
                    <div className="mt-4 pt-4 border-t border-white/[0.06]">
                      <div className="text-xs text-slate-400 font-inter mb-2.5 flex items-center gap-1">
                        <Repeat className="w-3 h-3" /> {t('params.planif.rythme')}
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2.5">
                        {[
                          { id: 'cumule', titre: t('params.planif.cumuleTitre'), sous: t('params.planif.cumuleSous') },
                          { id: 'suite', titre: t('params.planif.suiteTitre'), sous: t('params.planif.suiteSous') },
                        ].map((m) => {
                          const actif = (schedule.mode_planification || 'cumule') === m.id;
                          return (
                            <button key={m.id} type="button"
                              onClick={() => handleScheduleChange(schedule.platform, 'mode_planification', m.id)}
                              data-testid={`schedule-mode-${schedule.platform}-${m.id}`}
                              className={`text-left rounded-xl border p-3 transition-all active:scale-[0.98] ${actif
                                ? 'border-[#5B6CFF]/60 bg-[#5B6CFF]/[0.08]'
                                : 'border-white/[0.07] bg-slate-950/40 hover:border-white/[0.16]'}`}>
                              <div className="flex items-center gap-2">
                                <span className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${actif ? 'border-[#8A6CFF] bg-[#8A6CFF]' : 'border-white/25'}`} />
                                <span className={`text-[13px] font-semibold font-inter ${actif ? 'text-white' : 'text-slate-300'}`}>{m.titre}</span>
                              </div>
                              <p className="text-[11.5px] text-slate-500 font-inter mt-1.5 leading-snug">{m.sous}</p>
                            </button>
                          );
                        })}
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
            {t('params.planif.enregistrer')}
          </Button>
        </div>
      )}
    </div>
  );

  // ---- Banque d'images de la marque (partagée avec le studio Séquence des reels) ----
  const renderBanque = () => (
    <div className="space-y-5">
      <p className="text-[13.5px] text-slate-400 font-inter leading-relaxed">{t('params.banque.intro')}</p>

      <label className={`inline-flex items-center gap-2 text-[13px] font-inter font-semibold px-4 py-2.5 rounded-[10px] border border-dashed cursor-pointer transition-colors ${
        banqueUpload ? 'border-white/10 text-slate-600 cursor-not-allowed' : 'border-[#5B6CFF]/50 text-[#a5b0ff] hover:bg-[#5B6CFF]/10'}`}>
        <input type="file" accept="image/*,video/mp4,video/quicktime,.mp4,.mov" multiple className="hidden" disabled={banqueUpload}
          onChange={(e) => { ajouterALaBanque(e.target.files); e.target.value = ''; }} />
        {banqueUpload ? <><Loader2 className="w-4 h-4 animate-spin" />{t('params.banque.envoi')}</>
                      : <><Plus className="w-4 h-4" />{t('params.banque.ajouter')}</>}
      </label>

      {banque === null ? (
        <div className="flex items-center gap-2 text-slate-500 text-sm font-inter"><Loader2 className="w-4 h-4 animate-spin" />…</div>
      ) : banque.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-8 text-center">
          <ImageIcon className="w-7 h-7 mx-auto mb-3 text-slate-600" />
          <p className="text-sm text-slate-500 font-inter">{t('params.banque.vide')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          {banque.map((img) => (
            <div key={img.id} className="group relative aspect-square rounded-xl overflow-hidden border border-white/10">
              <img src={img.apercu_url || img.url} alt="" className="w-full h-full object-cover" />
                              {img.type === 'video' && <span className="absolute top-1 left-1 z-[2] text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/75 text-white">▶</span>}
              {img.description && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#020617] to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-[10.5px] text-slate-200 leading-snug line-clamp-3">{img.description}</p>
                </div>
              )}
              <button type="button" onClick={() => supprimerDeLaBanque(img)}
                title={t('params.banque.supprimer')} aria-label={t('params.banque.supprimer')}
                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-lg bg-[#020617]/80 border border-white/20 text-slate-300 grid place-items-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:text-red-400 hover:border-red-400/40 active:scale-90">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {banque?.length > 0 && (
        <p className="text-[11.5px] text-slate-500 font-inter">{t('params.banque.compteur', { n: banque.length })}</p>
      )}
    </div>
  );

  const renderStyle = () => (
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/[0.07] bg-slate-950/40 p-5">
        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold font-inter mb-4">{t('params.style.palette')}</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <ColorField label={t('params.style.couleurPrincipale')} name="couleur_principale" value={user?.couleur_principale} onChange={handleChange} />
          <ColorField label={t('params.style.couleurSecondaire')} name="couleur_secondaire" value={user?.couleur_secondaire} onChange={handleChange} />
          <ColorField label={t('params.style.couleurAccent')} name="couleur_accent" value={user?.couleur_accent} onChange={handleChange} />
        </div>
      </section>
      <div className="p-5 rounded-2xl border border-white/[0.07] bg-slate-950/40">
        <h3 className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold font-inter mb-3">{t('params.style.apercu')}</h3>
        <div className="flex gap-3 items-center">
          <div className="w-16 h-16 rounded-xl shadow-lg transition-all" style={{ backgroundColor: user?.couleur_principale || '#003D2E' }} data-testid="preview-principale" />
          <div className="w-16 h-16 rounded-xl shadow-lg transition-all" style={{ backgroundColor: user?.couleur_secondaire || '#0077FF' }} data-testid="preview-secondaire" />
          <div className="w-16 h-16 rounded-xl shadow-lg transition-all" style={{ backgroundColor: user?.couleur_accent || '#3AFFA3' }} data-testid="preview-accent" />
        </div>
        <div className="mt-3 p-3 rounded-lg" style={{ background: `linear-gradient(135deg, ${user?.couleur_principale || '#003D2E'}, ${user?.couleur_secondaire || '#0077FF'})` }}>
          <p className="text-white font-sora font-semibold text-sm">{t('params.style.degrade')}</p>
          <p className="text-xs mt-0.5" style={{ color: user?.couleur_accent || '#3AFFA3' }}>{t('params.style.texteAccent')}</p>
        </div>
      </div>

      {/* Inspirations visuelles */}
      <div className="p-5 rounded-2xl border border-white/[0.07] bg-slate-950/40 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white font-sora">{t('params.style.inspirationsTitre')}</h3>
            <p className="text-xs text-slate-500 font-inter mt-0.5 leading-relaxed">
              {t('params.style.inspirationsDesc')}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Switch checked={user?.use_inspirations ?? true} onCheckedChange={(c) => handleChange('use_inspirations', c)} data-testid="toggle-use-inspirations" />
              <span className="text-xs text-slate-400 font-inter">{t('params.style.utiliserInspirations')}</span>
            </div>
          </div>
          <input ref={inspiInputRef} type="file" accept="image/*" multiple onChange={handleInspiUpload} className="hidden" data-testid="input-inspiration" />
          <Button
            type="button" size="sm" onClick={() => inspiInputRef.current?.click()} disabled={uploadingInspi}
            className="bg-[#5B6CFF]/15 text-[#8A6CFF] hover:bg-[#5B6CFF]/25 border border-[#5B6CFF]/30 font-inter flex-shrink-0"
          >
            {uploadingInspi ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
            {t('params.commun.ajouter')}
          </Button>
        </div>

        {!inspiLoaded ? (
          <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[#5B6CFF]" /></div>
        ) : inspirations.length === 0 ? (
          <p className="text-xs text-slate-600 font-inter py-4 text-center">{t('params.style.aucuneInspiration')}</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {inspirations.map((url) => (
              <div key={url} className="relative group aspect-square rounded-lg overflow-hidden border border-white/10">
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => handleInspiDelete(url)}
                  className="absolute top-1 right-1 w-6 h-6 rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-500/80"
                  title={t('params.commun.supprimer')}
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
            <h3 className="text-sm font-semibold text-white font-sora">{t('params.style.templatesTitre')}</h3>
            <p className="text-xs text-slate-500 font-inter mt-0.5 leading-relaxed">
              {t('params.style.templatesDesc')}
            </p>
          </div>
          <Button type="button" size="sm" onClick={() => setTplOpen((v) => !v)}
            className="bg-[#3AFFA3]/15 text-[#3AFFA3] hover:bg-[#3AFFA3]/25 border border-[#3AFFA3]/30 font-inter flex-shrink-0">
            <Plus className="w-4 h-4 mr-1.5" />{tplOpen ? t('params.commun.annuler') : t('params.style.nouveau')}
          </Button>
        </div>

        {/* Formulaire de création */}
        {tplOpen && (
          <div className="rounded-lg border border-white/10 bg-slate-900/50 p-3 space-y-3">
            <Input value={tplNom} onChange={(e) => setTplNom(e.target.value)} placeholder={t('params.style.tplNomPlaceholder')}
              className="bg-slate-950/60 border-slate-800 text-slate-200 text-sm" maxLength={80} />
            <Textarea value={tplNote} onChange={(e) => setTplNote(e.target.value)} rows={2}
              placeholder={t('params.style.tplNotePlaceholder')}
              className="bg-slate-950/60 border-slate-800 text-slate-200 text-sm" />
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="text-xs text-slate-400 font-inter">{t('params.style.imagesRef', { count: tplImages.length })}</p>
                <input ref={tplInputRef} type="file" accept="image/*" multiple onChange={handleTplUpload} className="hidden" />
                <button type="button" onClick={() => tplInputRef.current?.click()} disabled={tplUploading}
                  className="text-xs text-[#3AFFA3] hover:text-white font-inter inline-flex items-center gap-1 disabled:opacity-50 flex-shrink-0">
                  {tplUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} {t('params.style.ajouterImage')}
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
                  <p className="text-xs text-slate-600 font-inter">{t('params.style.aucuneImage')}</p>
                )}
              </div>
            </div>
            <Button onClick={handleCreateTemplate} disabled={tplSaving || !tplNom.trim()} size="sm"
              className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white hover:opacity-90 font-inter">
              {tplSaving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />}{t('params.style.enregistrerTemplate')}
            </Button>
          </div>
        )}

        {/* Liste des templates */}
        {templates.length === 0 ? (
          <p className="text-xs text-slate-600 font-inter py-3 text-center">{t('params.style.aucunTemplate')}</p>
        ) : (
          <div className="space-y-2">
            {templates.map((tpl) => (
              <div key={tpl.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-white/8 bg-slate-900/40">
                <div className="flex -space-x-2 flex-shrink-0">
                  {(tpl.images || []).slice(0, 3).map((u) => (
                    <img key={u} src={u} alt="" className="w-9 h-9 rounded-md object-cover border border-slate-800" />
                  ))}
                  {(!tpl.images || tpl.images.length === 0) && <div className="w-9 h-9 rounded-md bg-slate-800 grid place-items-center"><ImageIcon className="w-4 h-4 text-slate-600" /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-200 font-medium truncate">{tpl.nom}</div>
                  {tpl.note && <div className="text-[11px] text-slate-500 truncate">{tpl.note}</div>}
                </div>
                <button onClick={() => handleDeleteTemplate(tpl.id)} title={t('params.commun.supprimer')}
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
          {t('params.avatar.bientot')}
        </span>
        <h3 className="text-white font-semibold font-sora text-lg mt-3">{t('params.avatar.titre')}</h3>
        <p className="text-sm text-slate-400 font-inter mt-1.5 max-w-md">
          {t('params.avatar.desc')}
        </p>
      </div>
    );

    if (avatarLoading) {
      return (
        <div className="flex items-center justify-center py-8 gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[#5B6CFF]" />
          <p className="text-sm text-slate-400 font-inter">{t('params.commun.chargement')}</p>
        </div>
      );
    }

    if (avatar) {
      return (
        <div className="space-y-4">
          {/* Status bar */}
          <div className={`flex items-center gap-3 px-4 py-3 rounded-lg ${avatarStatusConfig.bg}`}>
            <avatarStatusConfig.icon className={`w-4 h-4 ${avatarStatusConfig.color} ${avatar.status === 'in_progress' ? 'animate-spin' : ''}`} />
            <span className={`text-sm font-medium font-inter ${avatarStatusConfig.color}`}>{t(avatarStatusConfig.labelKey)}</span>
            {avatar.avatar_name && <span className="text-slate-400 font-inter text-sm">· {avatar.avatar_name}</span>}
          </div>

          {/* Pending info */}
          {avatar.status === 'pending' && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <Info className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-300 font-inter">
                {t('params.avatar.pendingInfo')}
              </p>
            </div>
          )}

          {/* In progress info */}
          {avatar.status === 'in_progress' && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
              <Info className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-300 font-inter">{t('params.avatar.inProgressInfo')}</p>
            </div>
          )}

          {/* Consent link (from admin) */}
          {avatar.consent_url && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[#5B6CFF]/5 border border-[#5B6CFF]/20">
              <Info className="w-4 h-4 text-[#5B6CFF] mt-0.5 flex-shrink-0" />
              <div className="text-xs font-inter">
                <p className="text-white font-medium mb-1">{t('params.avatar.consentement')}</p>
                <a href={avatar.consent_url} target="_blank" rel="noopener noreferrer"
                  className="text-[#5B6CFF] hover:underline break-all">{avatar.consent_url}</a>
              </div>
            </div>
          )}

          {/* Preview images (from HeyGen, shown when complete) */}
          {avatar.status === 'complete' && avatar.preview_image_url && (
            <div>
              <p className="text-xs text-slate-400 mb-2 font-inter">{t('params.avatar.apercuAvatar')}</p>
              <div className="flex flex-wrap gap-3">
                {avatar.preview_image_url.split(',').map((url, i) => (
                  <img key={i} src={url.trim()} alt={t('params.avatar.previewAlt', { n: i + 1 })}
                    className="w-32 h-32 rounded-lg border border-white/10 object-cover" data-testid={`avatar-preview-${i}`} />
                ))}
              </div>
            </div>
          )}

          {/* Training video (shown while pending/in_progress, removed after complete) */}
          {avatar.status !== 'complete' && avatar.training_video_url && (
            <div>
              <p className="text-xs text-slate-400 mb-1.5 font-inter">{t('params.avatar.videoEntrainementVotre')}</p>
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
              <p className="text-xs text-slate-500 font-inter mb-1">{t('params.avatar.description')}</p>
              <p className="text-sm text-slate-300 font-inter">{avatar.description}</p>
            </div>
          )}

          {/* Info */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            {avatar.avatar_id && (
              <div>
                <p className="text-slate-500 font-inter">{t('params.avatar.idAvatar')}</p>
                <p className="text-slate-300 font-mono text-[10px] mt-0.5">{avatar.avatar_id}</p>
              </div>
            )}
            {avatar.created_at && (
              <div>
                <p className="text-slate-500 font-inter">{t('params.avatar.soumisLe')}</p>
                <p className="text-slate-300 font-inter mt-0.5">{new Date(avatar.created_at).toLocaleDateString('fr-FR')}</p>
              </div>
            )}
          </div>

          {/* Delete */}
          <div className="flex gap-2">
            <button onClick={handleDeleteAvatar} disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors font-inter text-xs disabled:opacity-50"
              data-testid="delete-avatar-btn">
              <Trash2 className="w-3.5 h-3.5" />{deleting ? t('params.avatar.suppression') : t('params.avatar.supprimerDemande')}
            </button>
          </div>
        </div>
      );
    }

    // Create form
    return (
      <form onSubmit={handleCreateAvatar} className="space-y-4">
        <p className="text-sm text-slate-400 font-inter">
          {t('params.avatar.formIntro')}
        </p>
        <div className="flex items-start gap-2 p-3 rounded-lg bg-[#5B6CFF]/5 border border-[#5B6CFF]/20">
          <Info className="w-4 h-4 text-[#5B6CFF] mt-0.5 flex-shrink-0" />
          <div className="text-xs text-slate-300 font-inter space-y-1">
            <p className="font-medium text-white">{t('params.avatar.videoEntrainementTitre')}</p>
            <ul className="list-disc list-inside space-y-0.5 text-slate-400">
              <li>{t('params.avatar.specs1')}</li>
              <li>{t('params.avatar.specs2')}</li>
              <li>{t('params.avatar.specs3')}</li>
            </ul>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-300 font-inter">{t('params.avatar.descriptionLabel')}</label>
          <textarea
            value={avatarDescription}
            onChange={(e) => setAvatarDescription(e.target.value)}
            placeholder={t('params.avatar.descriptionPlaceholder')}
            rows={3}
            className="w-full rounded-lg bg-slate-950/50 border border-slate-800 focus:border-[#5B6CFF] text-slate-200 text-sm px-3 py-2 outline-none resize-none font-inter placeholder:text-slate-600"
            data-testid="avatar-description"
          />
        </div>

        {/* Video upload */}
        <FileDropZone id="training" label={t('params.avatar.dropLabel')} description={t('params.avatar.dropDesc')}
          accept="video/*" file={trainingVideo} onFileChange={setTrainingVideo} />

        <button type="submit" disabled={creating || !trainingVideo}
          className="w-full py-2.5 px-4 rounded-lg font-medium font-inter text-[#0b1322] text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-[#e7ecf5] hover:bg-white"
          data-testid="create-avatar-btn">
          {creating ? (
            <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{t('params.avatar.uploadEnCours')}</span>
          ) : (
            <span className="flex items-center justify-center gap-2"><Video className="w-4 h-4" />{t('params.avatar.soumettre')}</span>
          )}
        </button>
      </form>
    );
  };

  const upgrade = async (plan) => {
    track('checkout_ouvert', { plan });
    try { await billingService.checkout(plan); }
    catch (e) { toast.error(e.response?.data?.detail || t('params.abonnement.paiementIndispo')); }
  };
  const manageBilling = async () => {
    try { await billingService.portal(); }
    catch (e) { toast.error(e.response?.data?.detail || t('params.abonnement.portailIndispo')); }
  };

  const renderAbonnement = () => {
    // L'etat d'abonnement se lit dans le contexte, pas sur `user`.
    //
    // Il testait `user.plan === 'pro'` — or cette colonne a ete supprimee de
    // `users` au passage aux quotas. Elle valait donc toujours undefined, donc
    // isPro toujours faux, donc le bouton « Gerer mon abonnement » — le seul
    // chemin vers la resiliation — n'etait JAMAIS affiche a personne. Pas plus
    // que la date de renouvellement.
    const abo = usage?.subscription || null;
    const abonne = ['active', 'trialing', 'past_due', 'suspended'].includes(abo?.status);
    const enEssai = abo?.status === 'trialing';
    const isPro = abonne;
    // « Pro reel » = paiement en cours (statut active). L'essai a un abonnement
    // mais des quotas limites : il n'est PAS sur Pro, la carte doit l'inviter
    // a commencer, pas afficher « ton forfait actuel ».
    const isProReel = abo?.status === 'active';
    const echeance = abo?.current_period_end ? new Date(abo.current_period_end) : null;
    return (
      <div className="space-y-5">
        {/* Jauge des résultats inclus (déplacée depuis l'Accueil) */}
        <QuotaGauge />

        <Resiliation ouvert={resilOuvert} surFermeture={() => setResilOuvert(false)}
          enEssai={enEssai} surChangement={rechargerAbo} />

        <div className="flex items-center gap-4 flex-wrap p-4 rounded-2xl border border-[#5B6CFF]/25"
          style={{ background: 'linear-gradient(120deg, rgba(91,108,255,.13), rgba(138,108,255,.05))' }}>
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] grid place-items-center shrink-0 shadow-[0_8px_20px_rgba(91,108,255,.35)]">
            <CreditCard className="w-[21px] h-[21px] text-white" />
          </div>
          <div className="min-w-0">
            <div className="font-sora font-bold text-white text-[15px] flex items-center gap-2">
              {enEssai ? t('params.abonnement.offreEssai') : isPro ? t('params.abonnement.offrePro') : t('params.abonnement.offreLibre')}
              {isPro && <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#3AFFA3]/12 text-[#3AFFA3] border border-[#3AFFA3]/25">{t('params.abonnement.actif')}</span>}
            </div>
            {echeance && enEssai ? (
              <div className="text-xs text-[#3AFFA3] mt-1 font-inter">
                {t('params.abonnement.premierPrelevement', { date: echeance.toLocaleDateString('fr-FR') })}
              </div>
            ) : echeance && isPro ? (
              <div className="text-xs text-slate-400 mt-1 font-inter">
                {t('params.abonnement.renouvellement', { date: echeance.toLocaleDateString('fr-FR') })}
              </div>
            ) : null}
          </div>
          {isPro && (
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" onClick={manageBilling} className="bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10">
                <CreditCard className="w-4 h-4 mr-1.5" />{t('params.abonnement.gerer')}
              </Button>
              {/* La sortie n'est pas cachee derriere le portail Stripe : elle est
                  ici, visible, a cote de tout le reste. C'est aussi ce qui nous
                  permet de demander pourquoi — le portail emmene le client
                  ailleurs et la raison de son depart est perdue. */}
              <button onClick={() => setResilOuvert(true)} data-testid="ouvrir-resiliation"
                className="text-[13px] text-slate-500 hover:text-slate-200 font-inter
                           underline underline-offset-4 decoration-white/20
                           transition-colors duration-150">
                {t('params.abonnement.resilier')}
              </button>
            </div>
          )}
        </div>

        {/* Résiliation programmée : le client doit savoir ce qui l'attend à l'échéance */}
        {false && (
          <div className="p-4 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07]">
            <div className="font-sora font-semibold text-amber-300 text-[13.5px]">
              {t('params.abonnement.cePassera', { date: '' })}
            </div>
            <ul className="mt-2 space-y-1.5 text-[12.5px] text-slate-300 font-inter">
              <li className="flex items-start gap-2"><X className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" /><span><Trans i18nKey="params.abonnement.resil1" components={{ b: <b className="text-amber-200" /> }} /></span></li>
              <li className="flex items-start gap-2"><X className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />{t('params.abonnement.resil2')}</li>
              <li className="flex items-start gap-2"><Check className="w-3.5 h-3.5 text-[#3AFFA3] shrink-0 mt-0.5" /><span><Trans i18nKey="params.abonnement.resil3" components={{ b: <b className="text-slate-100" /> }} /></span></li>
            </ul>
            <div className="text-[12px] text-slate-400 mt-2.5 font-inter">
              {t('params.abonnement.resilNote')}
            </div>
          </div>
        )}

        <div className="max-w-md">
          <div className="relative rounded-2xl border border-[#5B6CFF]/50 bg-[#5B6CFF]/[0.06] p-6 flex flex-col">
            <div className="font-semibold font-sora text-white text-lg">{t('params.abonnement.pro')}</div>
            <div className="mt-1"><span className="text-3xl font-bold font-sora">{PRO_OFFER.price}</span><span className="text-sm text-slate-500"> {t('params.abonnement.parMois')}</span></div>
            <div className="text-xs text-slate-400 mt-3 font-inter uppercase tracking-wide">{t('params.abonnement.inclusChaqueMois')}</div>
            <ul className="mt-2 space-y-1.5">
              {PRO_OFFER.inclus.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[13px] text-slate-200 font-inter">
                  <Check className="w-3.5 h-3.5 text-[#3AFFA3] shrink-0 mt-0.5" />{t(f)}
                </li>
              ))}
            </ul>
            <div className="text-xs text-slate-400 mt-4 font-inter uppercase tracking-wide">{t('params.abonnement.etAussi')}</div>
            <ul className="mt-2 space-y-1.5 flex-1">
              {PRO_OFFER.feats.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[12.5px] text-slate-400 font-inter">
                  <Check className="w-3.5 h-3.5 text-[#3AFFA3] shrink-0 mt-0.5" />{t(f)}
                </li>
              ))}
            </ul>
            <div className="mt-5">
              {isProReel ? (
                <div className="text-center text-[12.5px] text-slate-500 py-2 border border-white/[0.06] rounded-lg">{t('params.abonnement.forfaitActuel')}</div>
              ) : (
                <Button onClick={() => upgrade('pro')} data-testid="passer-pro"
                  className="w-full bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white hover:opacity-90">
                  {enEssai ? t('params.abonnement.commencerMaintenant') : t('params.abonnement.passerPro')}
                </Button>
              )}
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-500 font-inter flex items-center gap-1.5"><Info className="w-3.5 h-3.5" />{t('params.abonnement.stripe')}</p>

        {/* Factures */}
        <InvoicesList />
      </div>
    );
  };

  // --- Offres / produits ---
  const resetOffreForm = () => { setOffreForm(OFFRE_VIDE); setOffreEditId(null); };
  const saveOffre = async () => {
    if (!offreForm.name.trim()) { toast.error('Le nom de l’offre est requis.'); return; }
    setOffreSaving(true);
    try {
      if (offreEditId) {
        const up = await offersService.update(offreEditId, offreForm);
        setOffres((o) => o.map((x) => (x.id === offreEditId ? up : x)));
        toast.success('Offre mise à jour.');
      } else {
        const created = await offersService.create(offreForm);
        setOffres((o) => [...o, created]);
        toast.success('Offre ajoutée.');
      }
      resetOffreForm();
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur.'); }
    finally { setOffreSaving(false); }
  };
  const editOffre = (o) => { setOffreEditId(o.id); setOffreForm({ name: o.name || '', type: o.type || 'service', price: o.price || '', description: o.description || '', benefits: o.benefits || '', url: o.url || '' }); };
  const deleteOffre = async (id) => {
    try { await offersService.remove(id); setOffres((o) => o.filter((x) => x.id !== id)); if (offreEditId === id) resetOffreForm(); }
    catch (e) { toast.error('Erreur.'); }
  };

  const renderOffres = () => (
    <div className="space-y-3.5">
      <p className="text-[13px] text-slate-400 font-inter max-w-[62ch]">
        Décris ce que tu vends (produits, services, offres). L’IA s’en sert pour ancrer ton contenu et
        ne jamais inventer un prix ou une caractéristique : elle ne cite que ce que tu renseignes ici.
      </p>

      <Bloc titre="Tes offres" sous="La liste sert de source de vérité à la génération.">
        {offres.length === 0 ? (
          <p className="text-sm text-slate-500 font-inter">Aucune offre pour l’instant. Ajoute-en une ci-dessous.</p>
        ) : (
          <div className="space-y-2">
            {offres.map((o) => (
              <div key={o.id} className="flex items-start gap-3 rounded-xl border border-white/5 bg-slate-950/40 p-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-100">{o.name}</span>
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{o.type}</span>
                    {o.price && <span className="text-[11px] text-[#3AFFA3]">{o.price}</span>}
                  </div>
                  {o.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{o.description}</p>}
                </div>
                <button onClick={() => editOffre(o)} title="Modifier" className="text-slate-500 hover:text-white p-1 flex-shrink-0"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => deleteOffre(o.id)} title="Supprimer" className="text-slate-500 hover:text-red-400 p-1 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </Bloc>

      <Bloc titre={offreEditId ? 'Modifier l’offre' : 'Ajouter une offre'} sous="Nom + prix suffisent pour commencer.">
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Champ label="Nom">
              <Input value={offreForm.name} onChange={(e) => setOffreForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex : Gestion Airbnb, Sac Élégance…" />
            </Champ>
            <Champ label="Type">
              <Select value={offreForm.type} onValueChange={(v) => setOffreForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">Produit</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="offer">Offre</SelectItem>
                </SelectContent>
              </Select>
            </Champ>
            <Champ label="Prix">
              <Input value={offreForm.price} onChange={(e) => setOffreForm((f) => ({ ...f, price: e.target.value }))} placeholder="Ex : 150 €/mois, 89 €…" />
            </Champ>
            <Champ label="Lien (optionnel)">
              <Input value={offreForm.url} onChange={(e) => setOffreForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://…" />
            </Champ>
          </div>
          <Champ label="Description">
            <Textarea rows={2} value={offreForm.description} onChange={(e) => setOffreForm((f) => ({ ...f, description: e.target.value }))} placeholder="En une ou deux phrases : ce que c’est." />
          </Champ>
          <Champ label="Bénéfices" hint="Un par ligne. Ce que ça apporte au client.">
            <Textarea rows={3} value={offreForm.benefits} onChange={(e) => setOffreForm((f) => ({ ...f, benefits: e.target.value }))} placeholder={"Gain de temps\nRevenus optimisés\nZéro souci de gestion"} />
          </Champ>
          <div className="flex items-center justify-end gap-2">
            {offreEditId && <button onClick={resetOffreForm} className="text-xs text-slate-400 hover:text-white px-2">Annuler</button>}
            <Button onClick={saveOffre} disabled={offreSaving || !offreForm.name.trim()}>
              {offreSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : (offreEditId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />)}
              <span className="ml-2">{offreEditId ? 'Enregistrer' : 'Ajouter l’offre'}</span>
            </Button>
          </div>
        </div>
      </Bloc>
    </div>
  );

  const sectionRenderers = {
    identity: renderIdentity,
    marque: renderMarque,
    offres: renderOffres,
    connections: renderConnections,
    schedules: renderSchedules,
    abonnement: renderAbonnement,
    style: renderStyle,
    banque: renderBanque,
    avatar: renderAvatar,
  };

  const currentSection = SETTINGS_SECTIONS.find(s => s.id === activeSection);

  return (
    <div className="h-full">
      {/* Header */}
      <PageHeader
        icon={Settings}
        title={t('params.entete.titre')}
        subtitle={t('params.entete.sousTitre')}
        actions={
          <>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" data-testid="delete-account-btn" className="text-red-400 hover:text-red-300 hover:bg-red-500/10 font-inter text-xs">
                  <Trash2 className="w-3.5 h-3.5 mr-1" />{t('params.commun.supprimer')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-slate-900 border-slate-800">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-white font-sora">{t('params.entete.supprimerCompteTitre')}</AlertDialogTitle>
                  <AlertDialogDescription className="text-slate-400 font-inter">{t('params.entete.supprimerCompteDesc')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 font-inter">{t('params.commun.annuler')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteAccount} data-testid="confirm-delete-account-btn" className="bg-red-600 hover:bg-red-700 text-white font-inter">{t('params.commun.supprimer')}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button onClick={handleSave} disabled={saving} size="sm" data-testid="save-btn"
              className="bg-[#e7ecf5] text-[#0b1322] hover:bg-white font-inter text-xs">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
              {t('params.commun.sauvegarder')}
            </Button>
          </>
        }
      />

      {/* Tant qu'il n'y a rien a enregistrer, un bouton ne fait qu'occuper
          l'ecran : la barre ne monte qu'une fois quelque chose modifie. */}
      <div data-testid="barre-enregistrer"
        className={`fixed left-0 right-0 bottom-0 z-40 border-t border-white/[0.07] bg-[#020617]/[0.88]
                    backdrop-blur-xl shadow-[0_-1px_0_rgba(255,255,255,0.04),0_-18px_44px_rgba(0,0,0,0.55)]
                    transition-transform [transition-duration:260ms] ease-out-strong
                    ${nonEnregistre ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="max-w-[900px] mx-auto px-5 py-3 flex items-center justify-between gap-4">
          <span className="text-[12.5px] text-slate-400 font-inter">{t('params.commun.nonEnregistre')}</span>
          <Button onClick={handleSave} disabled={saving} size="sm" data-testid="save-btn-barre"
            className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white font-inter text-[13px]
                       active:scale-[0.97] transition-transform duration-150 ease-out-strong">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
            {t('params.commun.sauvegarder')}
          </Button>
        </div>
      </div>

      {/* Profile incomplete warning */}
      {!isProfileComplete && (
        <div className="mb-4 flex items-start gap-3 p-3 rounded-xl border border-orange-500/30 bg-orange-500/10">
          <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-orange-300 font-inter">{t('params.entete.profilIncomplet')}</p>
            <p className="text-xs text-orange-400/80 mt-0.5 font-inter">{t('params.entete.profilIncompletDesc')}</p>
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
                <SelectItem key={s.id} value={s.id} className="text-slate-200 focus:bg-slate-800">{t(s.titleKey)}</SelectItem>
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
                    <h2 className="text-lg font-semibold font-sora text-white">{t(currentSection.titleKey)}</h2>
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
