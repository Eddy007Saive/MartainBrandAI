import { Link } from 'react-router-dom';
import { Clock, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/button';

export default function Pending() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#020617] relative overflow-hidden">
      {/* Background gradient orb */}
      <div className="bg-amber-600/20 blur-[100px] w-[500px] h-[500px] rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      
      {/* Noise overlay */}
      <div className="fixed inset-0 z-[1] pointer-events-none opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
      
      <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl relative z-10 text-center animate-fade-in">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-amber-500/20 flex items-center justify-center">
          <Clock className="w-10 h-10 text-amber-400" />
        </div>
        
        <h1 className="text-2xl font-bold font-sora text-white mb-3">
          Compte en attente
        </h1>
        
        <p className="text-slate-400 font-inter mb-8 leading-relaxed">
          Votre inscription a été enregistrée avec succès. 
          Un administrateur validera votre compte prochainement.
        </p>
        
        <Link to="/" data-testid="back-to-login">
          <Button
            variant="outline"
            className="bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 font-inter"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour à la connexion
          </Button>
        </Link>
      </div>
    </div>
  );
}
