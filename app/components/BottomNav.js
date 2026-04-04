'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Tee Times', icon: '⛳' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
  { href: '/account', label: 'Account', icon: '👤' },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center bg-white border-t border-gray-100 safe-area-inset-bottom">
      <nav className="flex w-full max-w-lg">
        {NAV_ITEMS.map(item => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 py-2.5 gap-0.5 transition-colors ${
                active ? 'text-primary' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <span className={`text-xl leading-none transition-transform ${active ? 'scale-110' : ''}`}>
                {item.icon}
              </span>
              <span className={`text-[10px] font-medium ${active ? 'text-primary' : ''}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
