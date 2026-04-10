import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Wild',
};

export default function WildLayout({ children }: { children: React.ReactNode }) {
  return children;
}
