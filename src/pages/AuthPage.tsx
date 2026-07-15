import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { Logo } from '../components/Logo';
import { CheckCircle2, Clock, FileText, Users, BarChart3, ArrowRight, Loader2 } from 'lucide-react';

export function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    if (mode === 'login') {
      const { error } = await signIn(email.trim(), password);
      if (error) setError(error);
    } else {
      if (displayName.trim().length < 2) {
        setError('Display name must be at least 2 characters.');
        setLoading(false);
        return;
      }
      const { error } = await signUp(email.trim(), password, displayName.trim());
      if (error) setError(error);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      {/* Left: Brand / feature panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-slate-900 via-brand-blue-900 to-brand-green-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -right-20 top-20 h-72 w-72 rounded-full bg-brand-green-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-10 bottom-20 h-64 w-64 rounded-full bg-brand-yellow-500/15 blur-3xl" />
        <div className="pointer-events-none absolute right-1/3 top-1/2 h-40 w-40 rounded-full bg-brand-blue-400/20 blur-3xl" />

        <div className="relative z-10">
          <Logo size="lg" className="[&_span]:text-white [&_span:last-child]:text-brand-green-400" />
        </div>

        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl font-extrabold leading-tight text-white">
            Track shifts. Report progress. <span className="text-brand-yellow-400">Get paid.</span>
          </h1>
          <p className="mt-4 text-lg text-slate-300">
            The workspace tool built for freelancers and contractors — clock in, manage tasks, generate
            progress reports, and keep your team in sync.
          </p>

          <div className="mt-8 space-y-4">
            {[
              { icon: Clock, title: 'Shift Management', desc: 'Clock in/out, hourly rates in EUR, auto-calculated totals' },
              { icon: BarChart3, title: 'Live Progress Reports', desc: 'Auto-calculated completion from your task checklist' },
              { icon: FileText, title: 'PDF Export', desc: 'Professional reports with one-click download' },
              { icon: Users, title: 'Realtime Chat', desc: 'Workspace channels and direct messaging' },
            ].map((f) => (
              <div key={f.title} className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20">
                  <f.icon className="h-5 w-5 text-brand-green-400" />
                </div>
                <div>
                  <p className="font-semibold text-white">{f.title}</p>
                  <p className="text-sm text-slate-400">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2 text-sm text-slate-400">
          <CheckCircle2 className="h-4 w-4 text-brand-green-400" />
          Trusted by freelance teams across Europe
        </div>
      </div>

      {/* Right: Auth form */}
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 lg:min-h-0">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo size="md" />
          </div>

          <div className="card p-8 animate-slide-up">
            <h2 className="text-2xl font-bold text-slate-900">
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="mt-1.5 text-sm text-slate-500">
              {mode === 'login'
                ? 'Sign in to your EloLink workspace'
                : 'Start tracking shifts and progress today'}
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {mode === 'signup' && (
                <div>
                  <label className="label" htmlFor="displayName">Display name</label>
                  <input
                    id="displayName"
                    className="input"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Jane Doe"
                    autoComplete="name"
                  />
                </div>
              )}
              <div>
                <label className="label" htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                  minLength={6}
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700 ring-1 ring-red-200">
                  {error}
                </div>
              )}

              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {mode === 'login' ? 'Sign in' : 'Create account'}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-5 text-center text-sm text-slate-500">
              {mode === 'login' ? (
                <>
                  Don't have an account?{' '}
                  <button
                    className="font-semibold text-brand-green-600 hover:text-brand-green-700"
                    onClick={() => { setMode('signup'); setError(null); }}
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button
                    className="font-semibold text-brand-green-600 hover:text-brand-green-700"
                    onClick={() => { setMode('login'); setError(null); }}
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            By continuing you agree to EloLink's terms of service and privacy policy.
          </p>
        </div>
      </div>
    </div>
  );
}
