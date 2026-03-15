// ============================================================================
// AdminContentPanel — Gestione admin di Sistema posts e Offerte
// Permette all'admin di creare contenuti con visibilità per profilo o utenti
// specifici, e di visualizzare/eliminare i contenuti esistenti.
// ============================================================================

import React, { useMemo, useState } from 'react';
import { PostForm, PostCard, OfferForm, OfferCard } from './NewsBacheca';

const PROFILE_LABELS = { base: 'Base', pro: 'Pro', promax: 'Pro Max' };
const PROFILE_BADGE  = {
  base:   'bg-blue-500/10 text-blue-400 border-blue-500/20',
  pro:    'bg-violet-500/10 text-violet-400 border-violet-500/20',
  promax: 'bg-red-500/10 text-red-400 border-red-500/20',
};

/**
 * Props:
 *   adminPosts      : array — tutti i posts admin (non filtrati)
 *   onPostsChange   : (posts) => Promise<void>  — salva su admin_content
 *   adminOffers     : array — tutte le offerte admin (non filtrate)
 *   onOffersChange  : (offers) => Promise<void> — salva su admin_content
 *   newsAuthorEmail : string
 *   ownerTeamName   : string
 *   allUsers        : array<{ uid, email, displayName, assignedProfile }> — lista utenti per selector
 */
