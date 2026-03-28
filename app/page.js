export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-gradient-to-b from-primary/10 to-white">
        <div className="text-6xl mb-6">⛳</div>
        <h1 className="text-4xl font-bold text-gray-900 text-center mb-4">TeeDrop</h1>
        <p className="text-xl text-gray-600 text-center mb-8 max-w-sm">
          Get instant alerts when prime tee times open up at Seattle golf courses
        </p>
        <div className="flex flex-col gap-4 w-full max-w-xs">
          <a
            className="block w-full py-4 px-6 bg-primary text-white font-semibold rounded-xl text-center shadow-lg active:scale-95 transition-transform"
            href="/signup"
          >
            Get Started Free
          </a>
          <a
            className="block w-full py-4 px-6 bg-white text-primary font-semibold rounded-xl text-center border-2 border-primary active:scale-95 transition-transform"
            href="/login"
          >
            Sign In
          </a>
        </div>
      </div>

      <div className="px-6 py-8 bg-white">
        <h2 className="text-xl font-bold text-gray-900 mb-6">How it works</h2>
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-xl">🔔</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Get Alerts</h3>
              <p className="text-gray-600 text-sm">Instant notifications when tee times match your preferences</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-xl">🎯</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Customize Search</h3>
              <p className="text-gray-600 text-sm">Choose your courses, times, and days</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-xl">📱</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Mobile First</h3>
              <p className="text-gray-600 text-sm">Designed for your phone - check anytime, anywhere</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-8 bg-gray-50">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Choose your plan</h2>
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold text-gray-900">Free</span>
              <span className="text-sm text-gray-500">$0</span>
            </div>
            <p className="text-sm text-gray-600">1 course • 2hr window • Saturdays</p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border-2 border-primary">
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold text-gray-900">Premium</span>
              <span className="text-sm text-primary font-medium">$4.99/mo</span>
            </div>
            <p className="text-sm text-gray-600">3 courses • 4hr window • Sat &amp; Sun</p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold text-gray-900">All Access</span>
              <span className="text-sm text-gray-500">$9.99/mo</span>
            </div>
            <p className="text-sm text-gray-600">All courses • Full day • Any day</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 bg-gray-900 text-center">
        <p className="text-gray-400 text-sm">© 2026 TeeDrop - Find your tee time</p>
      </div>
    </main>
  );
}
