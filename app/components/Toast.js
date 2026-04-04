'use client';

import { useEffect } from 'react';

export default function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl shadow-lg text-sm font-medium max-w-xs w-max text-center pointer-events-none ${
        type === 'success'
          ? 'bg-green-600 text-white'
          : type === 'error'
          ? 'bg-red-500 text-white'
          : 'bg-gray-800 text-white'
      }`}
    >
      {message}
    </div>
  );
}
