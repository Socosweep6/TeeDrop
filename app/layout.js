import { Outfit } from 'next/font/google';
import './globals.css';
import Provider from './providers';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

export const metadata = {
  title: 'TeeDrop — Seattle Golf Tee Time Alerts',
  description: 'Get instant alerts the moment prime tee times open at 20+ Seattle-area golf courses.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={outfit.variable}>
      <body className={`${outfit.className} min-h-screen bg-gray-50`}>
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
