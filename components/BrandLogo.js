import Image from 'next/image';

const variants = {
  // `light`/`dark` describe the background, preserving the public component API:
  // brun is the light-background mark and creme is the dark-background mark.
  'horizontal-light': {
    src: '/Turufjell_liggende_VEL_logo_brun.svg',
    width: 4184,
    height: 513,
  },
  'horizontal-dark': {
    src: '/Turufjell_liggende_VEL_logo_creme.svg',
    width: 4184,
    height: 513,
  },
  'stacked-light': {
    src: '/Turufjell_staende_VEL_logo_brun.svg',
    width: 1793,
    height: 1656,
  },
  'stacked-dark': {
    src: '/Turufjell_staende_VEL_logo_creme.svg',
    width: 1793,
    height: 1656,
  },
  'liggende-brun': { src: '/Turufjell_liggende_VEL_logo_brun.svg', width: 4184, height: 513 },
  'liggende-creme': { src: '/Turufjell_liggende_VEL_logo_creme.svg', width: 4184, height: 513 },
  'stående-brun': { src: '/Turufjell_staende_VEL_logo_brun.svg', width: 1793, height: 1656 },
  'stående-creme': { src: '/Turufjell_staende_VEL_logo_creme.svg', width: 1793, height: 1656 },
};

export default function BrandLogo({ variant = 'horizontal', tone = 'light', className = '', priority = false, decorative = false }) {
  const logo = variants[variant] || variants[`${variant}-${tone}`] || variants['horizontal-light'];
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
