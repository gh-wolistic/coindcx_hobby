import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Recommend',
};

export default function RecommendLayout({ children }: { children: React.ReactNode }) {
  return children;
}
