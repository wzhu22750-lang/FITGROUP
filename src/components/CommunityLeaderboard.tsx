import { Trophy, User } from 'lucide-react';

interface LeaderboardEntry {
  uid?: string;
  id?: string;
  displayName?: string;
  photoURL?: string;
  totalWorkouts?: number;
}

export default function CommunityLeaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <section className="card p-4 sm:p-5" aria-label="社区榜单">
      <h2 className="text-base font-bold flex items-center gap-2"><Trophy size={18} />社区榜单</h2>
      <p className="text-xs text-ink/60 mt-1 mb-4">和一起坚持的健友，互相激励。</p>
      <ol className="divide-y divide-ink/10">
        {entries.map((entry, index) => (
          <li key={entry.uid || entry.id || index} className="flex items-center gap-3 py-3">
            <span className={`w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0 ${index === 0 ? 'bg-neon text-ink' : 'text-ink/50'}`}>{index + 1}</span>
            <div className="w-8 h-8 bg-paper flex items-center justify-center shrink-0">
              {entry.photoURL ? <img src={entry.photoURL} alt="" className="w-full h-full object-cover" /> : <User size={16} className="text-ink/40" />}
            </div>
            <span className="flex-1 min-w-0 truncate text-sm font-bold">{entry.displayName || '健友'}</span>
            <span className="text-lg font-black tabular-nums">{entry.totalWorkouts || 0}<span className="ml-1 text-xs font-normal text-ink/60">次</span></span>
          </li>
        ))}
      </ol>
      {!entries.length && <p className="py-5 text-center text-sm text-ink/60">暂无榜单数据</p>}
    </section>
  );
}
