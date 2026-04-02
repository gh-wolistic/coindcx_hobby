import ScreenerDashboard from '@/components/ScreenerDashboard';

// Archived HOT page snapshot. Route /hot now redirects to /recommend.
export default function ArchivedHotPage() {
  return <ScreenerDashboard mode="hot" />;
}