export default function AdminContentPanel({
  adminPosts,
  onPostsChange,
  adminOffers,
  onOffersChange,
  newsAuthorEmail,
  ownerTeamName,
  allUsers = [],
}) {
  const [tab, setTab]                   = useState('news');
  const [showNewsForm, setShowNewsForm]  = useState(false);
  const [showOfferForm, setShowOfferForm] = useState(false);

  const posts  = Array.isArray(adminPosts)  ? adminPosts  : [];
  const offers = Array.isArray(adminOffers) ? adminOffers : [];

  // ── Ordina posts per eventDate o createdAt desc ───────────────────────────
  const sortedPosts = useMemo(() =>
    [...posts].sort((a, b) => {
      const aH = !!a.eventDate; const bH = !!b.eventDate;
      if (aH && bH) return a.eventDate.localeCompare(b.eventDate);
      if (aH && !bH) return -1;
      if (!aH && bH) return 1;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    }),
  [posts]);

  // ── Ordina offerte: attive prima (per scadenza asc), scadute dopo ─────────
  const sortedOffers = useMemo(() => {
    const today   = new Date().toISOString().slice(0, 10);
    const active  = offers.filter(o => !o.validUntil || o.validUntil >= today)
      .sort((a, b) => (a.validUntil || '9999').localeCompare(b.validUntil || '9999'));
    const expired = offers.filter(o => o.validUntil && o.validUntil < today)
      .sort((a, b) => b.validUntil.localeCompare(a.validUntil));
    return [...active, ...expired];
  }, [offers]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const savePost   = async (post)  => { await onPostsChange?.([...posts, post]);       setShowNewsForm(false);  };
  const deletePost = async (id)    => { await onPostsChange?.(posts.filter(p => p.id !== id));                  };
  const saveOffer  = async (offer) => { await onOffersChange?.([...offers, offer]);    setShowOfferForm(false); };
  const deleteOffer= async (id)    => { await onOffersChange?.(offers.filter(o => o.id !== id));                };

  // ── Contatori per header ──────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const activeOffersCount = offers.filter(o => !o.validUntil || o.validUntil >= today).length;

  return (
    <div className="space-y-4">

      {/* Tab bar */}
      <div className="flex gap-1 p-0.5 rounded-xl bg-white/[0.03] border border-white/8">
        <button
          onClick={() => { setTab('news'); setShowNewsForm(false); setShowOfferForm(false); }}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
            tab === 'news'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
          }`}
        >
          📋 News Sistema
          {posts.length > 0 && (
            <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-gray-400">
              {posts.length}
            </span>
          )}
        </button>
        <button
          onClick={() => { setTab('offers'); setShowNewsForm(false); setShowOfferForm(false); }}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
            tab === 'offers'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
          }`}
        >
          🏷️ Offerte
          {activeOffersCount > 0 && (
            <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
              {activeOffersCount}
            </span>
          )}
        </button>
      </div>

      {/* ── NEWS SISTEMA ── */}
      {tab === 'news' && (
        <div className="space-y-3">

          {/* Header card */}
          <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-100">Gestione bacheca Sistema</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {posts.length} post pubblicati · visibili agli utenti in base alla visibilità impostata
                </p>
                {ownerTeamName && (
                  <p className="text-[10px] text-gray-500 mt-0.5">{ownerTeamName}</p>
                )}
              </div>
              {!showNewsForm && (
                <button
                  onClick={() => setShowNewsForm(true)}
                  className="text-[10px] px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-300 border border-sky-500/25 hover:bg-sky-500/25 transition-all shrink-0"
                >
                  + Nuovo post
                </button>
              )}
            </div>

            {/* Legend visibilità */}
            <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap gap-2">
              <span className="text-[9px] text-gray-600 self-center">Visibilità:</span>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/10">🌐 Tutti</span>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">🎫 Per profilo</span>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">👤 Utenti specifici</span>
            </div>
          </div>

          {/* Form nuovo post */}
          {showNewsForm && (
            <PostForm
              onSave={savePost}
              onCancel={() => setShowNewsForm(false)}
              authorEmail={newsAuthorEmail}
              allUsers={allUsers}
            />
          )}

          {/* Lista posts */}
          {sortedPosts.length === 0 && !showNewsForm && (
            <div className="text-center py-8 text-xs text-gray-500">
              Nessun post. Clicca "+ Nuovo post" per pubblicare un messaggio nella bacheca.
            </div>
          )}

          {sortedPosts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              canEdit={true}
              onDelete={deletePost}
            />
          ))}
        </div>
      )}

      {/* ── OFFERTE ── */}
      {tab === 'offers' && (
        <div className="space-y-3">

          {/* Header card */}
          <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-100">Gestione offerte</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {offers.length} offerte totali · {activeOffersCount} attive
                </p>
                {ownerTeamName && (
                  <p className="text-[10px] text-gray-500 mt-0.5">{ownerTeamName}</p>
                )}
              </div>
              {!showOfferForm && (
                <button
                  onClick={() => setShowOfferForm(true)}
                  className="text-[10px] px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/25 hover:bg-amber-500/25 transition-all shrink-0"
                >
                  + Nuova offerta
                </button>
              )}
            </div>

            {/* Profili attivi */}
            {allUsers.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/5">
                <p className="text-[9px] text-gray-600 mb-1.5">Utenti registrati per profilo:</p>
                <div className="flex flex-wrap gap-1.5">
                  {['base', 'pro', 'promax'].map(p => {
                    const count = allUsers.filter(u => u.assignedProfile === p).length;
                    return (
                      <span
                        key={p}
                        className={`text-[9px] px-2 py-0.5 rounded-full border ${PROFILE_BADGE[p]}`}
                      >
                        {PROFILE_LABELS[p]}: {count}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Form nuova offerta */}
          {showOfferForm && (
            <OfferForm
              onSave={saveOffer}
              onCancel={() => setShowOfferForm(false)}
              authorEmail={newsAuthorEmail}
              allUsers={allUsers}
            />
          )}

          {/* Lista offerte */}
          {sortedOffers.length === 0 && !showOfferForm && (
            <div className="text-center py-8 text-xs text-gray-500">
              Nessuna offerta. Clicca "+ Nuova offerta" per pubblicarne una.
            </div>
          )}

          {sortedOffers.map(offer => (
            <OfferCard
              key={offer.id}
              offer={offer}
              canEdit={true}
              onDelete={deleteOffer}
            />
          ))}
        </div>
      )}
    </div>
  );
}
