import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Burst',
};

export default function BurstLayout({ children }: { children: React.ReactNode }) {
  return children;
}
