import Link from 'next/link';

export const metadata = {
  title: 'TeeDrop - Seattle Golf Tee Time Alerts',
  description: 'Get instant alerts when prime tee times open up at Seattle-area golf courses. Never miss your shot.',
};

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col bg-white">
      {/* Hero */}
      <div className="relative flex flex-col items-center justify-center px-6 py-16 text-center overflow-hidden bg-gradient-to-b from-primary/8 via-primary/4 to-white">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-xs font-semibold px-3 py-1.5 rounded-full mb-6 uppercase tracking-wide">
            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></span>
            Seattle-area courses
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4 leading-tight">
            Never miss a<br />
            <span className="text-primary">prime tee time</span>
          </h1>
          <p className="text-gray-500 text-base mb-8 max-w-xs mx-auto leading-relaxed">
            TeeDrop scans 20+ Seattle-area courses around the clock and alerts you the moment a matching time opens up.
          </p>
          <div className="flex flex-col gap-3 w-full max-w-xs mx-auto">
            <a
              href="/signup"
              className="block w-full py-4 px-6 bg-primary text-white font-bold rounded-xl text-center shadow-md shadow-primary/20 active:scale-95 transition-transform"
            >
              Get Started Free
            </a>
            <a
              href="/login"
              className="block w-full py-3.5 px-6 bg-white text-primary font-semibold rounded-xl text-center border-2 border-primary active:scale-95 transition-transform"
            >
              Sign In
            </a>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="px-6 py-10 bg-white">
        <h2 className="text-xl font-bold text-gray-900 mb-6">How it works</h2>
        <div className="space-y-5">
          {[
            {
              icon: '🎯',
              title: 'Set your preferences',
              desc: 'Choose your courses, preferred dates, time window, and players.',
            },
            {
              icon: '🔍',
              title: 'Chester scans 24/7',
              desc: 'Our scraper on a dedicated machine monitors booking systems around the clock.',
            },
            {
              icon: '🔔',
              title: 'Get alerted instantly',
              desc: 'Email or SMS the moment a matching tee time opens — before it\'s gone.',
            },
            {
              icon: '⛳',
              title: 'Book and play',
              desc: 'Tap the link in your alert and book directly on the course\'s site.',
            },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-4">
              <div className="w-10 h-10 bg-primary/8 rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-xl">{item.icon}</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">{item.title}</h3>
                <p className="text-gray-500 text-sm mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Courses */}
      <div className="px-6 py-8 bg-gray-50">
        <h2 className="text-xl font-bold text-gray-900 mb-4">20+ courses covered</h2>
        <div className="grid grid-cols-2 gap-2">
          {[
            'Jackson Park', 'Jefferson Park', 'West Seattle',
            'Chambers Bay', 'Washington National', 'Golf Club at Newcastle',
            'Willows Run', 'Bellevue Golf', 'Druids Glen', 'Harbour Pointe',
            'Foster Golf Links', 'Riverbend', '+ more',
          ].map((course, i) => (
            <div key={i} className={`px-3 py-2 bg-white rounded-xl border border-gray-100 text-xs text-gray-600 font-medium ${i === 12 ? 'col-span-2 text-center text-primary' : ''}`}>
              {course}
            </div>
          ))}
        </div>
      </div>

      {/* Pricing */}
      <div className="px-6 py-10 bg-white">
        <div className="flex justify-between items-baseline mb-6">
          <h2 className="text-xl font-bold text-gray-900">Plans</h2>
          <a href="/upgrade" className="text-sm text-primary font-semibold">Compare all →</a>
        </div>
        <div className="space-y-3">
          <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
            <div className="flex justify-between items-center mb-1">
              <span className="font-bold text-gray-900">Free</span>
              <span className="text-sm text-gray-400 font-medium">$0</span>
            </div>
            <p className="text-sm text-gray-500">1 course · Email alerts · Any day</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border-2 border-primary shadow-md shadow-primary/10">
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900">Premium</span>
                <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Popular</span>
              </div>
              <span className="text-sm text-primary font-bold">$4.99/mo</span>
            </div>
            <p className="text-sm text-gray-500">3 courses · Email + SMS · Any day</p>
          </div>

          <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
            <div className="flex justify-between items-center mb-1">
              <span className="font-bold text-gray-900">All Access</span>
              <span className="text-sm text-gray-400 font-medium">$9.99/mo</span>
            </div>
            <p className="text-sm text-gray-500">10+ courses · Email + SMS · Priority alerts</p>
          </div>
        </div>

        <a
          href="/signup"
          className="block w-full mt-5 py-4 bg-primary text-white font-bold rounded-xl text-center shadow-sm active:scale-95 transition-transform text-sm"
        >
          Start Free — No Card Required
        </a>
      </div>

      {/* Footer */}
      <div className="px-6 py-6 bg-gray-900 text-center">
        <p className="text-gray-400 text-sm font-medium">⛳ TeeDrop</p>
        <p className="text-gray-600 text-xs mt-1">© 2026 · Seattle golf tee time alerts</p>
      </div>
    </main>
  );
}
