import { ImageResponse } from 'next/og';
import BrandSymbol from '@/components/BrandSymbol';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(<BrandSymbol size={size.width} />, size);
}
