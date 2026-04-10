import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Short',
};

export default function ShortLayout({ children }: { children: React.ReactNode }) {
  return children;
}
