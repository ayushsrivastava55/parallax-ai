import { timeAgo } from '../../lib/formatters.ts';

export function Timestamp({ iso }: { iso: string }) {
  return (
    <time
      dateTime={iso}
      title={new Date(iso).toLocaleString()}
      style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--t3)' }}
    >
      {timeAgo(iso)}
    </time>
  );
}
