'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [teeTimes, setTeeTimes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastScraped, setLastScraped] = useState(null);
  const [total, setTotal] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
    // Redirect to onboarding if not completed
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
      // Auto-refresh every 5 minutes
      const interval = setInterval(fetchTimes, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [status, fetchTimes]);

  async function handleRefresh() {
    setRefreshing(true);
    // Trigger a manual scrape then refresh
    try {
      await fetch('/api/cron/scrape?secret=teedrop-cron-2026');
    } catch (e) {}
    await fetchTimes();
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
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

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="px-6 py-4 bg-white border-b border-gray-100 flex justify-between items-center">
        <h1 className="text-xl font-bold text-primary">TeeDrop</h1>
        <div className="flex items-center gap-3">
          <a href="/settings" className="text-sm text-gray-600 hover:text-primary">Settings</a>
          <a href="/account" className="text-sm text-gray-600 hover:text-primary">Account</a>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="px-6 py-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Available Tee Times</h2>
            <p className="text-sm text-gray-500">
              {session?.user?.tier || 'free'} tier • {total} result{total !== 1 ? 's' : ''}
            </p>
            {lastScraped && (
              <p className="text-xs text-gray-400 mt-1">
                Last updated: {new Date(lastScraped).toLocaleString()}
              </p>
            )}
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary text-xs font-medium rounded-full hover:bg-primary/20 transition disabled:opacity-50"
          >
            {refreshing ? (
              <>
                <span className="animate-spin">↻</span>
                Scanning...
              </>
            ) : (
              <>
                <span>↻</span>
                Refresh
              </>
            )}
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">
            <div className="text-3xl mb-3 animate-pulse">⛳</div>
            Searching for tee times...
          </div>
        ) : teeTimes.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🏌️</div>
            <p className="text-gray-600 font-medium mb-2">No tee times found</p>
            <p className="text-gray-400 text-sm mb-4">
              Try adjusting your course selection, dates, or time window
            </p>
            <div className="flex gap-3 justify-center">
              <a href="/settings" className="text-primary font-medium text-sm">
                Update settings →
              </a>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="text-primary font-medium text-sm"
              >
                Scan now →
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([dateKey, group]) => (
              <div key={dateKey}>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  {group.label}
                </h3>
                <div className="space-y-2">
                  {group.times.map((tt) => (
                    <div
                      key={tt.id}
                      className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 active:scale-[0.99] transition-transform"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 text-sm">{tt.course}</h4>
                          <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-500">
                            <span>🕐 {tt.time}</span>
                            <span>👥 {tt.players}p</span>
                            <span>⛳ {tt.holes}h</span>
                          </div>
                        </div>
                        <span className="text-primary font-bold text-sm">{tt.price}</span>
                      </div>
                      {tt.bookingUrl && (
                        <a
                          href={tt.bookingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 block w-full py-2.5 bg-primary text-white text-sm font-medium rounded-xl text-center active:scale-95 transition-transform"
                        >
                          Book Now →
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
