'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import BottomNav from '../components/BottomNav';

function SkeletonCard() {
  return (
    <div className="bg-white p-4 rounded-2xl border border-gray-100 animate-pulse">
      <div className="flex justify-between items-start mb-3">
        <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        <div className="h-4 bg-gray-200 rounded w-14"></div>
      </div>
      <div className="flex gap-3 mb-3">
        <div className="h-3 bg-gray-100 rounded w-16"></div>
        <div className="h-3 bg-gray-100 rounded w-12"></div>
        <div className="h-3 bg-gray-100 rounded w-14"></div>
      </div>
      <div className="h-10 bg-gray-100 rounded-xl"></div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [teeTimes, setTeeTimes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastScraped, setLastScraped] = useState(null);
  const [total, setTotal] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated' && session?.user?.onboardingDone === false) {
      router.push('/onboarding');
    }
  }, [status, session, router]);

  const fetchTimes = useCallback(async () => {
    try {
      const res = await fetch('/api/times');
      const data = await res.json();
      setTeeTimes(data.teeTimes || []);
      setLastScraped(data.lastScraped);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to fetch tee times:', err);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchTimes();
      const interval = setInterval(fetchTimes, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [status, fetchTimes]);

  // Bug 4 fix: removed hardcoded cron secret — refresh just re-fetches from DB
  async function handleRefresh() {
    setRefreshing(true);
    await fetchTimes();
  }

  const tier = session?.user?.tier || 'free';

  function getLastUpdatedLabel() {
    if (!lastScraped) return null;
    const diff = Math.floor((Date.now() - new Date(lastScraped).getTime()) / 60000);
    if (diff < 1) return 'just now';
    if (diff === 1) return '1 min ago';
    if (diff < 60) return `${diff} min ago`;
    return new Date(lastScraped).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-4xl animate-pulse mb-3">⛳</div>
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Group tee times by date
  const grouped = {};
  for (const tt of teeTimes) {
    const key = tt.rawDate || tt.date;
    if (!grouped[key]) grouped[key] = { label: tt.date, times: [] };
    grouped[key].times.push(tt);
  }

  const nextTeeTime = teeTimes[0] || null;
  const remainingTimes = teeTimes.slice(1);

  // Grouped remaining times
  const groupedRemaining = {};
  for (const tt of remainingTimes) {
    const key = tt.rawDate || tt.date;
    if (!groupedRemaining[key]) groupedRemaining[key] = { label: tt.date, times: [] };
    groupedRemaining[key].times.push(tt);
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-40 px-5 py-3.5 bg-white border-b border-gray-100 flex justify-between items-center">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">⛳</span>
          <span className="text-lg font-bold text-gray-900">TeeDrop</span>
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full capitalize font-medium">{tier}</span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Sign out
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-5 pb-24 max-w-lg mx-auto w-full">
        {loading ? (
          <div className="space-y-3">
            <div className="h-36 bg-gray-200 rounded-2xl animate-pulse mb-5"></div>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : teeTimes.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-5">🏌️</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">No tee times found</h2>
            <p className="text-gray-500 text-sm mb-6 max-w-xs mx-auto">
              Chester's still scanning. Try adjusting your course selection or date preferences.
            </p>
            <div className="flex flex-col gap-3 items-center">
              <a
                href="/settings"
                className="px-6 py-3 bg-primary text-white font-semibold rounded-xl text-sm active:scale-95 transition-transform"
              >
                Update Settings
              </a>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="px-6 py-3 border border-gray-200 text-gray-600 font-medium rounded-xl text-sm active:scale-95 transition-transform disabled:opacity-50"
              >
                {refreshing ? 'Checking...' : 'Check Again'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Summary bar */}
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-semibold text-gray-700">
                  {total} tee time{total !== 1 ? 's' : ''} available
                </p>
                {lastScraped && (
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    {refreshing && <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse inline-block"></span>}
                    Updated {getLastUpdatedLabel()}
                  </p>
                )}
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary text-xs font-semibold rounded-full hover:bg-primary/20 transition disabled:opacity-50"
              >
                <span className={refreshing ? 'animate-spin' : ''}>↻</span>
                {refreshing ? 'Refreshing' : 'Refresh'}
              </button>
            </div>

            {/* Hero: next available tee time */}
            {nextTeeTime && (
              <div className="bg-gradient-to-br from-primary to-green-700 text-white p-5 rounded-2xl shadow-md">
                <p className="text-xs font-semibold text-green-200 uppercase tracking-wider mb-2">Next Available</p>
                <h3 className="text-lg font-bold leading-tight">{nextTeeTime.course}</h3>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm text-green-100">
                  <span>{nextTeeTime.date}</span>
                  <span className="text-green-300">·</span>
                  <span>{nextTeeTime.time}</span>
                  <span className="text-green-300">·</span>
                  <span>{nextTeeTime.players}p</span>
                  <span className="text-green-300">·</span>
                  <span>{nextTeeTime.holes}h</span>
                </div>
                <div className="flex items-center justify-between mt-4">
                  <span className="text-2xl font-bold">{nextTeeTime.price}</span>
                  {nextTeeTime.bookingUrl ? (
                    <a
                      href={nextTeeTime.bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-5 py-2.5 bg-white text-primary font-bold rounded-xl text-sm active:scale-95 transition-transform shadow-sm"
                    >
                      Book Now →
                    </a>
                  ) : (
                    <span className="px-5 py-2.5 bg-white/20 text-white/70 font-medium rounded-xl text-sm">
                      No link
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Remaining tee times grouped by date */}
            {Object.entries(groupedRemaining).map(([dateKey, group]) => (
              <div key={dateKey}>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2.5 px-1">
                  {group.label}
                </h3>
                <div className="space-y-2">
                  {group.times.map((tt) => (
                    <TeeTimeCard key={tt.id} tt={tt} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

function TeeTimeCard({ tt }) {
  return (
    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 active:scale-[0.99] transition-transform">
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1 min-w-0 pr-3">
          <h4 className="font-semibold text-gray-900 text-sm leading-tight truncate">{tt.course}</h4>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-gray-500">
            <span>⏰ {tt.time}</span>
            <span>👥 {tt.players}p</span>
            <span>⛳ {tt.holes}h</span>
          </div>
        </div>
        <span className="text-primary font-bold text-sm flex-shrink-0">{tt.price}</span>
      </div>
      {tt.bookingUrl && (
        <a
          href={tt.bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block w-full py-2.5 bg-primary text-white text-sm font-semibold rounded-xl text-center active:scale-95 transition-transform"
        >
          Book Now →
        </a>
      )}
    </div>
  );
}
