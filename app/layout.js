import { Inter } from 'next/font/google';
import './globals.css';
import Provider from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'TeeDrop - Find Prime Tee Times',
  description: 'Get alerts when prime tee times open up at Seattle golf courses',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-50">
          <Provider>{children}</Provider>
        </div>
      </body>
    </html>
  );
}
