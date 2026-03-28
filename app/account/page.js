'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';

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
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [tab, setTab] = useState('profile');

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

  async function handleSaveProfile() {
    setSaving(true); setError(''); setMessage('');
    const res = await fetch('/api/account', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone }),
    });
    const data = await res.json();
    if (res.ok) setMessage('Profile updated');
    else setError(data.error);
    setSaving(false);
  }

  async function handleChangePassword() {
    setError(''); setMessage('');
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    setSaving(true);
    const res = await fetch('/api/account', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage('Password changed');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } else setError(data.error);
    setSaving(false);
  }

  async function handleDeleteAccount() {
    const res = await fetch('/api/account', { method: 'DELETE' });
    if (res.ok) signOut({ callbackUrl: '/' });
  }

  async function handleTestAlert(method) {
    setMessage(''); setError('');
    const res = await fetch('/api/alerts/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method }),
    });
    const data = await res.json();
    if (res.ok && data.sent) setMessage(`Test ${method} sent to ${data.to}`);
    else setError(data.error || `Failed to send test ${method}`);
  }

  if (status === 'loading' || !user) {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-500">Loading...</div></div>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="px-6 py-4 bg-white border-b border-gray-100 flex justify-between items-center">
        <a href="/dashboard" className="text-sm text-gray-600">← Dashboard</a>
        <h1 className="text-lg font-bold text-gray-900">Account</h1>
        <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full capitalize">{user.tier}</span>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border-b border-gray-100">
        {['profile', 'password', 'alerts', 'test'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium transition ${
              tab === t ? 'text-primary border-b-2 border-primary' : 'text-gray-500'
            }`}>
            {t === 'profile' ? 'Profile' : t === 'password' ? 'Password' : t === 'alerts' ? 'History' : 'Test'}
          </button>
        ))}
      </div>

      <div className="px-6 py-6">
        {message && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">{message}</div>}
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>}

        {/* Profile tab */}
        {tab === 'profile' && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input type="email" value={user.email} disabled
                className="w-full px-4 py-3 rounded-xl border border-gray-100 text-sm bg-gray-50 text-gray-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="+1 (206) 555-1234"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Member since</label>
              <p className="text-sm text-gray-500">{new Date(user.createdAt).toLocaleDateString()}</p>
            </div>
            <button onClick={handleSaveProfile} disabled={saving}
              className="w-full py-3.5 bg-primary text-white font-semibold rounded-xl active:scale-95 transition disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Profile'}
            </button>

            <div className="pt-6 border-t border-gray-200">
              <button onClick={() => setShowDelete(!showDelete)}
                className="text-sm text-red-500 font-medium">Delete Account</button>
              {showDelete && (
                <div className="mt-3 p-4 bg-red-50 rounded-xl">
                  <p className="text-sm text-red-700 mb-3">This permanently deletes your account, settings, and alert history.</p>
                  <button onClick={handleDeleteAccount}
                    className="w-full py-3 bg-red-500 text-white font-semibold rounded-xl text-sm">
                    Confirm Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Password tab */}
        {tab === 'password' && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Current Password</label>
              <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Confirm New Password</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border text-sm outline-none ${
                  confirmPassword && newPassword !== confirmPassword ? 'border-red-400' : 'border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20'
                }`} />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
              )}
            </div>
            <button onClick={handleChangePassword} disabled={saving || !currentPassword || !newPassword}
              className="w-full py-3.5 bg-primary text-white font-semibold rounded-xl active:scale-95 transition disabled:opacity-50">
              {saving ? 'Changing...' : 'Change Password'}
            </button>
          </div>
        )}

        {/* Alert History tab */}
        {tab === 'alerts' && (
          <div>
            <h2 className="font-semibold text-gray-900 mb-4">Alert History</h2>
            {alerts.length === 0 ? (
              <div className="text-center py-12">
                <span className="text-3xl">🔕</span>
                <p className="text-gray-500 mt-3 text-sm">No alerts sent yet</p>
                <p className="text-gray-400 text-xs mt-1">You'll see alerts here once matching tee times are found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map(a => (
                  <div key={a.id} className="bg-white p-4 rounded-xl border border-gray-100">
                    <div className="flex justify-between items-start mb-1">
                      <p className="text-sm font-medium text-gray-900">{a.course}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        a.method === 'sms' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                      }`}>{a.method}</span>
                    </div>
                    <p className="text-xs text-gray-500">{a.date} at {a.time} • {a.price}</p>
                    <p className="text-xs text-gray-400 mt-1">Sent {new Date(a.sentAt).toLocaleString()}</p>
                    {a.bookingUrl && (
                      <a href={a.bookingUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-primary font-medium mt-2 inline-block">Book →</a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Test Alerts tab */}
        {tab === 'test' && (
          <div>
            <h2 className="font-semibold text-gray-900 mb-2">Test Your Alerts</h2>
            <p className="text-sm text-gray-500 mb-6">Send a test alert to verify everything is working</p>
            <div className="space-y-3">
              <button onClick={() => handleTestAlert('email')}
                className="w-full flex items-center justify-between px-4 py-4 bg-white rounded-xl border border-gray-200 active:scale-[0.99] transition">
                <div className="flex items-center gap-3">
                  <span className="text-xl">📧</span>
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-900">Send Test Email</p>
                    <p className="text-xs text-gray-500">To: {user.email}</p>
                  </div>
                </div>
                <span className="text-primary text-sm font-medium">Send →</span>
              </button>

              <button onClick={() => handleTestAlert('sms')}
                disabled={user.tier === 'free' || !phone}
                className={`w-full flex items-center justify-between px-4 py-4 bg-white rounded-xl border transition ${
                  user.tier === 'free' || !phone ? 'border-gray-100 opacity-50' : 'border-gray-200 active:scale-[0.99]'
                }`}>
                <div className="flex items-center gap-3">
                  <span className="text-xl">📱</span>
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-900">Send Test SMS</p>
                    <p className="text-xs text-gray-500">
                      {user.tier === 'free' ? 'Premium only' : phone ? `To: ${phone}` : 'Add phone number first'}
                    </p>
                  </div>
                </div>
                <span className="text-primary text-sm font-medium">Send →</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
