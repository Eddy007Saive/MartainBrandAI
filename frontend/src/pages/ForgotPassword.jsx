import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ArrowLeft, MailCheck } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { authService } from '../services/authService';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authService.forgotPassword(email);
      setSent(true);
    } catch (error) {
      toast.error("Une erreur est survenue. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#020617] relative overflow-hidden p-6">
      <div className="fixed inset-0 z-[1] pointer-events-none opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-72 h-72 bg-[#5B6CFF]/15 rounded-full blur-[100px]" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] flex items-center justify-center shadow-lg shadow-[#5B6CFF]/25">
            <span className="text-xl font-bold text-white font-sora">P</span>
          </div>
          <span className="text-2xl font-bold text-white font-sora">PresenceOS</span>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <MailCheck className="w-7 h-7 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold font-sora text-white">Vérifiez votre boîte mail</h2>
              <p className="text-sm text-slate-400 font-inter leading-relaxed">
                Si un compte est associé à <span className="text-slate-200">{email}</span>, un lien de réinitialisation vient d'être envoyé.
                Le lien expire dans 1 heure.
              </p>
              <p className="text-xs text-slate-500 font-inter">Pensez à vérifier vos spams.</p>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold font-sora text-white">Mot de passe oublié</h2>
                <p className="text-slate-400 mt-2 font-inter text-sm">
                  Entrez votre email, on vous envoie un lien de réinitialisation.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-300 font-inter">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="votre@email.com"
                    required
                    data-testid="forgot-email"
                    className="bg-slate-950/50 border-slate-800 focus:border-[#5B6CFF] focus:ring-1 focus:ring-[#5B6CFF] text-slate-200 placeholder:text-slate-500"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  data-testid="forgot-submit"
                  className="w-full bg-[#e7ecf5] text-[#0b1322] hover:bg-white transition-all duration-300 font-inter"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Envoyer le lien
                </Button>
              </form>
            </>
          )}

          <div className="mt-6 text-center">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-[#5B6CFF] transition-colors font-inter"
            >
              <ArrowLeft className="w-4 h-4" />
              Retour à la connexion
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
