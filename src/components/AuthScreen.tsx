import { FormEvent, useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { loginWithEmail, registerWithEmail } from '../firebase';

export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('请填写邮箱和密码');
      return;
    }
    if (mode === 'register' && password.length < 6) {
      setError('密码至少需要 6 位');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'register') {
        await registerWithEmail(email, password, displayName);
      } else {
        await loginWithEmail(email, password);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border-4 border-ink shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="bg-ink p-1">
            <Dumbbell className="text-neon" size={24} />
          </div>
          <span className="text-3xl font-black tracking-tighter text-ink uppercase italic">FitGroup</span>
        </div>
        <h1 className="font-black uppercase italic text-2xl mb-1">
          {mode === 'login' ? '登录打卡' : '创建账号'}
        </h1>
        <p className="text-[10px] font-black uppercase tracking-widest text-ink/40 mb-6">
          Email / Password · Firebase Auth
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-[10px] font-black uppercase mb-2">昵称</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="brutalist-input uppercase"
                placeholder="你的名字"
                autoComplete="nickname"
              />
            </div>
          )}
          <div>
            <label className="block text-[10px] font-black uppercase mb-2">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="brutalist-input"
              placeholder="you@email.com"
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase mb-2">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="brutalist-input"
              placeholder="至少 6 位"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </div>

          {error && (
            <p className="bg-ink text-neon text-xs font-black p-3 border-2 border-ink">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="brutalist-button w-full disabled:opacity-50"
          >
            {busy ? '请稍候...' : mode === 'login' ? '登录' : '注册'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
          className="mt-4 w-full text-center text-xs font-black uppercase tracking-widest text-ink/60 hover:text-ink cursor-pointer"
        >
          {mode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
        </button>
      </div>
    </div>
  );
}
