import { ImageResponse } from 'next/og';
import BrandSymbol from '@/components/BrandSymbol';

export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(<BrandSymbol size={size.width} />, size);
}
