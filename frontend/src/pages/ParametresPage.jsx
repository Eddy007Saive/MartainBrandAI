import { useState, useEffect } from 'react';
import { Save, Loader2, User, Palette, Key, Share2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';
import { useUser } from '../context/UserContext';
import api from '../lib/api';

const STYLES_VESTIMENTAIRES = [
  'Casual', 'Business', 'Sportif', 'Élégant', 'Décontracté', 'Streetwear', 'Classique'
];

export default function ParametresPage() {
  const { user, updateUser } = useUser();
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');

  useEffect(() => {
    if (user) {
      setFormData(user);
    }
  }, [user]);

  const handleChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await api.patch('/users/me', formData);
      updateUser(response.data);
      toast.success('Paramètres enregistrés');
    } catch (error) {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'profile', label: 'Profil', icon: User },
    { id: 'social', label: 'Réseaux', icon: Share2 },
    { id: 'style', label: 'Style', icon: Palette },
    { id: 'api', label: 'API', icon: Key },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-sora text-white">Paramètres</h1>
          <p className="text-slate-400 font-inter text-sm mt-1">
            Gérez votre profil et vos préférences
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] hover:opacity-90"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Enregistrer
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-4">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-inter text-sm transition-all ${
                activeTab === tab.id
                  ? 'bg-[#5B6CFF]/20 text-[#5B6CFF]'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6">
        {activeTab === 'profile' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-slate-300">Nom</Label>
              <Input
                value={formData.nom || ''}
                onChange={(e) => handleChange('nom', e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Username</Label>
              <Input
                value={formData.username || ''}
                onChange={(e) => handleChange('username', e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Email</Label>
              <Input
                value={formData.email || ''}
                readOnly
                className="bg-slate-800 border-slate-700 text-slate-400 opacity-60"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Sexe</Label>
              <Select value={formData.sexe || ''} onValueChange={(v) => handleChange('sexe', v)}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800">
                  <SelectItem value="homme">Homme</SelectItem>
                  <SelectItem value="femme">Femme</SelectItem>
                  <SelectItem value="autre">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Style vestimentaire</Label>
              <Select value={formData.style_vestimentaire || ''} onValueChange={(v) => handleChange('style_vestimentaire', v)}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800">
                  {STYLES_VESTIMENTAIRES.map(s => (
                    <SelectItem key={s} value={s.toLowerCase()}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">URL Photo</Label>
              <Input
                value={formData.photo_url || ''}
                onChange={(e) => handleChange('photo_url', e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
          </div>
        )}

        {activeTab === 'social' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-slate-300">LinkedIn</Label>
              <Input
                value={formData.late_account_linkedin || ''}
                onChange={(e) => handleChange('late_account_linkedin', e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Instagram</Label>
              <Input
                value={formData.late_account_instagram || ''}
                onChange={(e) => handleChange('late_account_instagram', e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Facebook</Label>
              <Input
                value={formData.late_account_facebook || ''}
                onChange={(e) => handleChange('late_account_facebook', e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">TikTok</Label>
              <Input
                value={formData.late_account_tiktok || ''}
                onChange={(e) => handleChange('late_account_tiktok', e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Late Profile ID</Label>
              <Input
                value={formData.late_profile_id || ''}
                onChange={(e) => handleChange('late_profile_id', e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
          </div>
        )}

        {activeTab === 'style' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label className="text-slate-300">Couleur principale</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={formData.couleur_principale || '#003D2E'}
                    onChange={(e) => handleChange('couleur_principale', e.target.value)}
                    className="w-12 h-10 rounded border-2 border-slate-700 cursor-pointer"
                  />
                  <Input
                    value={formData.couleur_principale || '#003D2E'}
                    onChange={(e) => handleChange('couleur_principale', e.target.value)}
                    className="bg-slate-800 border-slate-700 text-slate-200 font-mono"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Couleur secondaire</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={formData.couleur_secondaire || '#0077FF'}
                    onChange={(e) => handleChange('couleur_secondaire', e.target.value)}
                    className="w-12 h-10 rounded border-2 border-slate-700 cursor-pointer"
                  />
                  <Input
                    value={formData.couleur_secondaire || '#0077FF'}
                    onChange={(e) => handleChange('couleur_secondaire', e.target.value)}
                    className="bg-slate-800 border-slate-700 text-slate-200 font-mono"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Couleur accent</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={formData.couleur_accent || '#3AFFA3'}
                    onChange={(e) => handleChange('couleur_accent', e.target.value)}
                    className="w-12 h-10 rounded border-2 border-slate-700 cursor-pointer"
                  />
                  <Input
                    value={formData.couleur_accent || '#3AFFA3'}
                    onChange={(e) => handleChange('couleur_accent', e.target.value)}
                    className="bg-slate-800 border-slate-700 text-slate-200 font-mono"
                  />
                </div>
              </div>
            </div>
            
            {/* Preview */}
            <div className="p-6 rounded-xl border border-slate-800 bg-slate-950/50">
              <h3 className="text-sm font-medium text-slate-400 mb-4">Aperçu</h3>
              <div className="flex gap-4 items-center">
                <div 
                  className="w-20 h-20 rounded-xl shadow-lg"
                  style={{ backgroundColor: formData.couleur_principale || '#003D2E' }}
                />
                <div 
                  className="w-20 h-20 rounded-xl shadow-lg"
                  style={{ backgroundColor: formData.couleur_secondaire || '#0077FF' }}
                />
                <div 
                  className="w-20 h-20 rounded-xl shadow-lg"
                  style={{ backgroundColor: formData.couleur_accent || '#3AFFA3' }}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'api' && (
          <div className="grid grid-cols-1 gap-6">
            <div className="space-y-2">
              <Label className="text-slate-300">Clé API Gemini</Label>
              <Input
                type="password"
                value={formData.api_key_gemini || ''}
                onChange={(e) => handleChange('api_key_gemini', e.target.value)}
                placeholder={formData.api_key_gemini ? '••••••••' : 'Entrez votre clé'}
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">GPT URL LinkedIn</Label>
              <Input
                value={formData.gpt_url_linkedin || ''}
                onChange={(e) => handleChange('gpt_url_linkedin', e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">GPT URL Instagram</Label>
              <Input
                value={formData.gpt_url_instagram || ''}
                onChange={(e) => handleChange('gpt_url_instagram', e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">GPT URL Sujets</Label>
              <Input
                value={formData.gpt_url_sujets || ''}
                onChange={(e) => handleChange('gpt_url_sujets', e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">GPT URL Default</Label>
              <Input
                value={formData.gpt_url_default || ''}
                onChange={(e) => handleChange('gpt_url_default', e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
            <p className="text-xs text-slate-500 font-inter">
              Les clés API sont stockées de manière sécurisée.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
