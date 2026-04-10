import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Fresh Burst',
};

export default function FreshBurstLayout({ children }: { children: React.ReactNode }) {
  return children;
}
