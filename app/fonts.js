import localFont from 'next/font/local';

export const chap = localFont({
  src: [
    { path: './fonts/Chap-Light.woff', weight: '300', style: 'normal' },
    { path: './fonts/Chap-Regular.woff', weight: '400', style: 'normal' },
    { path: './fonts/Chap-Semibold.woff', weight: '600', style: 'normal' },
  ],
  display: 'swap',
  fallback: ['Arial', 'sans-serif'],
  variable: '--font-chap',
});
