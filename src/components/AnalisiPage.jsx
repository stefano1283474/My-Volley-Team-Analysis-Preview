// ============================================================================
// ANALISI PAGE — Pagina di analisi con navigazione a tab nella bottom bar
// ============================================================================
import { useState } from 'react';

// ─── Sub-tab definitions ─────────────────────────────────────────────────────
const ANALISI_TABS = [
  { id: 'partite',   label: 'Partite',   icon: '⚡' },
  { id: 'avversari', label: 'Avversari', icon: '🎯' },
  { id: 'mio_team',  label: 'Mio Team',  icon: '🛡' },
  { id: 'player',    label: 'Player',    icon: '★'  },
];

// ─── Placeholder panel ───────────────────────────────────────────────────────
function EmptyTab({ label }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-2 select-none">
      <p className="text-3xl opacity-20">🏐</p>
      <p className="text-sm text-gray-600 italic">{label} — in arrivo</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AnalisiPage({
  analytics,
  matches = [],
  standings = [],
  dataMode = 'raw',
  allPlayers = [],
}) {
  const [activeTab, setActiveTab] = useState('partite');

  return (
    <div className="flex flex-col h-full">

      {/* ── Scrollable content area ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {activeTab === 'partite'   && <EmptyTab label="Partite" />}
        {activeTab === 'avversari' && <EmptyTab label="Avversari" />}
        {activeTab === 'mio_team'  && <EmptyTab label="Mio Team" />}
        {activeTab === 'player'    && <EmptyTab label="Player" />}
      </div>

      {/* ── Bottom tab bar ──────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex items-stretch border-t border-white/10"
        style={{
          background: 'rgba(10,14,26,0.97)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        {ANALISI_TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 relative transition-colors
                ${active ? 'text-amber-400' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {/* active indicator — top edge */}
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-amber-400 rounded-b" />
              )}
              <span className="text-base leading-none">{tab.icon}</span>
              <span className={`text-[10px] tracking-wide ${active ? 'font-semibold' : 'font-medium'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

    </div>
  );
}
