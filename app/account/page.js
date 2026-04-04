'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import BottomNav from '../components/BottomNav';
import Toast from '../components/Toast';

export default function AccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [showDelete, setShowDelete] = useState(false);
  const [tab, setTab] = useState('profile');
  const [testLoading, setTestLoading] = useState(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/account').then(r => r.json()).then(data => {
        if (data.user) {
          setUser(data.user);
          setName(data.user.name);
          setPhone(data.user.phone || '');
        }
      });
      fetch('/api/alerts').then(r => r.json()).then(data => {
        setAlerts(data.alerts || []);
      });
    }
  }, [status]);

  const dismissToast = useCallback(() => setToast(null), []);

  async function handleSaveProfile() {
    setSaving(true);
    const res = await fetch('/api/account', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone }),
    });
    const data = await res.json();
    if (res.ok) setToast({ message: 'Profile updated', type: 'success' });
    else setToast({ message: data.error || 'Failed to save', type: 'error' });
    setSaving(false);
  }

  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      setToast({ message: 'Passwords do not match', type: 'error' });
      return;
    }
    if (newPassword.length < 6) {
      setToast({ message: 'Password must be at least 6 characters', type: 'error' });
      return;
    }
    setSaving(true);
    const res = await fetch('/api/account', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    if (res.ok) {
      setToast({ message: 'Password changed', type: 'success' });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } else {
      setToast({ message: data.error || 'Failed to change password', type: 'error' });
    }
    setSaving(false);
  }

  async function handleDeleteAccount() {
    const res = await fetch('/api/account', { method: 'DELETE' });
    if (res.ok) signOut({ callbackUrl: '/' });
  }

  async function handleTestAlert(method) {
    setTestLoading(method);
    const res = await fetch('/api/alerts/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method }),
    });
    const data = await res.json();
    if (res.ok && data.sent) {
      setToast({ message: `Test ${method} sent to ${data.to}`, type: 'success' });
    } else {
      setToast({ message: data.error || `Failed to send test ${method}`, type: 'error' });
    }
    setTestLoading(null);
  }

  if (status === 'loading' || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-4xl animate-pulse mb-3">⛳</div>
          <p className="text-gray-400 text-sm">Loading account...</p>
        </div>
      </div>
    );
  }

  const initials = user.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user.email[0].toUpperCase();

  const TABS = [
    { id: 'profile', label: 'Profile' },
    { id: 'password', label: 'Password' },
    { id: 'alerts', label: 'History' },
    { id: 'test', label: 'Test' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {toast && <Toast message={toast.message} type={toast.type} onClose={dismissToast} />}

      {/* Header */}
      <div className="sticky top-0 z-40 px-5 py-3.5 bg-white border-b border-gray-100 flex items-center justify-between">
        <a href="/dashboard" className="text-sm text-gray-500 font-medium">← Back</a>
        <h1 className="text-base font-bold text-gray-900">Account</h1>
        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full capitalize font-medium">{user.tier}</span>
      </div>

      {/* User summary */}
      <div className="px-5 py-5 bg-white border-b border-gray-100">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary rounded-full flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-gray-900 truncate">{user.name}</p>
            <p className="text-sm text-gray-500 truncate">{user.email}</p>
            <p className="text-xs text-gray-400 mt-0.5">Member since {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border-b border-gray-100">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-3 text-xs font-semibold transition-colors ${
              tab === t.id ? 'text-primary border-b-2 border-primary' : 'text-gray-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 px-5 py-5 pb-24 max-w-lg mx-auto w-full">
        {/* Profile */}
        {tab === 'profile' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email</label>
              <input
                type="email"
                value={user.email}
                disabled
                className="w-full px-4 py-3 rounded-xl border border-gray-100 text-sm bg-gray-50 text-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+1 (206) 555-1234"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="w-full py-3.5 bg-primary text-white font-bold rounded-xl active:scale-95 transition-transform disabled:opacity-50 text-sm"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>

            <div className="pt-5 mt-5 border-t border-gray-100">
              <button
                onClick={() => setShowDelete(!showDelete)}
                className="text-sm text-red-500 font-medium"
              >
                Delete Account
              </button>
              {showDelete && (
                <div className="mt-3 p-4 bg-red-50 border border-red-100 rounded-xl">
                  <p className="text-sm text-red-700 mb-3">This permanently deletes your account, settings, and alert history.</p>
                  <button
                    onClick={handleDeleteAccount}
                    className="w-full py-3 bg-red-500 text-white font-bold rounded-xl text-sm active:scale-95 transition-transform"
                  >
                    Confirm Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Password */}
        {tab === 'password' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border text-sm outline-none ${
                  confirmPassword && newPassword !== confirmPassword
                    ? 'border-red-400 focus:ring-2 focus:ring-red-200'
                    : 'border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20'
                }`}
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
              )}
            </div>
            <button
              onClick={handleChangePassword}
              disabled={saving || !currentPassword || !newPassword}
              className="w-full py-3.5 bg-primary text-white font-bold rounded-xl active:scale-95 transition-transform disabled:opacity-50 text-sm"
            >
              {saving ? 'Changing...' : 'Change Password'}
            </button>
          </div>
        )}

        {/* Alert History */}
        {tab === 'alerts' && (
          <div>
            {alerts.length === 0 ? (
              <div className="text-center py-14">
                <div className="text-5xl mb-4">🔕</div>
                <p className="font-semibold text-gray-700 mb-1">No alerts yet</p>
                <p className="text-gray-400 text-sm">Alerts appear here once matching tee times are found</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="text-xs text-gray-400 font-medium mb-3">{alerts.length} alert{alerts.length !== 1 ? 's' : ''} sent</p>
                {alerts.map(a => (
                  <div key={a.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <div className="flex justify-between items-start mb-1.5">
                      <p className="text-sm font-semibold text-gray-900 flex-1 pr-2">{a.course}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                        a.method === 'sms'
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-purple-50 text-purple-600'
                      }`}>
                        {a.method.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{a.date} · {a.time}{a.price ? ` · ${a.price}` : ''}</p>
                    <p className="text-xs text-gray-400 mt-1">{new Date(a.sentAt).toLocaleString()}</p>
                    {a.bookingUrl && (
                      <a
                        href={a.bookingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary font-semibold mt-2 inline-block"
                      >
                        Book →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Test Alerts */}
        {tab === 'test' && (
          <div>
            <p className="text-sm text-gray-500 mb-5">Send a test alert to confirm everything is working.</p>
            <div className="space-y-3">
              <button
                onClick={() => handleTestAlert('email')}
                disabled={testLoading === 'email'}
                className="w-full flex items-center gap-4 px-4 py-4 bg-white rounded-xl border border-gray-200 active:scale-[0.99] transition hover:border-gray-300 disabled:opacity-60"
              >
                <span className="text-2xl">📧</span>
                <div className="text-left flex-1">
                  <p className="text-sm font-semibold text-gray-900">Send Test Email</p>
                  <p className="text-xs text-gray-400">To: {user.email}</p>
                </div>
                <span className="text-primary text-sm font-bold">
                  {testLoading === 'email' ? '...' : 'Send →'}
                </span>
              </button>

              <button
                onClick={() => handleTestAlert('sms')}
                disabled={user.tier === 'free' || !phone || testLoading === 'sms'}
                className={`w-full flex items-center gap-4 px-4 py-4 bg-white rounded-xl border transition ${
                  user.tier === 'free' || !phone
                    ? 'border-gray-100 opacity-50 cursor-not-allowed'
                    : 'border-gray-200 active:scale-[0.99] hover:border-gray-300 disabled:opacity-60'
                }`}
              >
                <span className="text-2xl">📱</span>
                <div className="text-left flex-1">
                  <p className="text-sm font-semibold text-gray-900">Send Test SMS</p>
                  <p className="text-xs text-gray-400">
                    {user.tier === 'free' ? 'Premium only' : phone ? `To: ${phone}` : 'Add phone number first'}
                  </p>
                </div>
                <span className="text-primary text-sm font-bold">
                  {testLoading === 'sms' ? '...' : 'Send →'}
                </span>
              </button>
            </div>

            {user.tier === 'free' && (
              <div className="mt-5 p-4 bg-primary/5 border border-primary/20 rounded-xl">
                <p className="text-sm font-semibold text-primary mb-1">Want SMS alerts?</p>
                <p className="text-xs text-gray-600 mb-3">Upgrade to Premium for instant text notifications.</p>
                <a href="/upgrade" className="text-xs font-bold text-primary">View plans →</a>
              </div>
            )}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
