'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import BottomNav from '../components/BottomNav';
import Toast from '../components/Toast';

// Bug 1 fix: "Golf Club at Newcastle" matches lib/courses.js exactly (no "The")
const COURSE_GROUPS = [
  {
    region: 'Seattle',
    courses: [
      'Jackson Park Golf Course',
      'Jefferson Park Golf Course',
      'West Seattle Golf Course',
      'Interbay Golf Center',
    ],
  },
  {
    region: 'North',
    courses: [
      'Legion Memorial Golf Course',
      'Harbour Pointe Golf Club',
      'Battle Creek Golf Course',
    ],
  },
  {
    region: 'Eastside',
    courses: [
      'Bellevue Golf Course',
      'Willows Run Golf Complex',
      'Golf Club at Newcastle',
      'Redmond Ridge Golf Course',
    ],
  },
  {
    region: 'South',
    courses: [
      'Washington National Golf Club',
      'Druids Glen Golf Course',
      'Foster Golf Links',
      'Riverbend Golf Complex',
      'Maplewood Golf Course',
      'Chambers Bay',
    ],
  },
];

const TIER_LIMITS = {
  free: { courses: 1 },
  premium: { courses: 3 },
  allaccess: { courses: 10 },
};

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const tier = session?.user?.tier || 'free';
  const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/settings')
        .then(r => r.json())
        .then(data => setSettings(data.settings || {}))
        .catch(() => setSettings({}));
    }
  }, [status]);

  const dates = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push({
      value: d.toISOString().split('T')[0],
      day: d.toLocaleDateString('en-US', { weekday: 'short' }),
      date: d.getDate(),
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
    });
  }

  function toggleCourse(c) {
    const cur = settings?.courses || [];
    if (cur.includes(c)) {
      setSettings({ ...settings, courses: cur.filter(x => x !== c) });
    } else if (cur.length < limits.courses) {
      setSettings({ ...settings, courses: [...cur, c] });
    }
  }

  function toggleDate(d) {
    const cur = settings?.selectedDates || [];
    if (cur.includes(d)) {
      setSettings({ ...settings, selectedDates: cur.filter(x => x !== d) });
    } else {
      setSettings({ ...settings, selectedDates: [...cur, d] });
    }
  }

  function selectWeekends() {
    const wk = dates.filter(d => d.isWeekend).map(d => d.value);
    const cur = settings?.selectedDates || [];
    const all = wk.every(w => cur.includes(w));
    setSettings({
      ...settings,
      selectedDates: all ? cur.filter(d => !wk.includes(d)) : [...new Set([...cur, ...wk])],
    });
  }

  const dismissToast = useCallback(() => setToast(null), []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setToast({ message: 'Settings saved', type: 'success' });
      } else {
        setToast({ message: 'Failed to save', type: 'error' });
      }
    } catch {
      setToast({ message: 'Failed to save', type: 'error' });
    }
    setSaving(false);
  }

  if (status === 'loading' || !settings) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-4xl animate-pulse mb-3">⛳</div>
          <p className="text-gray-400 text-sm">Loading settings...</p>
        </div>
      </div>
    );
  }

  const cc = (settings.courses || []).length;
  const dc = (settings.selectedDates || []).length;
  const alertsActive = (settings.alertEmail || settings.alertSms) && cc > 0 && dc > 0;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {toast && <Toast message={toast.message} type={toast.type} onClose={dismissToast} />}

      {/* Header */}
      <div className="sticky top-0 z-40 px-5 py-3.5 bg-white border-b border-gray-100 flex items-center justify-between">
        <a href="/dashboard" className="text-sm text-gray-500 font-medium">← Back</a>
        <h1 className="text-base font-bold text-gray-900">Settings</h1>
        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full capitalize font-medium">{tier}</span>
      </div>

      <div className="px-4 py-5 pb-28 max-w-lg mx-auto w-full space-y-6">
        {/* Active alert status */}
        {alertsActive && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse"></span>
              <p className="text-sm font-bold text-primary">Alerts Active</p>
            </div>
            <p className="text-sm text-gray-700">
              Watching <strong>{cc} course{cc !== 1 ? 's' : ''}</strong> on <strong>{dc} date{dc !== 1 ? 's' : ''}</strong>,{' '}
              {settings.startTime || '07:00'}–{settings.endTime || '09:00'}, {settings.players || 4}p
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Via: {[settings.alertEmail && 'Email', settings.alertSms && 'SMS'].filter(Boolean).join(' + ')} &middot;{' '}
              {(settings.alertFrequency || 'instant') === 'instant' ? 'Instant' : (settings.alertFrequency || 'instant') === 'digest' ? 'Hourly digest' : 'Daily digest'}
            </p>
          </div>
        )}

        {/* Alert channel toggles */}
        <section>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">🔔</span>
            <h2 className="font-bold text-gray-900">Alerts</h2>
          </div>
          <p className="text-xs text-gray-500 mb-3">How you want to be notified</p>

          <div className="space-y-2.5">
            <button
              onClick={() => setSettings({ ...settings, alertEmail: !settings.alertEmail })}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all ${
                settings.alertEmail ? 'border-primary bg-primary/5' : 'border-gray-200 bg-white'
              }`}
            >
              <span className="text-xl">📧</span>
              <div className="text-left flex-1">
                <p className={`text-sm font-semibold ${settings.alertEmail ? 'text-primary' : 'text-gray-900'}`}>Email</p>
                <p className="text-xs text-gray-400">All tiers included</p>
              </div>
              <div className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 ${settings.alertEmail ? 'bg-primary' : 'bg-gray-200'}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow mt-0.5 transition-transform ${settings.alertEmail ? 'ml-[22px]' : 'ml-0.5'}`} />
              </div>
            </button>

            <button
              onClick={() => { if (tier !== 'free') setSettings({ ...settings, alertSms: !settings.alertSms }); }}
              disabled={tier === 'free'}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all ${
                tier === 'free' ? 'border-gray-100 bg-gray-50 cursor-default'
                : settings.alertSms ? 'border-primary bg-primary/5' : 'border-gray-200 bg-white'
              }`}
            >
              <span className="text-xl">📱</span>
              <div className="text-left flex-1">
                <p className={`text-sm font-semibold ${tier === 'free' ? 'text-gray-400' : settings.alertSms ? 'text-primary' : 'text-gray-900'}`}>SMS</p>
                <p className="text-xs text-gray-400">{tier === 'free' ? 'Premium & All Access only' : 'Fastest alert method'}</p>
              </div>
              {tier === 'free' ? (
                <a href="/upgrade" onClick={e => e.stopPropagation()} className="text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-lg flex-shrink-0">
                  Upgrade
                </a>
              ) : (
                <div className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 ${settings.alertSms ? 'bg-primary' : 'bg-gray-200'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow mt-0.5 transition-transform ${settings.alertSms ? 'ml-[22px]' : 'ml-0.5'}`} />
                </div>
              )}
            </button>
          </div>

          {settings.alertSms && tier !== 'free' && (
            <div className="mt-2.5">
              <input
                type="tel"
                value={settings.phone || ''}
                onChange={e => setSettings({ ...settings, phone: e.target.value })}
                placeholder="+1 (206) 555-1234"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
          )}

          {settings.alertEmail && (
            <div className="mt-2.5">
              <input
                type="email"
                value={settings.alertEmailAddress || session?.user?.email || ''}
                onChange={e => setSettings({ ...settings, alertEmailAddress: e.target.value })}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
          )}

          {/* Frequency */}
          <div className="mt-4">
            <label className="block text-xs font-semibold text-gray-500 mb-2">Alert Frequency</label>
            <div className="flex gap-2">
              {[
                { v: 'instant', l: 'Instant', d: 'As found' },
                { v: 'digest', l: 'Hourly', d: 'Digest' },
                { v: 'daily', l: 'Daily', d: '8 AM' },
              ].map(f => (
                <button
                  key={f.v}
                  onClick={() => setSettings({ ...settings, alertFrequency: f.v })}
                  className={`flex-1 py-2.5 rounded-xl border text-center transition-all ${
                    (settings.alertFrequency || 'instant') === f.v
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-gray-200 bg-white text-gray-600'
                  }`}
                >
                  <p className="text-sm font-semibold">{f.l}</p>
                  <p className="text-xs text-gray-400">{f.d}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Quiet hours */}
          <div className="mt-4">
            <label className="block text-xs font-semibold text-gray-500 mb-2">Quiet Hours (no alerts)</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">From</label>
                <input
                  type="time"
                  value={settings.quietHoursStart || '22:00'}
                  onChange={e => setSettings({ ...settings, quietHoursStart: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Until</label>
                <input
                  type="time"
                  value={settings.quietHoursEnd || '06:00'}
                  onChange={e => setSettings({ ...settings, quietHoursEnd: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Courses */}
        <section>
          <div className="flex justify-between items-baseline mb-1">
            <div className="flex items-center gap-2">
              <span className="text-base">📍</span>
              <h2 className="font-bold text-gray-900">Courses</h2>
            </div>
            <span className="text-xs text-gray-400">{cc}/{limits.courses} selected</span>
          </div>
          {tier === 'free' && (
            <p className="text-xs text-gray-400 mb-3">
              Free tier: 1 course · <a href="/upgrade" className="text-primary font-medium">Upgrade</a> for more
            </p>
          )}

          <div className="space-y-4">
            {COURSE_GROUPS.map(group => (
              <div key={group.region}>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">{group.region}</p>
                <div className="space-y-1.5">
                  {group.courses.map(course => {
                    const sel = (settings.courses || []).includes(course);
                    const lock = !sel && cc >= limits.courses;
                    return (
                      <button
                        key={course}
                        onClick={() => toggleCourse(course)}
                        disabled={lock}
                        className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all flex justify-between items-center ${
                          sel ? 'border-primary bg-primary/5 text-primary font-semibold'
                          : lock ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <span>{course}</span>
                        {sel ? (
                          <span className="w-5 h-5 bg-primary rounded-full flex items-center justify-center text-white text-xs flex-shrink-0">✓</span>
                        ) : lock ? (
                          <span className="text-xs text-gray-300">🔒</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Dates */}
        <section>
          <div className="flex justify-between items-baseline mb-1">
            <div className="flex items-center gap-2">
              <span className="text-base">📅</span>
              <h2 className="font-bold text-gray-900">Dates</h2>
            </div>
            <span className="text-xs text-gray-400">{dc} selected</span>
          </div>
          <p className="text-xs text-gray-400 mb-3">Which days you want to play</p>
          <div className="grid grid-cols-7 gap-1">
            {dates.map(d => {
              const sel = (settings.selectedDates || []).includes(d.value);
              return (
                <button
                  key={d.value}
                  onClick={() => toggleDate(d.value)}
                  className={`py-2 rounded-xl text-center transition-all ${
                    sel ? 'bg-primary text-white shadow-sm'
                    : d.isWeekend ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    : 'bg-white text-gray-600 border border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <p className="text-[9px] leading-none">{d.day}</p>
                  <p className="text-sm font-bold mt-0.5">{d.date}</p>
                </button>
              );
            })}
          </div>
          <button
            onClick={selectWeekends}
            className="w-full mt-2 py-2.5 text-primary text-xs font-semibold border border-primary/30 rounded-xl hover:bg-primary/5 transition"
          >
            Select all weekends
          </button>
        </section>

        {/* Time window */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">⏰</span>
            <h2 className="font-bold text-gray-900">Time Window</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Earliest</label>
              <input
                type="time"
                value={settings.startTime || '07:00'}
                onChange={e => setSettings({ ...settings, startTime: e.target.value })}
                className="w-full px-3 py-3 rounded-xl border border-gray-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Latest</label>
              <input
                type="time"
                value={settings.endTime || '09:00'}
                onChange={e => setSettings({ ...settings, endTime: e.target.value })}
                className="w-full px-3 py-3 rounded-xl border border-gray-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
          </div>
        </section>

        {/* Players */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">👥</span>
            <h2 className="font-bold text-gray-900">Players</h2>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map(n => (
              <button
                key={n}
                onClick={() => setSettings({ ...settings, players: n })}
                className={`py-3.5 rounded-xl border text-sm font-bold transition-all ${
                  (settings.players || 4) === n
                    ? 'border-primary bg-primary text-white shadow-sm'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </section>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-4 bg-primary text-white font-bold rounded-xl shadow-sm active:scale-95 transition-all disabled:opacity-50 text-sm"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
