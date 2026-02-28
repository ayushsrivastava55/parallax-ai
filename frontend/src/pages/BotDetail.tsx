import { useParams, Link } from 'react-router-dom';
import { useBotDetail } from '../hooks/useBotDetail.ts';
import { useBotActivity } from '../hooks/useBotActivity.ts';
import { BotProfile } from '../components/bots/BotProfile.tsx';
import { BotTradeHistory } from '../components/bots/BotTradeHistory.tsx';
import { EmptyState } from '../components/shared/EmptyState.tsx';
import { Timestamp } from '../components/shared/Timestamp.tsx';
import { shortId } from '../lib/formatters.ts';
import type { CSSProperties } from 'react';

const row: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '100px 1fr auto',
  gap: 12,
  padding: '10px 20px',
  borderBottom: '1px solid var(--line)',
  fontFamily: 'var(--mono)',
  fontSize: 12,
  alignItems: 'center',
};

export default function BotDetail() {
  const { agentId } = useParams<{ agentId: string }>();
  const { bot, stats } = useBotDetail(agentId!);
  const activity = useBotActivity(agentId!, 100);

  if (bot.loading && !bot.data) {
    return <EmptyState title="Loading..." />;
  }

  if (!bot.data) {
    return <EmptyState title="Bot not found" subtitle={`No bot with ID ${agentId}`} />;
  }

  return (
    <div>
      <Link
        to="/bots"
        style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--t3)', textDecoration: 'none', marginBottom: 16, display: 'inline-block' }}
      >
        &larr; All Bots
      </Link>
      <BotProfile bot={bot.data} stats={stats.data} />
      <BotTradeHistory activity={activity.data ?? []} />

      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)', fontFamily: 'var(--mono)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--t2)' }}>
          All Activity
        </div>
        {!activity.data?.length ? (
          <EmptyState title="No activity" />
        ) : (
          activity.data.map((e) => (
            <div key={e.id} style={row}>
              <Timestamp iso={e.timestamp} />
              <span style={{ color: 'var(--t1)' }}>{e.type}</span>
              <span style={{ color: 'var(--t3)', fontSize: 11 }}>{shortId(e.id)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
