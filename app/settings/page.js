'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

const COURSES = [
  'Jackson Park Golf Course', 'Jefferson Park Golf Course', 'West Seattle Golf Course',
  'Interbay Golf Center', 'Bellevue Golf Course', 'Willows Run Golf Complex',
  'Druids Glen Golf Course', 'The Golf Club at Newcastle', 'Washington National Golf Club', 'Chambers Bay',
];
const TIER_LIMITS = { free: { courses: 1 }, premium: { courses: 3 }, allaccess: { courses: 10 } };

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const tier = session?.user?.tier || 'free';
  const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;

  useEffect(() => { if (status === 'unauthenticated') router.push('/login'); }, [status, router]);
  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/settings').then(r => r.json()).then(data => setSettings(data.settings || {})).catch(() => {});
    }
  }, [status]);

  const dates = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    dates.push({ value: d.toISOString().split('T')[0], day: d.toLocaleDateString('en-US', { weekday: 'short' }), date: d.getDate(), isWeekend: d.getDay() === 0 || d.getDay() === 6 });
  }

  function toggleCourse(c) {
    const cur = settings?.courses || [];
    if (cur.includes(c)) setSettings({ ...settings, courses: cur.filter(x => x !== c) });
    else if (cur.length < limits.courses) setSettings({ ...settings, courses: [...cur, c] });
  }
  function toggleDate(d) {
    const cur = settings?.selectedDates || [];
    if (cur.includes(d)) setSettings({ ...settings, selectedDates: cur.filter(x => x !== d) });
    else setSettings({ ...settings, selectedDates: [...cur, d] });
  }
  function selectWeekends() {
    const wk = dates.filter(d => d.isWeekend).map(d => d.value);
    const cur = settings?.selectedDates || [];
    const all = wk.every(w => cur.includes(w));
    setSettings({ ...settings, selectedDates: all ? cur.filter(d => !wk.includes(d)) : [...new Set([...cur, ...wk])] });
  }
  async function handleSave() {
    setSaving(true);
    try {
      await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) {}
    setSaving(false);
  }

  if (status === 'loading' || !settings) return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-500">Loading...</div></div>;

  const cc = (settings.courses || []).length;
  const dc = (settings.selectedDates || []).length;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="px-6 py-4 bg-white border-b border-gray-100 flex justify-between items-center">
        <a href="/dashboard" className="text-sm text-gray-600">&larr; Back</a>
        <h1 className="text-lg font-bold text-gray-900">Settings</h1>
        <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full capitalize">{tier}</span>
      </div>
      <div className="px-6 py-6 space-y-8">

        {/* Active Summary */}
        {(settings.alertEmail || settings.alertSms) && cc > 0 && dc > 0 && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse"></span>
              <p className="text-sm font-semibold text-primary">Alerts Active</p>
            </div>
            <p className="text-sm text-gray-700">
              Watching <strong>{cc} course{cc !== 1 ? 's' : ''}</strong> on <strong>{dc} date{dc !== 1 ? 's' : ''}</strong>, {settings.startTime||'07:00'}&ndash;{settings.endTime||'09:00'}, {settings.players||4}p
            </p>
            <p className="text-xs text-gray-500 mt-1">Via: {[settings.alertEmail && 'Email', settings.alertSms && 'SMS'].filter(Boolean).join(' + ')} &middot; {(settings.alertFrequency||'instant') === 'instant' ? 'Instant' : (settings.alertFrequency||'instant') === 'digest' ? 'Hourly digest' : 'Daily digest'}</p>
          </div>
        )}

        {/* Alerts */}
        <div>
          <div className="flex items-center gap-2 mb-1"><span className="text-lg">🔔</span><h2 className="font-semibold text-gray-900">Alerts</h2></div>
          <p className="text-sm text-gray-500 mb-4">How do you want to be notified?</p>
          <div className="space-y-3">
            <button onClick={() => setSettings({ ...settings, alertEmail: !settings.alertEmail })} className={`w-full flex items-center justify-between px-4 py-4 rounded-xl border transition ${settings.alertEmail ? 'border-primary bg-primary/5' : 'border-gray-200'}`}>
              <div className="flex items-center gap-3"><span className="text-xl">📧</span><div className="text-left"><p className={`text-sm font-medium ${settings.alertEmail ? 'text-primary' : 'text-gray-900'}`}>Email</p><p className="text-xs text-gray-500">All tiers</p></div></div>
              <div className={`w-11 h-6 rounded-full ${settings.alertEmail ? 'bg-primary' : 'bg-gray-300'}`}><div className={`w-5 h-5 bg-white rounded-full shadow mt-0.5 transition-transform ${settings.alertEmail ? 'ml-[22px]' : 'ml-0.5'}`}/></div>
            </button>
            <button onClick={() => { if (tier !== 'free') setSettings({ ...settings, alertSms: !settings.alertSms }); }} disabled={tier === 'free'} className={`w-full flex items-center justify-between px-4 py-4 rounded-xl border transition ${tier === 'free' ? 'border-gray-100 bg-gray-50' : settings.alertSms ? 'border-primary bg-primary/5' : 'border-gray-200'}`}>
              <div className="flex items-center gap-3"><span className="text-xl">📱</span><div className="text-left"><p className={`text-sm font-medium ${tier === 'free' ? 'text-gray-400' : settings.alertSms ? 'text-primary' : 'text-gray-900'}`}>SMS</p><p className="text-xs text-gray-500">{tier === 'free' ? 'Premium+ 🔒' : 'Premium & All Access'}</p></div></div>
              {tier === 'free' ? <span className="text-xs text-primary font-medium">Upgrade</span> : <div className={`w-11 h-6 rounded-full ${settings.alertSms ? 'bg-primary' : 'bg-gray-300'}`}><div className={`w-5 h-5 bg-white rounded-full shadow mt-0.5 transition-transform ${settings.alertSms ? 'ml-[22px]' : 'ml-0.5'}`}/></div>}
            </button>
          </div>
          {settings.alertSms && tier !== 'free' && <div className="mt-3"><input type="tel" value={settings.phone||''} onChange={e => setSettings({...settings, phone: e.target.value})} placeholder="+1 (206) 555-1234" className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-primary outline-none"/></div>}
          {settings.alertEmail && <div className="mt-3"><input type="email" value={settings.alertEmailAddress || session?.user?.email || ''} onChange={e => setSettings({...settings, alertEmailAddress: e.target.value})} placeholder="you@example.com" className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-primary outline-none"/></div>}

          {/* Frequency */}
          <div className="mt-4">
            <label className="block text-xs text-gray-500 mb-2">Alert Frequency</label>
            <div className="flex gap-2">
              {[{v:'instant',l:'Instant',d:'As found'},{v:'digest',l:'Hourly',d:'Digest'},{v:'daily',l:'Daily',d:'8 AM'}].map(f => (
                <button key={f.v} onClick={() => setSettings({...settings, alertFrequency: f.v})} className={`flex-1 py-2.5 rounded-xl border text-center transition ${(settings.alertFrequency||'instant')===f.v ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-600'}`}>
                  <p className="text-sm font-medium">{f.l}</p><p className="text-xs text-gray-400">{f.d}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Quiet hours */}
          <div className="mt-4">
            <label className="block text-xs text-gray-500 mb-2">Quiet Hours (no alerts)</label>
            <div className="grid grid-cols-2 gap-3">
              <input type="time" value={settings.quietHoursStart||'22:00'} onChange={e => setSettings({...settings, quietHoursStart: e.target.value})} className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm"/>
              <input type="time" value={settings.quietHoursEnd||'06:00'} onChange={e => setSettings({...settings, quietHoursEnd: e.target.value})} className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm"/>
            </div>
          </div>
        </div>

        {/* Courses */}
        <div>
          <div className="flex justify-between items-baseline mb-1"><h2 className="font-semibold text-gray-900">Courses</h2><span className="text-xs text-gray-400">{cc}/{limits.courses}</span></div>
          <div className="space-y-2">
            {COURSES.map(course => {
              const sel = (settings.courses||[]).includes(course);
              const lock = !sel && cc >= limits.courses;
              return (<button key={course} onClick={() => toggleCourse(course)} disabled={lock} className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition flex justify-between items-center ${sel ? 'border-primary bg-primary/5 text-primary font-medium' : lock ? 'border-gray-100 bg-gray-50 text-gray-300' : 'border-gray-200 text-gray-700'}`}><span>{sel ? '✓ ':''}{course}</span>{lock && <span className="text-xs">🔒</span>}</button>);
            })}
          </div>
        </div>

        {/* Date picker */}
        <div>
          <div className="flex justify-between items-baseline mb-1"><h2 className="font-semibold text-gray-900">Dates</h2><span className="text-xs text-gray-400">{dc} selected</span></div>
          <p className="text-sm text-gray-500 mb-3">Tap dates to watch for tee times</p>
          <div className="grid grid-cols-7 gap-1.5">
            {dates.map(d => {
              const sel = (settings.selectedDates||[]).includes(d.value);
              return (<button key={d.value} onClick={() => toggleDate(d.value)} className={`py-2 rounded-lg text-center transition ${sel ? 'bg-primary text-white' : d.isWeekend ? 'bg-gray-100 text-gray-700' : 'bg-white text-gray-600 border border-gray-100'}`}><p className="text-[10px] leading-none">{d.day}</p><p className="text-sm font-semibold mt-0.5">{d.date}</p></button>);
            })}
          </div>
          <button onClick={selectWeekends} className="w-full mt-2 py-2 text-primary text-xs font-medium border border-primary/30 rounded-xl">Select all weekends</button>
        </div>

        {/* Time */}
        <div>
          <h2 className="font-semibold text-gray-900 mb-3">Time Window</h2>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs text-gray-500 mb-1">Earliest</label><input type="time" value={settings.startTime||'07:00'} onChange={e => setSettings({...settings, startTime: e.target.value})} className="w-full px-3 py-3 rounded-xl border border-gray-200 text-sm"/></div>
            <div><label className="block text-xs text-gray-500 mb-1">Latest</label><input type="time" value={settings.endTime||'09:00'} onChange={e => setSettings({...settings, endTime: e.target.value})} className="w-full px-3 py-3 rounded-xl border border-gray-200 text-sm"/></div>
          </div>
        </div>

        {/* Players */}
        <div>
          <h2 className="font-semibold text-gray-900 mb-3">Players</h2>
          <div className="flex gap-3">
            {[1,2,3,4].map(n => (<button key={n} onClick={() => setSettings({...settings, players: n})} className={`flex-1 py-3 rounded-xl border text-sm font-medium transition ${(settings.players||4)===n ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-600'}`}>{n}</button>))}
          </div>
        </div>

        <button onClick={handleSave} disabled={saving} className="w-full py-4 bg-primary text-white font-semibold rounded-xl shadow-lg active:scale-95 transition disabled:opacity-50">
          {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
