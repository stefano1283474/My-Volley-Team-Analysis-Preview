// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — NewsSection (Bacheca Squadra)
// Bacheca per post di comunicazione della squadra, salvati su Firestore.
// Scrittura: admin + owner del dataset. Lettura: tutti.
// ============================================================================

import React, { useState, useCallback, useRef } from 'react';

// ─── Tipi di post ─────────────────────────────────────────────────────────────

export const NEWS_TYPES = {
  avviso:        { label: 'Avviso',        icon: '⚠️', color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/25' },
  info:          { label: 'Info',          icon: 'ℹ️', color: 'text-sky-400',    bg: 'bg-sky-500/10',    border: 'border-sky-500/25'   },
  risultato:     { label: 'Risultato',     icon: '🏐', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25' },
  evento:        { label: 'Evento',        icon: '📅', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/25' },
  comunicazione: { label: 'Comunicazione', icon: '📢', color: 'text-gray-300',   bg: 'bg-white/[0.04]',  border: 'border-white/10'     },
};

const MAX_TEXT = 500;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function formatDate(isoDate) {
  if (!isoDate) return null;
  try {
    const d = new Date(isoDate + 'T12:00:00');
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return isoDate; }
}

function sortPosts(posts) {
  const now = new Date().toISOString().slice(0, 10);
  // Ordine: eventi futuri prima (per data), poi senza data per createdAt desc
  return [...posts].sort((a, b) => {
    const aHasDate = !!a.eventDate;
    const bHasDate = !!b.eventDate;
    if (aHasDate && bHasDate) return a.eventDate.localeCompare(b.eventDate);
    if (aHasDate && !bHasDate) return -1;
    if (!aHasDate && bHasDate) return 1;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
}

// ─── Form di inserimento ──────────────────────────────────────────────────────

function PostForm({ onSave, onCancel, authorEmail }) {
  const [type, setType]           = useState('info');
  const [text, setText]           = useState('');
  const [eventDate, setEventDate] = useState('');
  const [saving, setSaving]       = useState(false);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await onSave({
        id: newId(),
        type,
        text: text.trim().slice(0, MAX_TEXT),
        eventDate: eventDate || null,
        createdAt: new Date().toISOString(),
        authorEmail: authorEmail || '',
      });
      setText(''); setEventDate(''); setType('info');
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">

      {/* Tipo */}
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(NEWS_TYPES).map(([key, meta]) => (
          <button
            key={key}
            onClick={() => setType(key)}
            className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${
              type === key
                ? `${meta.bg} ${meta.border} ${meta.color} font-bold`
                : 'border-white/8 text-gray-500 hover:text-gray-300'
            }`}
          >
            {meta.icon} {meta.label}
          </button>
        ))}
      </div>

      {/* Testo */}
      <div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value.slice(0, MAX_TEXT))}
          placeholder="Scrivi il messaggio…"
          rows={3}
          className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-white/20"
        />
        <div className="text-right text-[9px] text-gray-600 mt-0.5">{text.length}/{MAX_TEXT}</div>
      </div>

      {/* Data evento (opzionale) */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-500 whitespace-nowrap">📅 Data evento (opzionale)</span>
        <input
          type="date"
          value={eventDate}
          onChange={e => setEventDate(e.target.value)}
          className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-white/20"
        />
        {eventDate && (
          <button onClick={() => setEventDate('')} className="text-[10px] text-gray-500 hover:text-gray-300">✕</button>
        )}
      </div>

      {/* Azioni */}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded-lg text-gray-500 hover:text-gray-300 transition-colors">
          Annulla
        </button>
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || saving}
          className="text-xs px-4 py-1.5 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/30 hover:bg-sky-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium"
        >
          {saving ? 'Salvo…' : 'Pubblica'}
        </button>
      </div>
    </div>
  );
}

// ─── Singolo post ─────────────────────────────────────────────────────────────

function PostCard({ post, canEdit, onDelete }) {
  const meta = NEWS_TYPES[post.type] || NEWS_TYPES.comunicazione;
  const dateStr = formatDate(post.eventDate);
  const createdStr = post.createdAt
    ? new Date(post.createdAt).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;
  const isUpcoming = post.eventDate && post.eventDate >= new Date().toISOString().slice(0, 10);
  const isPast     = post.eventDate && post.eventDate < new Date().toISOString().slice(0, 10);

  return (
    <div className={`rounded-xl border ${meta.border} ${meta.bg} p-3.5 relative group`}>
      {/* Badge tipo + data evento */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.border} ${meta.bg} ${meta.color}`}>
          {meta.icon} {meta.label}
        </span>
        {dateStr && (
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
            isUpcoming
              ? 'border-purple-500/30 bg-purple-500/10 text-purple-300'
              : isPast
                ? 'border-white/10 bg-white/[0.03] text-gray-500 line-through'
                : 'border-white/10 text-gray-400'
          }`}>
            📅 {dateStr}
          </span>
        )}
        {canEdit && (
          <button
            onClick={() => onDelete(post.id)}
            className="ml-auto opacity-0 group-hover:opacity-100 text-[10px] text-gray-600 hover:text-red-400 transition-all px-1.5 py-0.5 rounded"
            title="Elimina post"
          >
            ✕
          </button>
        )}
      </div>

      {/* Testo */}
      <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{post.text}</p>

      {/* Footer: autore + data creazione */}
      <div className="flex items-center gap-2 mt-2 text-[9px] text-gray-600">
        <span>{post.authorEmail || 'Anonimo'}</span>
        {createdStr && <span>· {createdStr}</span>}
      </div>
    </div>
  );
}

// ─── NoTeamPrompt ─────────────────────────────────────────────────────────────

function NoTeamPrompt({ onScrollToStandings }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6 flex flex-col items-center text-center gap-3">
      <div className="text-3xl">🏐</div>
      <div>
        <p className="text-sm font-semibold text-white mb-1">Nessuna squadra selezionata</p>
        <p className="text-xs text-gray-500 max-w-xs">
          Identifica la tua squadra nella classifica per visualizzare la bacheca e le statistiche del team.
        </p>
      </div>
      {onScrollToStandings && (
        <button
          onClick={onScrollToStandings}
          className="text-xs px-4 py-2 rounded-xl bg-sky-500/15 text-sky-300 border border-sky-500/25 hover:bg-sky-500/25 transition-all font-medium"
        >
          → Vai alla classifica
        </button>
      )}
    </div>
  );
}

// ─── NewsSection principale ───────────────────────────────────────────────────

/**
 * Props:
 *   posts          : array di post
 *   onPostsChange  : (newPosts) => Promise<void>   — salva su Firestore
 *   canEdit        : boolean                        — admin o owner
 *   teamName       : string | null                  — squadra selezionata
 *   authorEmail    : string                         — email autore corrente
 *   onScrollToStandings : () => void                — scroll alla classifica
 */
export default function NewsSection({
  posts = [],
  onPostsChange,
  canEdit = false,
  teamName = null,
  authorEmail = '',
  onScrollToStandings,
}) {
  const [showForm, setShowForm] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const sorted = sortPosts(posts);

  const handleSave = useCallback(async (newPost) => {
    await onPostsChange([...posts, newPost]);
    setShowForm(false);
  }, [posts, onPostsChange]);

  const handleDelete = useCallback(async (id) => {
    await onPostsChange(posts.filter(p => p.id !== id));
  }, [posts, onPostsChange]);

  const hasTeam = !!teamName;

  return (
    <div className="glass-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-base">📋</span>
          <h2 className="text-sm font-black text-white uppercase tracking-tighter">
            Bacheca Squadra
          </h2>
          {teamName && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/25 font-medium">
              {teamName}
            </span>
          )}
          {posts.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-gray-500">
              {posts.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canEdit && hasTeam && !showForm && (
            <button
              onClick={() => { setShowForm(true); setCollapsed(false); }}
              className="text-[10px] px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-300 border border-sky-500/25 hover:bg-sky-500/25 transition-all font-medium"
            >
              + Nuovo post
            </button>
          )}
          {posts.length > 0 && (
            <button
              onClick={() => setCollapsed(v => !v)}
              className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors px-1"
              title={collapsed ? 'Espandi bacheca' : 'Comprimi bacheca'}
            >
              {collapsed ? '▼ mostra' : '▲ comprimi'}
            </button>
          )}
        </div>
      </div>

      {/* Corpo */}
      {!collapsed && (
        <div className="space-y-3">
          {/* Form nuovo post */}
          {showForm && canEdit && (
            <PostForm
              onSave={handleSave}
              onCancel={() => setShowForm(false)}
              authorEmail={authorEmail}
            />
          )}

          {/* No team prompt */}
          {!hasTeam && (
            <NoTeamPrompt onScrollToStandings={onScrollToStandings} />
          )}

          {/* Lista post */}
          {hasTeam && sorted.length === 0 && !showForm && (
            <div className="text-center py-6 text-gray-600 text-xs">
              {canEdit
                ? 'Nessun post ancora. Clicca "+ Nuovo post" per iniziare.'
                : 'Nessun post nella bacheca.'}
            </div>
          )}
          {hasTeam && sorted.map(post => (
            <PostCard
              key={post.id}
              post={post}
              canEdit={canEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
