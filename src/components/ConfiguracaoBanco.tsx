import React, { useState } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';

interface ConfiguracaoBancoProps {
  user: any;
}

const ConfiguracaoBanco: React.FC<ConfiguracaoBancoProps> = ({ user }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleConnect = async () => {
    console.log('handleConnect called. Current user:', user);
    if (!user?.id || !user?.email) {
      console.error('Dados do usuário incompletos para onboarding Stripe:', user);
      setError('Dados do usuário incompletos. Por favor, tente sair e entrar novamente.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body = {
        uid: user.id,
        email: user.email,
      };
      console.log('Enviando requisição onboarding Stripe:', body);
      const response = await fetch('/api/stripe/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (data.url) {
        window.location.assign(data.url);
      } else {
        throw new Error(data.error || 'Erro ao gerar link de onboarding');
      }
    } catch (err: any) {
      console.error('Erro no onboarding:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-neutral-900 p-6 rounded-3xl border border-white/10 shadow-2xl bg-gradient-to-br from-neutral-900 to-neutral-950">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-500/10 rounded-xl border border-orange-500/20">
            <RefreshCw className={`w-5 h-5 text-orange-500 ${loading ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Configuração Bancária</h3>
            <p className="text-neutral-400 text-xs">Conecte sua conta Stripe para receber pagamentos dos alunos.</p>
          </div>
        </div>
        {user?.stripeConnected && (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Conectado</span>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-red-500 text-xs">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <button
          onClick={handleConnect}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-2xl transition-all shadow-lg shadow-orange-500/20 active:scale-[0.98]"
        >
          {loading ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <ExternalLink className="w-4 h-4" />
              {user?.stripeConnected ? 'Gerenciar Conta Stripe' : 'Conectar com Stripe'}
            </>
          )}
        </button>
        
        <p className="text-[10px] text-neutral-500 text-center px-4">
          Ao clicar em conectar, você será redirecionado para o Stripe para configurar seus dados de recebimento.
          O repasse é de 100% do valor líquido.
        </p>
      </div>
    </div>
  );
};

export default ConfiguracaoBanco;
