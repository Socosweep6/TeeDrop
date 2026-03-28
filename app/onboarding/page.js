'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

const SEATTLE_COURSES = [
  'Jackson Park Golf Course',
  'Jefferson Park Golf Course',
  'West Seattle Golf Course',
  'Interbay Golf Center',
  'Bellevue Golf Course',
  'Willows Run Golf Complex',
  'Druids Glen Golf Course',
  'The Golf Club at Newcastle',
  'Washington National Golf Club',
  'Chambers Bay',
];

const TIER_LIMITS = {
  free: { courses: 1 },
  premium: { courses: 3 },
  allaccess: { courses: 10 },
};

export default function OnboardingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [courses, setCourses] = useState([]);
  const [selectedDates, setSelectedDates] = useState([]);
  const [startTime, setStartTime] = useState('07:00');
  const [endTime, setEndTime] = useState('10:00');
  const [players, setPlayers] = useState(4);
  const [alertEmail, setAlertEmail] = useState(true);
  const [alertSms, setAlertSms] = useState(false);
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const tier = session?.user?.tier || 'free';
  const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;
  const totalSteps = 4;

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  // Generate next 14 days for date picker
  const dates = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push({
      value: d.toISOString().split('T')[0],
      label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
    });
  }

  function toggleCourse(course) {
    if (courses.includes(course)) {
      setCourses(courses.filter(c => c !== course));
    } else if (courses.length < limits.courses) {
      setCourses([...courses, course]);
    }
  }

  function toggleDate(date) {
    if (selectedDates.includes(date)) {
      setSelectedDates(selectedDates.filter(d => d !== date));
    } else {
      setSelectedDates([...selectedDates, date]);
    }
  }

  async function handleFinish() {
    setSaving(true);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courses,
          selectedDates,
          startTime,
          endTime,
          players,
          alertEmail,
          alertSms,
          phone: phone || undefined,
          alertEmailAddress: session?.user?.email,
        }),
      });

      // Mark onboarding complete
      await fetch('/api/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboardingDone: true }),
      });

      router.push('/dashboard');
    } catch (err) {
      console.error('Save error:', err);
    }
    setSaving(false);
  }

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-500">Loading...</div></div>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Progress bar */}
      <div className="px-6 pt-6 pb-2">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-gray-400">Step {step} of {totalSteps}</span>
          {step > 1 && (
            <button onClick={() => setStep(step - 1)} className="text-xs text-primary font-medium">← Back</button>
          )}
        </div>
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex-1 px-6 py-6">
        {/* Step 1: Pick courses */}
        {step === 1 && (
          <div>
            <div className="text-center mb-6">
              <span className="text-4xl">⛳</span>
              <h1 className="text-2xl font-bold text-gray-900 mt-3">Which courses?</h1>
              <p className="text-gray-500 mt-2">Pick up to {limits.courses} course{limits.courses > 1 ? 's' : ''} to watch</p>
            </div>
            <div className="space-y-2">
              {SEATTLE_COURSES.map(course => {
                const selected = courses.includes(course);
                const locked = !selected && courses.length >= limits.courses;
                return (
                  <button
                    key={course}
                    onClick={() => toggleCourse(course)}
                    disabled={locked}
                    className={`w-full text-left px-4 py-3.5 rounded-xl border text-sm transition ${
                      selected ? 'border-primary bg-primary/5 text-primary font-medium'
                      : locked ? 'border-gray-100 bg-gray-50 text-gray-300'
                      : 'border-gray-200 text-gray-700'
                    }`}
                  >
                    {selected ? '✓ ' : ''}{course}
                    {locked && <span className="float-right">🔒</span>}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setStep(2)}
              disabled={courses.length === 0}
              className="w-full mt-6 py-4 bg-primary text-white font-semibold rounded-xl disabled:opacity-40 active:scale-95 transition-transform"
            >
              Next — Pick Dates →
            </button>
          </div>
        )}

        {/* Step 2: Pick specific dates */}
        {step === 2 && (
          <div>
            <div className="text-center mb-6">
              <span className="text-4xl">📅</span>
              <h1 className="text-2xl font-bold text-gray-900 mt-3">Which days?</h1>
              <p className="text-gray-500 mt-2">Tap the dates you want to play</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {dates.map(d => {
                const selected = selectedDates.includes(d.value);
                return (
                  <button
                    key={d.value}
                    onClick={() => toggleDate(d.value)}
                    className={`px-3 py-3 rounded-xl border text-sm transition text-left ${
                      selected ? 'border-primary bg-primary/5 text-primary font-medium'
                      : 'border-gray-200 text-gray-700'
                    } ${d.isWeekend ? 'font-medium' : ''}`}
                  >
                    {selected ? '✓ ' : ''}{d.label}
                    {d.isWeekend && !selected && <span className="text-xs text-gray-400 ml-1">weekend</span>}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => {
                const weekends = dates.filter(d => d.isWeekend).map(d => d.value);
                const allSelected = weekends.every(w => selectedDates.includes(w));
                if (allSelected) {
                  setSelectedDates(selectedDates.filter(d => !weekends.includes(d)));
                } else {
                  setSelectedDates([...new Set([...selectedDates, ...weekends])]);
                }
              }}
              className="w-full mt-3 py-2.5 text-primary text-sm font-medium border border-primary/30 rounded-xl"
            >
              Select all weekends
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={selectedDates.length === 0}
              className="w-full mt-4 py-4 bg-primary text-white font-semibold rounded-xl disabled:opacity-40 active:scale-95 transition-transform"
            >
              Next — Time & Players →
            </button>
          </div>
        )}

        {/* Step 3: Time window + players */}
        {step === 3 && (
          <div>
            <div className="text-center mb-6">
              <span className="text-4xl">🕐</span>
              <h1 className="text-2xl font-bold text-gray-900 mt-3">When & who?</h1>
              <p className="text-gray-500 mt-2">Set your preferred tee time window</p>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Time Window</label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Earliest</label>
                    <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                      className="w-full px-3 py-3 rounded-xl border border-gray-200 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Latest</label>
                    <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                      className="w-full px-3 py-3 rounded-xl border border-gray-200 text-sm" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Players</label>
                <div className="flex gap-3">
                  {[1, 2, 3, 4].map(n => (
                    <button key={n} onClick={() => setPlayers(n)}
                      className={`flex-1 py-3 rounded-xl border text-sm font-medium transition ${
                        players === n ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-600'
                      }`}>{n}</button>
                  ))}
                </div>
              </div>
            </div>

            <button onClick={() => setStep(4)}
              className="w-full mt-8 py-4 bg-primary text-white font-semibold rounded-xl active:scale-95 transition-transform">
              Next — Set Up Alerts →
            </button>
          </div>
        )}

        {/* Step 4: Alerts - THE PAYOFF */}
        {step === 4 && (
          <div>
            <div className="text-center mb-6">
              <span className="text-4xl">🔔</span>
              <h1 className="text-2xl font-bold text-gray-900 mt-3">Get notified</h1>
              <p className="text-gray-500 mt-2">We'll alert you the moment a matching tee time opens</p>
            </div>

            <div className="space-y-3">
              <button onClick={() => setAlertEmail(!alertEmail)}
                className={`w-full flex items-center justify-between px-4 py-4 rounded-xl border transition ${
                  alertEmail ? 'border-primary bg-primary/5' : 'border-gray-200'
                }`}>
                <div className="flex items-center gap-3">
                  <span className="text-xl">📧</span>
                  <div className="text-left">
                    <p className={`text-sm font-medium ${alertEmail ? 'text-primary' : 'text-gray-900'}`}>Email Alerts</p>
                    <p className="text-xs text-gray-500">All tiers — includes booking link</p>
                  </div>
                </div>
                <div className={`w-11 h-6 rounded-full transition-colors ${alertEmail ? 'bg-primary' : 'bg-gray-300'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow mt-0.5 transition-transform ${alertEmail ? 'ml-[22px]' : 'ml-0.5'}`} />
                </div>
              </button>

              <button
                onClick={() => { if (tier !== 'free') setAlertSms(!alertSms); }}
                disabled={tier === 'free'}
                className={`w-full flex items-center justify-between px-4 py-4 rounded-xl border transition ${
                  tier === 'free' ? 'border-gray-100 bg-gray-50'
                  : alertSms ? 'border-primary bg-primary/5' : 'border-gray-200'
                }`}>
                <div className="flex items-center gap-3">
                  <span className="text-xl">📱</span>
                  <div className="text-left">
                    <p className={`text-sm font-medium ${tier === 'free' ? 'text-gray-400' : alertSms ? 'text-primary' : 'text-gray-900'}`}>
                      Text Alerts
                    </p>
                    <p className="text-xs text-gray-500">{tier === 'free' ? 'Premium only 🔒' : 'Fastest — includes booking link'}</p>
                  </div>
                </div>
                {tier === 'free' ? (
                  <span className="text-xs text-primary font-medium">Upgrade</span>
                ) : (
                  <div className={`w-11 h-6 rounded-full transition-colors ${alertSms ? 'bg-primary' : 'bg-gray-300'}`}>
                    <div className={`w-5 h-5 bg-white rounded-full shadow mt-0.5 transition-transform ${alertSms ? 'ml-[22px]' : 'ml-0.5'}`} />
                  </div>
                )}
              </button>
            </div>

            {alertSms && tier !== 'free' && (
              <div className="mt-4">
                <label className="block text-xs text-gray-500 mb-1">Phone Number</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="+1 (206) 555-1234"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
              </div>
            )}

            {/* Summary */}
            <div className="mt-6 p-4 bg-gray-50 rounded-xl">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Your alert summary</p>
              <p className="text-sm text-gray-700">
                Watching <strong>{courses.length} course{courses.length !== 1 ? 's' : ''}</strong> on{' '}
                <strong>{selectedDates.length} date{selectedDates.length !== 1 ? 's' : ''}</strong>,{' '}
                {startTime}–{endTime}, {players} player{players !== 1 ? 's' : ''}.
              </p>
              <p className="text-sm text-gray-700 mt-1">
                Alerts via: {[alertEmail && 'Email', alertSms && 'SMS'].filter(Boolean).join(' + ') || 'None'}
              </p>
            </div>

            <button onClick={handleFinish} disabled={saving || (!alertEmail && !alertSms)}
              className="w-full mt-6 py-4 bg-primary text-white font-semibold rounded-xl disabled:opacity-40 active:scale-95 transition-transform">
              {saving ? 'Saving...' : '✓ Start Watching'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
