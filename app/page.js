import Link from 'next/link';

export const metadata = {
  title: 'TeeDrop — Seattle Golf Tee Time Alerts',
  description: 'Get instant alerts the moment prime tee times open at 20+ Seattle-area golf courses. Never miss your shot.',
};

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col bg-[#fafaf8]">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="bg-[#0f4c2a] px-6 pt-14 pb-16 overflow-hidden relative">
        {/* Subtle texture overlay */}
        <div className="absolute inset-0 opacity-[0.04]" style={{backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px'}} />

        <div className="relative z-10 max-w-sm mx-auto text-center">
          {/* Wordmark */}
          <div className="inline-flex items-center gap-2 mb-10">
            <span className="text-2xl">⛳</span>
            <span className="text-white text-xl font-bold tracking-tight">TeeDrop</span>
          </div>

          {/* Headline */}
          <h1 className="text-[2.6rem] font-bold text-white leading-[1.1] tracking-tight mb-5">
            Never miss a<br />
            <span className="text-[#4ade80]">prime tee time</span>
          </h1>
          <p className="text-white/70 text-base leading-relaxed mb-10 max-w-[260px] mx-auto">
            Real-time alerts when your preferred times open at 20+ Seattle courses.
          </p>

          {/* Phone notification mockup */}
          <div className="mx-auto w-[280px] mb-10">
            <div className="bg-white/10 backdrop-blur rounded-2xl p-1 shadow-2xl border border-white/20">
              <div className="bg-[#1a1a1a] rounded-xl overflow-hidden">
                {/* Status bar */}
                <div className="px-4 py-2 flex justify-between items-center">
                  <span className="text-white/50 text-[10px] font-medium">9:41 AM</span>
                  <div className="flex gap-1">
                    <span className="text-white/50 text-[10px]">●●●</span>
                  </div>
                </div>
                {/* Notification */}
                <div className="mx-3 mb-3 bg-[#2a2a2a] rounded-xl p-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-[#16a34a] rounded-lg flex items-center justify-center text-base flex-shrink-0">⛳</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline">
                        <span className="text-white text-[11px] font-semibold">TeeDrop</span>
                        <span className="text-white/40 text-[10px]">now</span>
                      </div>
                      <p className="text-white text-[12px] font-medium mt-0.5 leading-tight">Tee time just opened</p>
                      <p className="text-white/60 text-[11px] mt-0.5 leading-tight">Harbour Pointe · Sat Apr 12 · 8:30 AM</p>
                    </div>
                  </div>
                  <div className="mt-2.5 pt-2.5 border-t border-white/10 flex gap-2">
                    <button className="flex-1 py-1.5 bg-[#16a34a] rounded-lg text-white text-[11px] font-bold">Book Now →</button>
                    <button className="flex-1 py-1.5 bg-white/10 rounded-lg text-white/70 text-[11px] font-medium">Dismiss</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CTAs */}
          <div className="flex flex-col gap-3 max-w-xs mx-auto">
            <a
              href="/signup"
              className="block w-full py-4 px-6 bg-[#4ade80] text-[#0f4c2a] font-bold rounded-2xl text-center text-[15px] shadow-lg shadow-black/20 active:scale-[0.98] transition-transform"
            >
              Get Started Free
            </a>
            <a
              href="/login"
              className="block w-full py-3.5 px-6 bg-white/10 text-white font-semibold rounded-2xl text-center text-[15px] border border-white/20 active:scale-[0.98] transition-transform"
            >
              Sign In
            </a>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section className="px-6 py-12 bg-[#fafaf8]">
        <div className="max-w-sm mx-auto">
          <p className="text-xs font-bold text-[#16a34a] uppercase tracking-widest mb-3">How it works</p>
          <h2 className="text-2xl font-bold text-gray-900 mb-8 leading-tight">Set it up once.<br />Get alerted instantly.</h2>

          <div className="space-y-6">
            {[
              {
                n: '01',
                title: 'Pick your courses & dates',
                desc: 'Choose up to 10 Seattle-area courses and the dates and times that work for your schedule.',
              },
              {
                n: '02',
                title: 'We monitor 24/7',
                desc: 'Our system checks 20+ booking platforms around the clock for new openings.',
              },
              {
                n: '03',
                title: 'You get the alert first',
                desc: 'Email or SMS the instant a matching time opens — before anyone else sees it.',
              },
              {
                n: '04',
                title: 'Tap and book',
                desc: 'Your alert includes a direct link to the course booking page. One tap.',
              },
            ].map((item) => (
              <div key={item.n} className="flex gap-4">
                <div className="w-8 h-8 bg-[#0f4c2a] rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-white/80">{item.n}</span>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-[15px] leading-snug">{item.title}</h3>
                  <p className="text-gray-500 text-sm mt-1 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Courses ───────────────────────────────────────────────────── */}
      <section className="px-6 py-10 bg-white border-y border-gray-100">
        <div className="max-w-sm mx-auto">
          <p className="text-xs font-bold text-[#16a34a] uppercase tracking-widest mb-3">Coverage</p>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">20+ courses covered</h2>

          <div className="space-y-4">
            {[
              { region: 'Seattle', courses: ['Jackson Park', 'Jefferson Park', 'West Seattle', 'Interbay'] },
              { region: 'Eastside', courses: ['Golf Club at Newcastle', 'Redmond Ridge', 'Willows Run', 'Bellevue Golf'] },
              { region: 'South', courses: ['Chambers Bay', 'Washington National', 'Druids Glen', 'Foster Golf Links', 'Riverbend'] },
              { region: 'North', courses: ['Harbour Pointe', 'Legion Memorial', 'Battle Creek'] },
            ].map(group => (
              <div key={group.region}>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{group.region}</p>
                <div className="flex flex-wrap gap-1.5">
                  {group.courses.map(c => (
                    <span key={c} className="px-3 py-1.5 bg-gray-50 border border-gray-100 text-gray-600 text-xs font-medium rounded-xl">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────────────────── */}
      <section className="px-6 py-12 bg-[#fafaf8]">
        <div className="max-w-sm mx-auto">
          <p className="text-xs font-bold text-[#16a34a] uppercase tracking-widest mb-3">Pricing</p>
          <h2 className="text-2xl font-bold text-gray-900 mb-8">Simple, fair plans</h2>

          <div className="space-y-3">
            <div className="bg-white p-5 rounded-2xl border border-gray-100">
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-base font-bold text-gray-900">Free</span>
                <span className="text-sm font-bold text-gray-400">$0</span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">1 course · Email alerts · All dates</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border-2 border-[#16a34a] shadow-lg shadow-[#16a34a]/10 relative">
              <div className="absolute -top-3 left-5">
                <span className="bg-[#16a34a] text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wide">Most popular</span>
              </div>
              <div className="flex justify-between items-baseline mb-2 mt-1">
                <span className="text-base font-bold text-gray-900">Premium</span>
                <span className="text-sm font-bold text-[#16a34a]">$4.99/mo</span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">3 courses · Email + SMS · All dates</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-100">
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-base font-bold text-gray-900">All Access</span>
                <span className="text-sm font-bold text-gray-400">$9.99/mo</span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">10+ courses · Email + SMS · Priority alerts</p>
            </div>
          </div>

          <a
            href="/signup"
            className="block w-full mt-6 py-4 bg-[#0f4c2a] text-white font-bold rounded-2xl text-center text-[15px] active:scale-[0.98] transition-transform"
          >
            Start Free — No Card Required
          </a>
          <p className="text-center text-xs text-gray-400 mt-3">No credit card required · Cancel anytime</p>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="px-6 py-8 bg-[#0f4c2a] text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="text-lg">⛳</span>
          <span className="text-white font-bold text-base">TeeDrop</span>
        </div>
        <p className="text-white/40 text-xs">Seattle golf tee time alerts · © 2026</p>
      </footer>

    </main>
  );
}
