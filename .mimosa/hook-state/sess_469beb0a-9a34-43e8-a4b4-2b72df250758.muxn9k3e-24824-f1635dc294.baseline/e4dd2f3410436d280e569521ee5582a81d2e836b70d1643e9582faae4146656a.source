import { FormEvent, useState, useEffect } from 'react';
import { markPageReady } from '../utils/startupMetrics';
import { Dumbbell } from 'lucide-react';
import { loginWithEmail, registerWithEmail } from '../api';

export default function AuthScreen() {
  useEffect(() => { markPageReady('login-page-ready'); }, []);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
    if (mode === 'register') {
      if (password.length < 6) {
        setError('密码至少需要 6 位');
        return;
      }
      if (password !== confirmPassword) {
        setError('两次密码不一致，请重新输入');
        return;
      }
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
    <div className="auth-shell min-h-dvh bg-paper flex items-center justify-center p-4">
      <div className="auth-panel w-full max-w-md bg-white">
        <div className="auth-brand-panel">
          <div className="flex items-center gap-2.5">
            <div className="bg-neon text-ink p-2"><Dumbbell size={24} /></div>
            <span className="text-2xl font-black tracking-tighter uppercase italic">FitGroup</span>
          </div>
          <div className="mt-7 md:my-12">
            <p className="text-3xl md:text-4xl font-black leading-tight tracking-tight">每一次训练，<br /><span className="text-neon">都算数。</span></p>
            <p className="mt-3 text-sm leading-relaxed text-white/70">记录进步，和健友一起坚持。</p>
          </div>
          <p className="hidden md:block text-xs font-bold text-white/60">训练记录 / 成长统计 / 好友小队</p>
        </div>
        <div className="auth-form-panel">
        <h1 className="font-black text-2xl mb-2">
          {mode === 'login' ? '登录打卡' : '创建账号'}
        </h1>
        <p className="text-sm leading-relaxed text-ink/60 mb-6">
          {mode === 'login' ? '欢迎回来，继续积累你的进步。' : '从今天开始，留下你的训练足迹。'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label htmlFor="auth-name" className="block text-xs font-bold mb-2">昵称</label>
              <input
                id="auth-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="input-field"
                placeholder="你的名字"
                autoComplete="nickname"
              />
            </div>
          )}
          <div>
            <label htmlFor="auth-email" className="block text-xs font-bold mb-2">邮箱</label>
            <input
              id="auth-email"
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
            <label htmlFor="auth-password" className="block text-xs font-bold mb-2">密码</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="brutalist-input"
              placeholder="至少 6 位"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </div>
          {mode === 'register' && (
            <div>
              <label htmlFor="auth-confirm" className="block text-xs font-bold mb-2">确认密码</label>
              <input
                id="auth-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="brutalist-input"
                placeholder="再次输入密码"
                autoComplete="new-password"
                required
              />
            </div>
          )}

          {error && (
            <p role="alert" className="bg-red-50 text-red-800 text-sm font-medium p-3 border border-red-200">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="btn-neon-lg w-full disabled:opacity-50"
            aria-busy={busy}
          >
            {busy ? '请稍候...' : mode === 'login' ? '登录' : '注册'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
          className="mt-4 min-h-11 w-full text-center text-sm font-bold text-ink/60 hover:text-ink cursor-pointer"
        >
          {mode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
        </button>
        </div>
      </div>
    </div>
  );
}
