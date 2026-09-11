import Image from 'next/image';

const variants = {
  'horizontal-light': {
    src: '/turufjell-vel-logo-horizontal-light.png',
    width: 2256,
    height: 255,
  },
  'horizontal-dark': {
    src: '/turufjell-vel-logo-horizontal-dark.png',
    width: 2256,
    height: 255,
  },
  'stacked-light': {
    src: '/turufjell-vel-logo-stacked-light.png',
    width: 1040,
    height: 880,
  },
  'stacked-dark': {
    src: '/turufjell-vel-logo-stacked-dark.png',
    width: 1040,
    height: 880,
  },
};

export default function BrandLogo({ variant = 'horizontal', tone = 'light', className = '', priority = false, decorative = false }) {
  const logo = variants[`${variant}-${tone}`] || variants['horizontal-light'];
  return (
    <Image
      src={logo.src}
      width={logo.width}
      height={logo.height}
      alt={decorative ? '' : 'Turufjell Vel'}
      className={className}
      priority={priority}
    />
  );
}
