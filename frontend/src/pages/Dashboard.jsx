import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Share2, Link, Key, Palette, Save, Loader2, Menu, X, Trash2, AlertTriangle, Info, Plug, Check, ExternalLink, Unplug } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../components/ui/alert-dialog';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { Sidebar } from '../components/Sidebar';
import { Field } from '../components/Field';
import { ColorField } from '../components/ColorField';
import { SectionBlock } from '../components/SectionBlock';
import api from '../lib/api';
import { removeToken } from '../lib/auth';

const REQUIRED_FIELDS = {
  identity: ['nom', 'username', 'user_name', 'photo_url', 'sexe', 'style_vestimentaire'],
  social: ['late_profile_id', 'late_account_linkedin', 'late_account_instagram', 'late_account_facebook', 'late_account_tiktok', 'telegram_bot_token', 'telegram_bot_username'],
  gpt_urls: ['gpt_url_linkedin', 'gpt_url_instagram', 'gpt_url_sujets', 'gpt_url_default'],
  api_keys: ['api_key_gemini'],
  style: ['couleur_principale', 'couleur_secondaire', 'couleur_accent'],
};

const STYLES_VESTIMENTAIRES = [
  'Casual', 'Business', 'Sportif', 'Élégant', 'Décontracté', 'Streetwear', 'Classique'
];

const InstagramIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
  </svg>
);

const FacebookIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

const LinkedInIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
);

const YouTubeIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const SOCIAL_PLATFORMS = [
  {
    id: 'instagram',
    name: 'Instagram',
    field: 'late_account_instagram',
    color: 'from-pink-500 to-purple-600',
    icon: InstagramIcon,
  },
  {
    id: 'facebook',
    name: 'Facebook',
    field: 'late_account_facebook',
    color: 'from-blue-600 to-blue-700',
    icon: FacebookIcon,
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    field: 'late_account_linkedin',
    color: 'from-blue-500 to-cyan-600',
    icon: LinkedInIcon,
  },
  {
    id: 'youtube',
    name: 'YouTube',
    field: 'late_account_youtube',
    color: 'from-red-600 to-red-700',
    icon: YouTubeIcon,
  },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('identity');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [connecting, setConnecting] = useState(null);

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const response = await api.get('/users/me');
      if (!response.data.actif) {
        removeToken();
        navigate('/pending');
        return;
      }
      setUser(response.data);
    } catch (error) {
      toast.error('Erreur lors du chargement du profil');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (name, value) => {
    setUser(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await api.patch('/users/me', user);
      setUser(response.data);
      toast.success('Profil mis à jour avec succès');
    } catch (error) {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    removeToken();
    navigate('/');
  };

  const handleDeleteAccount = async () => {
    try {
      await api.delete('/users/me');
      removeToken();
      toast.success('Compte supprimé avec succès');
      navigate('/');
    } catch (error) {
      toast.error('Erreur lors de la suppression du compte');
    }
  };

  const openOAuthPopup = (url, platformName) => {
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      url,
      `${platformName}_oauth`,
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes`
    );

    // Poll to detect when popup closes, then refresh user data
    if (popup) {
      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer);
          fetchUser(); // Refresh to pick up new connection status
        }
      }, 500);
    }
  };

  const handleConnect = async (platform) => {
    setConnecting(platform);
    try {
      const response = await api.post('/users/me/connect', { platform });
      if (response.data.success && response.data.authUrl) {
        openOAuthPopup(response.data.authUrl, platform);
      } else {
        toast.error(response.data.error || 'Erreur lors de la connexion', { duration: 6000 });
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Impossible de contacter le serveur', { duration: 6000 });
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (platform) => {
    try {
      const response = await api.post('/users/me/disconnect', { platform });
      if (response.data.success) {
        const field = SOCIAL_PLATFORMS.find(p => p.id === platform)?.field;
        if (field) {
          setUser(prev => ({ ...prev, [field]: null }));
        }
        toast.success(`${platform.charAt(0).toUpperCase() + platform.slice(1)} déconnecté`);
      } else {
        toast.error(response.data.error || 'Erreur lors de la déconnexion', { duration: 6000 });
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#5B6CFF]" />
      </div>
    );
  }

  const renderSection = () => {
    switch (activeSection) {
      case 'identity':
        return (
          <SectionBlock title="Identité" icon={User}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field label="Nom" name="nom" value={user?.nom} onChange={handleChange}
                hint="Votre nom complet tel qu'il apparaîtra dans vos contenus générés." />
              <Field label="Username" name="username" value={user?.username} onChange={handleChange}
                hint="Votre identifiant unique sur la plateforme (sans espaces, ex: martin_dupont)." />
              <Field label="Email" name="email" value={user?.email} onChange={handleChange} readOnly />
              <Field label="Nom d'utilisateur affiché" name="user_name" value={user?.user_name} onChange={handleChange}
                hint="Le nom public affiché dans vos posts et profils (peut contenir des espaces)." />
              <Field
                label="URL Photo"
                name="photo_url"
                value={user?.photo_url}
                onChange={handleChange}
                hint={"Comment obtenir l'URL depuis Google Drive :\n1. Uploadez votre photo sur Google Drive\n2. Faites un clic droit → « Partager »\n3. Passez en accès « Tout le monde avec le lien »\n4. Copiez l'ID du fichier dans l'URL (ex: .../d/XXXXXXX/view)\n5. Collez ce lien ici — le système l'utilisera pour vos contenus."}
              />

              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label className="text-sm font-medium text-slate-300 font-inter">Sexe</Label>
                </div>
                <Select
                  value={user?.sexe || ''}
                  onValueChange={(value) => handleChange('sexe', value)}
                >
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

              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label className="text-sm font-medium text-slate-300 font-inter">Style vestimentaire</Label>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300 cursor-help transition-colors" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs bg-slate-800 border border-slate-700 text-slate-200 text-xs leading-relaxed" side="top">
                        {"Casual — décontracté du quotidien\nBusiness — tenue professionnelle sobre\nSportif — vêtements de sport / athleisure\nÉlégant — habillé, soirée, formel\nDécontracté — entre casual et sport\nStreetwear — urban, tendance, hype\nClassique — intemporel, costume, chic"}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Select
                  value={user?.style_vestimentaire || ''}
                  onValueChange={(value) => handleChange('style_vestimentaire', value)}
                >
                  <SelectTrigger data-testid="field-style" className="bg-slate-950/50 border-slate-800 focus:border-[#5B6CFF] text-slate-200">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800">
                    {STYLES_VESTIMENTAIRES.map(style => (
                      <SelectItem key={style} value={style.toLowerCase()} className="text-slate-200 focus:bg-slate-800">
                        {style}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-950/30 rounded-lg border border-slate-800">
                <div className="flex items-center gap-1.5">
                  <Label className="text-sm font-medium text-slate-300 font-inter">Utiliser la photo</Label>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300 cursor-help transition-colors" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs bg-slate-800 border border-slate-700 text-slate-200 text-xs leading-relaxed" side="top">
                        Activez cette option pour que votre photo soit intégrée automatiquement dans les contenus générés.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Switch
                  checked={user?.use_photo || false}
                  onCheckedChange={(checked) => handleChange('use_photo', checked)}
                  data-testid="toggle-use-photo"
                />
              </div>
            </div>
          </SectionBlock>
        );
        
      case 'social':
        return (
          <SectionBlock title="Réseaux Sociaux" icon={Share2}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field label="Late Profile ID" name="late_profile_id" value={user?.late_profile_id} onChange={handleChange}
                hint={"Votre identifiant sur la plateforme Late.\nTrouvable dans l'URL de votre profil Late : late.com/@VOTRE_ID"} />
              <Field label="LinkedIn" name="late_account_linkedin" value={user?.late_account_linkedin} onChange={handleChange}
                hint={"Votre identifiant LinkedIn (la partie après linkedin.com/in/).\nEx : pour linkedin.com/in/martin-dupont → saisir martin-dupont"} />
              <Field label="Instagram" name="late_account_instagram" value={user?.late_account_instagram} onChange={handleChange}
                hint="Votre @username Instagram sans le @.\nEx : pour @martin.dupont → saisir martin.dupont" />
              <Field label="Facebook" name="late_account_facebook" value={user?.late_account_facebook} onChange={handleChange}
                hint={"Votre identifiant Facebook (la partie après facebook.com/).\nEx : pour facebook.com/martin.dupont → saisir martin.dupont"} />
              <Field label="TikTok" name="late_account_tiktok" value={user?.late_account_tiktok} onChange={handleChange}
                hint="Votre @username TikTok sans le @.\nEx : pour @martindupont → saisir martindupont" />
              <Field label="Telegram Bot Token" name="telegram_bot_token" value={user?.telegram_bot_token} onChange={handleChange} type="password" hasValue={!!user?.telegram_bot_token}
                hint={"Comment obtenir votre token Telegram :\n1. Ouvrez Telegram et cherchez @BotFather\n2. Envoyez /newbot et suivez les instructions\n3. BotFather vous donnera un token du type :\n   123456789:AAFxxxxxxxxxxxxxx\n4. Copiez ce token ici."} />
              <Field label="Telegram Bot Username" name="telegram_bot_username" value={user?.telegram_bot_username} onChange={handleChange}
                hint={"Le nom d'utilisateur de votre bot Telegram (sans le @).\nBotFather vous le donne lors de la création.\nEx : pour @MonBot → saisir MonBot"} />
            </div>
          </SectionBlock>
        );
        
      case 'gpt_urls':
        return (
          <SectionBlock title="URLs GPT" icon={Link}>
            <div className="grid grid-cols-1 gap-6">
              <Field label="GPT URL LinkedIn" name="gpt_url_linkedin" value={user?.gpt_url_linkedin} onChange={handleChange}
                hint={"L'URL de votre GPT personnalisé pour générer des posts LinkedIn.\nFormat : https://chat.openai.com/g/g-XXXXXXX\nCréez votre GPT sur chat.openai.com → Explore GPTs → Create."} />
              <Field label="GPT URL Instagram" name="gpt_url_instagram" value={user?.gpt_url_instagram} onChange={handleChange}
                hint={"L'URL de votre GPT personnalisé pour générer des posts Instagram.\nFormat : https://chat.openai.com/g/g-XXXXXXX"} />
              <Field label="GPT URL Sujets" name="gpt_url_sujets" value={user?.gpt_url_sujets} onChange={handleChange}
                hint={"L'URL du GPT utilisé pour générer des idées de sujets de contenu.\nFormat : https://chat.openai.com/g/g-XXXXXXX"} />
              <Field label="GPT URL Default" name="gpt_url_default" value={user?.gpt_url_default} onChange={handleChange}
                hint={"L'URL du GPT utilisé par défaut quand aucun GPT spécifique n'est défini.\nFormat : https://chat.openai.com/g/g-XXXXXXX"} />
            </div>
          </SectionBlock>
        );
        
      case 'api_keys':
        return (
          <SectionBlock title="Clés API" icon={Key}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field
                label="Gemini API Key"
                name="api_key_gemini"
                value={user?.api_key_gemini}
                onChange={handleChange}
                type="password"
                hasValue={!!user?.api_key_gemini}
                hint={"Comment obtenir votre clé Gemini :\n1. Allez sur aistudio.google.com\n2. Connectez-vous avec votre compte Google\n3. Cliquez sur « Get API Key » → « Create API key »\n4. Copiez la clé générée et collez-la ici.\nGratuit jusqu'à un certain quota."}
              />
            </div>
            <p className="mt-4 text-xs text-slate-500 font-inter">
              La clé API est stockée de manière sécurisée et n'est jamais affichée en clair.
            </p>
          </SectionBlock>
        );
        
      case 'style':
        return (
          <SectionBlock title="Style & Couleurs" icon={Palette}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <ColorField 
                label="Couleur Principale" 
                name="couleur_principale" 
                value={user?.couleur_principale} 
                onChange={handleChange} 
              />
              <ColorField 
                label="Couleur Secondaire" 
                name="couleur_secondaire" 
                value={user?.couleur_secondaire} 
                onChange={handleChange} 
              />
              <ColorField 
                label="Couleur Accent" 
                name="couleur_accent" 
                value={user?.couleur_accent} 
                onChange={handleChange} 
              />
            </div>
            
            {/* Live preview */}
            <div className="p-6 rounded-xl border border-slate-800 bg-slate-950/50">
              <h3 className="text-sm font-medium text-slate-400 mb-4 font-inter">Aperçu en temps réel</h3>
              <div className="flex gap-4 items-center">
                <div 
                  className="w-24 h-24 rounded-xl shadow-lg transition-all duration-300"
                  style={{ backgroundColor: user?.couleur_principale || '#003D2E' }}
                  data-testid="preview-principale"
                />
                <div 
                  className="w-24 h-24 rounded-xl shadow-lg transition-all duration-300"
                  style={{ backgroundColor: user?.couleur_secondaire || '#0077FF' }}
                  data-testid="preview-secondaire"
                />
                <div 
                  className="w-24 h-24 rounded-xl shadow-lg transition-all duration-300"
                  style={{ backgroundColor: user?.couleur_accent || '#3AFFA3' }}
                  data-testid="preview-accent"
                />
              </div>
              <div className="mt-4 p-4 rounded-lg" style={{ 
                background: `linear-gradient(135deg, ${user?.couleur_principale || '#003D2E'}, ${user?.couleur_secondaire || '#0077FF'})` 
              }}>
                <p className="text-white font-sora font-semibold">Dégradé Preview</p>
                <p className="text-sm mt-1" style={{ color: user?.couleur_accent || '#3AFFA3' }}>
                  Texte avec couleur accent
                </p>
              </div>
            </div>
          </SectionBlock>
        );
        
      case 'connections':
        return (
          <SectionBlock title="Connexions" icon={Plug}>
            <p className="text-sm text-slate-400 font-inter mb-6">
              Connectez vos réseaux sociaux via Late pour publier automatiquement du contenu.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SOCIAL_PLATFORMS.map((platform) => {
                const isConnected = !!user?.[platform.field];
                const isLoading = connecting === platform.id;
                return (
                  <div
                    key={platform.id}
                    data-testid={`connect-card-${platform.id}`}
                    className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50 p-5 transition-all duration-300 hover:border-slate-700"
                  >
                    {/* Gradient accent bar */}
                    <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${platform.color}`} />

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <platform.icon className="w-7 h-7 text-white" />
                        <div>
                          <h3 className="text-white font-semibold font-sora text-sm">
                            {platform.name}
                          </h3>
                          <div className="flex items-center gap-1.5 mt-1">
                            {isConnected ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-xs text-emerald-400 font-inter">Connecté</span>
                              </>
                            ) : (
                              <span className="text-xs text-slate-500 font-inter">Non connecté</span>
                            )}
                          </div>
                          {isConnected && (
                            <p className="text-xs text-slate-500 font-inter mt-0.5 truncate max-w-[160px]">
                              {user[platform.field]}
                            </p>
                          )}
                        </div>
                      </div>

                      <div>
                        {isConnected ? (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                data-testid={`disconnect-${platform.id}`}
                                className="text-slate-400 hover:text-red-400 hover:bg-red-500/10 font-inter text-xs"
                              >
                                <Unplug className="w-4 h-4 mr-1" />
                                Déconnecter
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-slate-900 border-slate-800">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-white font-sora">
                                  Déconnecter {platform.name}
                                </AlertDialogTitle>
                                <AlertDialogDescription className="text-slate-400 font-inter">
                                  Votre compte {platform.name} ne sera plus lié. Vous pourrez le reconnecter à tout moment.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 font-inter">
                                  Annuler
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDisconnect(platform.id)}
                                  data-testid={`confirm-disconnect-${platform.id}`}
                                  className="bg-red-600 hover:bg-red-700 text-white font-inter"
                                >
                                  Déconnecter
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : (
                          <Button
                            size="sm"
                            disabled={isLoading}
                            onClick={() => handleConnect(platform.id)}
                            data-testid={`connect-${platform.id}`}
                            className={`bg-gradient-to-r ${platform.color} hover:opacity-90 text-white font-inter text-xs`}
                          >
                            {isLoading ? (
                              <Loader2 className="w-4 h-4 animate-spin mr-1" />
                            ) : (
                              <ExternalLink className="w-4 h-4 mr-1" />
                            )}
                            Connecter
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 p-4 rounded-xl border border-slate-800 bg-slate-950/30">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-slate-300 font-inter">Comment ça marche ?</p>
                  <ol className="text-xs text-slate-500 font-inter mt-2 space-y-1 list-decimal list-inside">
                    <li>Cliquez sur « Connecter » pour le réseau souhaité</li>
                    <li>Vous serez redirigé vers la page d'autorisation du réseau social</li>
                    <li>Autorisez l'accès à votre compte</li>
                    <li>Vous serez redirigé automatiquement ici — votre compte sera lié</li>
                  </ol>
                </div>
              </div>
            </div>
          </SectionBlock>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen bg-[#020617] overflow-hidden" data-testid="dashboard">
      {/* Noise overlay */}
      <div className="fixed inset-0 z-[1] pointer-events-none opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
      
      {/* Desktop Sidebar */}
      <Sidebar
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        onLogout={handleLogout}
        userName={user?.nom}
        incompleteSections={incompleteSections}
      />
      
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold font-sora bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] bg-clip-text text-transparent">
          Dashboard
        </h1>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="text-slate-400 hover:text-white"
          data-testid="mobile-menu-toggle"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>
      
      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-slate-950/95 backdrop-blur-xl pt-16">
          <nav className="p-4 space-y-2">
            {[
              { id: 'identity', title: 'Identité', icon: User },
              { id: 'social', title: 'Réseaux Sociaux', icon: Share2 },
              { id: 'gpt_urls', title: 'URLs GPT', icon: Link },
              { id: 'api_keys', title: 'Clés API', icon: Key },
              { id: 'style', title: 'Style & Couleurs', icon: Palette },
              { id: 'connections', title: 'Connexions', icon: Plug },
            ].map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => {
                    setActiveSection(section.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all ${
                    activeSection === section.id
                      ? 'bg-[#5B6CFF]/20 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-inter">{section.title}</span>
                </button>
              );
            })}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-400 hover:bg-red-500/10 mt-4"
            >
              <span className="font-inter">Déconnexion</span>
            </button>
          </nav>
        </div>
      )}
      
      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 relative z-10 pt-20 md:pt-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold font-sora text-white">
                Mon Profil
              </h1>
              <p className="text-slate-400 mt-1 font-inter text-sm">
                Gérez vos informations personnelles
              </p>
            </div>
            <div className="flex items-center gap-3">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    data-testid="delete-account-btn"
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10 font-inter"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Supprimer mon compte
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-slate-900 border-slate-800">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-white font-sora">Supprimer mon compte</AlertDialogTitle>
                    <AlertDialogDescription className="text-slate-400 font-inter">
                      Cette action est irréversible. Toutes vos données seront définitivement supprimées.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 font-inter">
                      Annuler
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAccount}
                      data-testid="confirm-delete-account-btn"
                      className="bg-red-600 hover:bg-red-700 text-white font-inter"
                    >
                      Supprimer définitivement
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button
                onClick={handleSave}
                disabled={saving}
                data-testid="save-btn"
                className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] hover:opacity-90 transition-all duration-300 shadow-[0_0_10px_rgba(91,108,255,0.2)] font-inter"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Sauvegarder
              </Button>
            </div>
          </div>
          
          {!isProfileComplete && (
            <div className="mb-6 flex items-start gap-3 p-4 rounded-xl border border-orange-500/30 bg-orange-500/10">
              <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-orange-300 font-inter">Profil incomplet</p>
                <p className="text-xs text-orange-400/80 mt-0.5 font-inter">
                  Le système ne peut pas fonctionner correctement tant que tous les champs requis ne sont pas remplis.
                  Les sections incomplètes sont signalées par un point orange dans la navigation.
                </p>
              </div>
            </div>
          )}

          <div className="animate-fade-in">
            {renderSection()}
          </div>
        </div>
      </main>
    </div>
  );
}
