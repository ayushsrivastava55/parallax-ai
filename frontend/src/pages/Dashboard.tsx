import { HeroStats } from '../components/dashboard/HeroStats.tsx';
import { ActivityFeed } from '../components/dashboard/ActivityFeed.tsx';
import { BotGrid } from '../components/dashboard/BotGrid.tsx';

export default function Dashboard() {
  return (
    <div>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, color: 'var(--t1)', marginBottom: 24 }}>
        Dashboard
      </h1>
      <HeroStats />
      <ActivityFeed />
      <BotGrid />
    </div>
  );
}
