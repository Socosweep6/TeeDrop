'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.96L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}


export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(null);

  const passwordsMatch = password === confirmPassword;
  const showMismatch = confirmPassword.length > 0 && !passwordsMatch;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!passwordsMatch) { setError('Passwords do not match'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create account'); return; }
      router.push('/login?registered=true');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider) {
    setOauthLoading(provider);
    await signIn(provider, { callbackUrl: '/dashboard' });
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-5 py-12">
      {/* Brand */}
      <div className="text-center mb-8">
        <a href="/" className="inline-flex items-center gap-2">
          <span className="text-3xl">⛳</span>
          <span className="text-3xl font-bold text-primary">TeeDrop</span>
        </a>
        <p className="text-gray-500 text-sm mt-1.5">Get alerts for prime Seattle tee times</p>
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 w-full max-w-sm">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Create account</h1>
        <p className="text-gray-500 text-sm mb-6">Free to start — no credit card required</p>

        {error && (
          <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* SSO buttons */}
        <div className="space-y-2.5 mb-5">
          <button
            onClick={() => handleOAuth('google')}
            disabled={!!oauthLoading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-50"
          >
            <GoogleIcon />
            {oauthLoading === 'google' ? 'Redirecting...' : 'Continue with Google'}
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-xs text-gray-400 font-medium">or email</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Name</label>
            <input
              type="text"
              className="w-full px-4 py-3.5 rounded-xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition text-sm"
              placeholder="Your name"
              required
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email</label>
            <input
              type="email"
              className="w-full px-4 py-3.5 rounded-xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition text-sm"
              placeholder="you@example.com"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Password</label>
            <input
              type="password"
              className="w-full px-4 py-3.5 rounded-xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition text-sm"
              placeholder="••••••••"
              minLength={6}
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Confirm Password</label>
            <input
              type="password"
              className={`w-full px-4 py-3.5 rounded-xl border outline-none transition text-sm ${
                showMismatch
                  ? 'border-red-400 focus:ring-2 focus:ring-red-200'
                  : 'border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20'
              }`}
              placeholder="••••••••"
              required
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
            />
            {showMismatch && (
              <p className="mt-1.5 text-xs text-red-600">Passwords do not match</p>
            )}
          </div>
          <button
            type="submit"
            disabled={loading || showMismatch}
            className="w-full py-3.5 bg-primary text-white font-bold rounded-xl shadow-sm active:scale-95 transition-transform disabled:opacity-50 text-sm"
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>
      </div>

      <p className="text-center mt-5 text-gray-500 text-sm">
        Already have an account?{' '}
        <a href="/login" className="text-primary font-semibold">Sign in</a>
      </p>
    </div>
  );
}
