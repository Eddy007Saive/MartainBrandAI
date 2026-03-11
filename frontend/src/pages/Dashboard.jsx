import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Share2, Link, Key, Palette, Save, Loader2, Menu, X, Trash2, AlertTriangle } from 'lucide-react';
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

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('identity');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const response = await api.get('/users/me');
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
              <Field label="Nom" name="nom" value={user?.nom} onChange={handleChange} />
              <Field label="Username" name="username" value={user?.username} onChange={handleChange} />
              <Field label="Email" name="email" value={user?.email} onChange={handleChange} readOnly />
              <Field label="Nom d'utilisateur" name="user_name" value={user?.user_name} onChange={handleChange} />
              <Field label="URL Photo" name="photo_url" value={user?.photo_url} onChange={handleChange} />
              
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-300 font-inter">Sexe</Label>
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
                <Label className="text-sm font-medium text-slate-300 font-inter">Style vestimentaire</Label>
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
                <Label className="text-sm font-medium text-slate-300 font-inter">Utiliser la photo</Label>
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
              <Field label="Late Profile ID" name="late_profile_id" value={user?.late_profile_id} onChange={handleChange} />
              <Field label="LinkedIn" name="late_account_linkedin" value={user?.late_account_linkedin} onChange={handleChange} />
              <Field label="Instagram" name="late_account_instagram" value={user?.late_account_instagram} onChange={handleChange} />
              <Field label="Facebook" name="late_account_facebook" value={user?.late_account_facebook} onChange={handleChange} />
              <Field label="TikTok" name="late_account_tiktok" value={user?.late_account_tiktok} onChange={handleChange} />
              <Field label="Telegram Bot Token" name="telegram_bot_token" value={user?.telegram_bot_token} onChange={handleChange} type="password" hasValue={!!user?.telegram_bot_token} />
              <Field label="Telegram Bot Username" name="telegram_bot_username" value={user?.telegram_bot_username} onChange={handleChange} />
            </div>
          </SectionBlock>
        );
        
      case 'gpt_urls':
        return (
          <SectionBlock title="URLs GPT" icon={Link}>
            <div className="grid grid-cols-1 gap-6">
              <Field label="GPT URL LinkedIn" name="gpt_url_linkedin" value={user?.gpt_url_linkedin} onChange={handleChange} />
              <Field label="GPT URL Instagram" name="gpt_url_instagram" value={user?.gpt_url_instagram} onChange={handleChange} />
              <Field label="GPT URL Sujets" name="gpt_url_sujets" value={user?.gpt_url_sujets} onChange={handleChange} />
              <Field label="GPT URL Default" name="gpt_url_default" value={user?.gpt_url_default} onChange={handleChange} />
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
