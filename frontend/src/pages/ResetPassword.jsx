import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Loader2, Eye, EyeOff, CheckCircle2, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { authService } from '../services/authService';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('Le mot de passe doit faire au moins 6 caractères');
      return;
    }
    if (password !== confirm) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }
    setLoading(true);
    try {
      await authService.resetPassword(token, password);
      setDone(true);
      toast.success('Mot de passe réinitialisé');
      setTimeout(() => navigate('/login'), 2500);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Lien invalide ou expiré');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#020617] relative overflow-hidden p-6">
      <div className="fixed inset-0 z-[1] pointer-events-none opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-72 h-72 bg-[#5B6CFF]/15 rounded-full blur-[100px]" />

      <div className="w-full max-w-md relative z-10">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] flex items-center justify-center shadow-lg shadow-[#5B6CFF]/25">
            <span className="text-xl font-bold text-white font-sora">P</span>
          </div>
          <span className="text-2xl font-bold text-white font-sora">PresenceOS</span>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          {!token ? (
            <div className="text-center space-y-4">
              <h2 className="text-xl font-bold font-sora text-white">Lien invalide</h2>
              <p className="text-sm text-slate-400 font-inter">
                Ce lien de réinitialisation est incomplet. Refaites une demande.
              </p>
              <Link to="/forgot-password" className="inline-block text-sm text-[#8A6CFF] hover:underline font-inter">
                Demander un nouveau lien
              </Link>
            </div>
          ) : done ? (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold font-sora text-white">C'est fait !</h2>
              <p className="text-sm text-slate-400 font-inter">
                Votre mot de passe a été réinitialisé. Redirection vers la connexion…
              </p>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold font-sora text-white">Nouveau mot de passe</h2>
                <p className="text-slate-400 mt-2 font-inter text-sm">Choisissez un nouveau mot de passe sécurisé.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-slate-300 font-inter">Nouveau mot de passe</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={show ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      data-testid="reset-password"
                      className="bg-slate-950/50 border-slate-800 focus:border-[#5B6CFF] focus:ring-1 focus:ring-[#5B6CFF] text-slate-200 placeholder:text-slate-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShow(!show)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm" className="text-slate-300 font-inter">Confirmer le mot de passe</Label>
                  <Input
                    id="confirm"
                    type={show ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    required
                    data-testid="reset-confirm"
                    className="bg-slate-950/50 border-slate-800 focus:border-[#5B6CFF] focus:ring-1 focus:ring-[#5B6CFF] text-slate-200 placeholder:text-slate-500"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  data-testid="reset-submit"
                  className="w-full bg-[#e7ecf5] text-[#0b1322] hover:bg-white transition-all duration-300 font-inter"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Réinitialiser
                </Button>
              </form>

              <div className="mt-6 text-center">
                <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-[#5B6CFF] transition-colors font-inter">
                  <ArrowLeft className="w-4 h-4" />
                  Retour à la connexion
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
