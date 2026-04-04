'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

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

const TOTAL_STEPS = 4;

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

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  // Generate next 14 days
  const dates = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push({
      value: d.toISOString().split('T')[0],
      label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      short: d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
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

  function selectAllWeekends() {
    const weekends = dates.filter(d => d.isWeekend).map(d => d.value);
    const allSelected = weekends.every(w => selectedDates.includes(w));
    if (allSelected) {
      setSelectedDates(selectedDates.filter(d => !weekends.includes(d)));
    } else {
      setSelectedDates([...new Set([...selectedDates, ...weekends])]);
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="text-4xl animate-pulse mb-3">⛳</div>
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Progress header */}
      <div className="px-5 pt-6 pb-3 sticky top-0 bg-white z-10 border-b border-gray-50">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-primary">TeeDrop</span>
            <span className="text-gray-300">·</span>
            <span className="text-xs text-gray-400">Step {step} of {TOTAL_STEPS}</span>
          </div>
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              className="text-xs text-primary font-semibold"
            >
              ← Back
            </button>
          )}
        </div>
        {/* Progress dots */}
        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={`flex-1 h-1 rounded-full transition-colors duration-300 ${
                i + 1 <= step ? 'bg-primary' : 'bg-gray-100'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 px-5 py-6">
        {/* Step 1: Courses */}
        {step === 1 && (
          <div>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">Which courses?</h1>
              <p className="text-gray-500 mt-1 text-sm">
                Pick up to {limits.courses} course{limits.courses > 1 ? 's' : ''} to watch
                {tier === 'free' && (
                  <> · <a href="/upgrade" className="text-primary font-medium">Upgrade</a> for more</>
                )}
              </p>
            </div>

            <div className="space-y-5">
              {COURSE_GROUPS.map(group => (
                <div key={group.region}>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
                    {group.region}
                  </p>
                  <div className="space-y-1.5">
                    {group.courses.map(course => {
                      const selected = courses.includes(course);
                      const locked = !selected && courses.length >= limits.courses;
                      return (
                        <button
                          key={course}
                          onClick={() => toggleCourse(course)}
                          disabled={locked}
                          className={`w-full text-left px-4 py-3.5 rounded-xl border text-sm transition-all ${
                            selected
                              ? 'border-primary bg-primary/5 text-primary font-semibold'
                              : locked
                              ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                              : 'border-gray-200 text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          <span className="flex items-center justify-between">
                            <span>{course}</span>
                            {selected ? (
                              <span className="w-5 h-5 bg-primary rounded-full flex items-center justify-center text-white text-xs flex-shrink-0">✓</span>
                            ) : locked ? (
                              <span className="text-gray-300 flex-shrink-0">🔒</span>
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="sticky bottom-0 pt-4 pb-6 bg-white mt-4">
              <button
                onClick={() => setStep(2)}
                disabled={courses.length === 0}
                className="w-full py-4 bg-primary text-white font-bold rounded-xl disabled:opacity-30 active:scale-95 transition-transform text-sm"
              >
                Next: Pick Dates →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Dates */}
        {step === 2 && (
          <div>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">Which days?</h1>
              <p className="text-gray-500 mt-1 text-sm">Tap the days you want to play</p>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              {dates.map(d => {
                const selected = selectedDates.includes(d.value);
                return (
                  <button
                    key={d.value}
                    onClick={() => toggleDate(d.value)}
                    className={`px-4 py-3.5 rounded-xl border text-sm transition-all text-left ${
                      selected
                        ? 'border-primary bg-primary/5 text-primary font-semibold'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <span className="flex items-center justify-between">
                      <span>
                        {d.label}
                        {d.isWeekend && !selected && (
                          <span className="block text-xs text-gray-400 font-normal">Weekend</span>
                        )}
                      </span>
                      {selected && (
                        <span className="w-5 h-5 bg-primary rounded-full flex items-center justify-center text-white text-xs flex-shrink-0">✓</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={selectAllWeekends}
              className="w-full py-3 text-primary text-sm font-semibold border border-primary/30 rounded-xl hover:bg-primary/5 transition"
            >
              Select all weekends
            </button>

            <div className="sticky bottom-0 pt-4 pb-6 bg-white mt-4">
              <button
                onClick={() => setStep(3)}
                disabled={selectedDates.length === 0}
                className="w-full py-4 bg-primary text-white font-bold rounded-xl disabled:opacity-30 active:scale-95 transition-transform text-sm"
              >
                Next: Time & Players →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Time + Players */}
        {step === 3 && (
          <div>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">When & how many?</h1>
              <p className="text-gray-500 mt-1 text-sm">Set your preferred tee time window</p>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">Time Window</label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">Earliest</label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={e => setStartTime(e.target.value)}
                      className="w-full px-3 py-3 rounded-xl border border-gray-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">Latest</label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={e => setEndTime(e.target.value)}
                      className="w-full px-3 py-3 rounded-xl border border-gray-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">Players in your group</label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map(n => (
                    <button
                      key={n}
                      onClick={() => setPlayers(n)}
                      className={`py-4 rounded-xl border text-sm font-bold transition-all ${
                        players === n
                          ? 'border-primary bg-primary text-white shadow-sm'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">Shows tee times with at least this many spots</p>
              </div>
            </div>

            <div className="sticky bottom-0 pt-4 pb-6 bg-white mt-8">
              <button
                onClick={() => setStep(4)}
                className="w-full py-4 bg-primary text-white font-bold rounded-xl active:scale-95 transition-transform text-sm"
              >
                Next: Set Up Alerts →
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Alerts */}
        {step === 4 && (
          <div>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">Get notified</h1>
              <p className="text-gray-500 mt-1 text-sm">We'll alert you the moment a matching tee time opens</p>
            </div>

            <div className="space-y-3">
              {/* Email toggle */}
              <button
                onClick={() => setAlertEmail(!alertEmail)}
                className={`w-full flex items-center gap-4 px-4 py-4 rounded-xl border transition-all ${
                  alertEmail ? 'border-primary bg-primary/5' : 'border-gray-200'
                }`}
              >
                <span className="text-2xl">📧</span>
                <div className="text-left flex-1">
                  <p className={`text-sm font-semibold ${alertEmail ? 'text-primary' : 'text-gray-900'}`}>Email Alerts</p>
                  <p className="text-xs text-gray-500">Free for all tiers — includes booking link</p>
                </div>
                <div className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 ${alertEmail ? 'bg-primary' : 'bg-gray-200'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow mt-0.5 transition-transform ${alertEmail ? 'ml-[22px]' : 'ml-0.5'}`} />
                </div>
              </button>

              {/* SMS toggle */}
              <button
                onClick={() => { if (tier !== 'free') setAlertSms(!alertSms); }}
                disabled={tier === 'free'}
                className={`w-full flex items-center gap-4 px-4 py-4 rounded-xl border transition-all ${
                  tier === 'free'
                    ? 'border-gray-100 bg-gray-50 cursor-default'
                    : alertSms
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-200'
                }`}
              >
                <span className="text-2xl">📱</span>
                <div className="text-left flex-1">
                  <p className={`text-sm font-semibold ${tier === 'free' ? 'text-gray-400' : alertSms ? 'text-primary' : 'text-gray-900'}`}>
                    Text Alerts
                  </p>
                  <p className="text-xs text-gray-500">
                    {tier === 'free' ? 'Premium only — instant SMS notifications' : 'Fastest — get booked before anyone else'}
                  </p>
                </div>
                {tier === 'free' ? (
                  <a
                    href="/upgrade"
                    onClick={e => e.stopPropagation()}
                    className="text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-lg flex-shrink-0"
                  >
                    Upgrade
                  </a>
                ) : (
                  <div className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 ${alertSms ? 'bg-primary' : 'bg-gray-200'}`}>
                    <div className={`w-5 h-5 bg-white rounded-full shadow mt-0.5 transition-transform ${alertSms ? 'ml-[22px]' : 'ml-0.5'}`} />
                  </div>
                )}
              </button>
            </div>

            {alertSms && tier !== 'free' && (
              <div className="mt-3">
                <label className="block text-xs text-gray-500 mb-1.5">Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+1 (206) 555-1234"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
            )}

            {/* Summary */}
            <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Summary</p>
              <p className="text-sm text-gray-700">
                Watching <span className="font-semibold">{courses.length} course{courses.length !== 1 ? 's' : ''}</span> on{' '}
                <span className="font-semibold">{selectedDates.length} date{selectedDates.length !== 1 ? 's' : ''}</span>,{' '}
                {startTime}–{endTime}, {players}p
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Alerts: {[alertEmail && 'Email', alertSms && 'SMS'].filter(Boolean).join(' + ') || 'None selected'}
              </p>
            </div>

            <div className="sticky bottom-0 pt-4 pb-6 bg-white mt-4">
              <button
                onClick={handleFinish}
                disabled={saving || (!alertEmail && !alertSms)}
                className="w-full py-4 bg-primary text-white font-bold rounded-xl disabled:opacity-30 active:scale-95 transition-transform text-sm"
              >
                {saving ? 'Saving...' : '✓ Start Watching'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
