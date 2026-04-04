import Link from 'next/link';

const TIERS = [
  {
    name: 'Free',
    price: '$0',
    period: '',
    tagline: 'Get started',
    color: 'gray',
    features: [
      { text: '1 course to watch', included: true },
      { text: 'Email alerts', included: true },
      { text: 'Any time window', included: true },
      { text: 'Any day of the week', included: true },
      { text: 'SMS text alerts', included: false },
      { text: 'Multiple courses', included: false },
      { text: 'Priority alerts', included: false },
    ],
    cta: 'Current (Free)',
    ctaDisabled: true,
    featured: false,
  },
  {
    name: 'Premium',
    price: '$4.99',
    period: '/mo',
    tagline: 'Most popular',
    color: 'primary',
    features: [
      { text: '3 courses to watch', included: true },
      { text: 'Email alerts', included: true },
      { text: 'Any time window', included: true },
      { text: 'Any day of the week', included: true },
      { text: 'SMS text alerts', included: true },
      { text: 'Multiple courses', included: true },
      { text: 'Priority alerts', included: false },
    ],
    cta: 'Coming Soon',
    ctaDisabled: true,
    featured: true,
  },
  {
    name: 'All Access',
    price: '$9.99',
    period: '/mo',
    tagline: 'Serious golfer',
    color: 'gray',
    features: [
      { text: '10+ courses to watch', included: true },
      { text: 'Email alerts', included: true },
      { text: 'Any time window', included: true },
      { text: 'Any day of the week', included: true },
      { text: 'SMS text alerts', included: true },
      { text: 'Multiple courses', included: true },
      { text: 'Priority alerts (fastest)', included: true },
    ],
    cta: 'Coming Soon',
    ctaDisabled: true,
    featured: false,
  },
];

export const metadata = {
  title: 'Upgrade - TeeDrop',
  description: 'Choose the plan that fits your golf schedule',
};

export default function UpgradePage() {
  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="px-5 py-4 bg-white border-b border-gray-100 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl">⛳</span>
          <span className="text-lg font-bold text-primary">TeeDrop</span>
        </Link>
        <Link href="/dashboard" className="text-sm text-gray-500 font-medium">Dashboard →</Link>
      </div>

      <div className="px-5 py-8 max-w-lg mx-auto">
        {/* Hero */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Choose your plan</h1>
          <p className="text-gray-500 text-sm max-w-xs mx-auto">
            Start free. Upgrade when you're ready to never miss a tee time again.
          </p>
        </div>

        {/* Tier cards */}
        <div className="space-y-4">
          {TIERS.map(tier => (
            <div
              key={tier.name}
              className={`bg-white rounded-2xl p-5 border-2 transition-shadow ${
                tier.featured
                  ? 'border-primary shadow-md shadow-primary/10'
                  : 'border-gray-100 shadow-sm'
              }`}
            >
              {tier.featured && (
                <div className="mb-3">
                  <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full uppercase tracking-wide">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{tier.name}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{tier.tagline}</p>
                </div>
                <div className="text-right">
                  <div className="flex items-baseline gap-0.5">
                    <span className={`text-2xl font-bold ${tier.featured ? 'text-primary' : 'text-gray-900'}`}>
                      {tier.price}
                    </span>
                    {tier.period && (
                      <span className="text-sm text-gray-400">{tier.period}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Features */}
              <ul className="space-y-2 mb-5">
                {tier.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2.5 text-sm">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                      f.included
                        ? 'bg-primary/10 text-primary'
                        : 'bg-gray-100 text-gray-300'
                    }`}>
                      {f.included ? '✓' : '×'}
                    </span>
                    <span className={f.included ? 'text-gray-700' : 'text-gray-400'}>
                      {f.text}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                disabled={tier.ctaDisabled}
                className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${
                  tier.featured
                    ? 'bg-primary text-white opacity-50 cursor-not-allowed'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {tier.cta}
              </button>
            </div>
          ))}
        </div>

        {/* Note */}
        <div className="mt-6 p-4 bg-white rounded-2xl border border-gray-100 text-center">
          <p className="text-sm text-gray-600 mb-1">
            <span className="font-semibold">Stripe payments coming soon.</span>
          </p>
          <p className="text-xs text-gray-400">
            TeeDrop is in early access. Paid tiers will launch shortly.
          </p>
        </div>

        {/* FAQ */}
        <div className="mt-8 space-y-4">
          <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wide">FAQ</h3>

          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <p className="text-sm font-semibold text-gray-900 mb-1">When do alerts fire?</p>
            <p className="text-xs text-gray-500">
              Chester (our scraper on a mini PC) checks courses throughout the day. When a new matching tee time appears, TeeDrop sends your alert instantly.
            </p>
          </div>

          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <p className="text-sm font-semibold text-gray-900 mb-1">What courses are covered?</p>
            <p className="text-xs text-gray-500">
              20+ Seattle-area courses including Jackson Park, Jefferson Park, Chambers Bay, Washington National, Golf Club at Newcastle, and more.
            </p>
          </div>

          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <p className="text-sm font-semibold text-gray-900 mb-1">Can I cancel anytime?</p>
            <p className="text-xs text-gray-500">
              Yes. No contracts, no commitments. Cancel from your account page anytime.
            </p>
          </div>
        </div>
      </div>

      <div className="py-6 text-center">
        <p className="text-gray-400 text-xs">© 2026 TeeDrop</p>
      </div>
    </main>
  );
}
