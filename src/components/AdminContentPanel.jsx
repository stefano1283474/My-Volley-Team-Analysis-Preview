import React, { useMemo, useState } from 'react';
import { PostForm, PostCard, OfferForm, OfferCard } from './NewsBacheca';

export default function AdminContentPanel({
  teamNews,
  onNewsChange,
  teamOffers,
  onOffersChange,
  newsAuthorEmail,
  ownerTeamName,
}) {
  const [tab, setTab] = useState('news');
  const [showNewsForm, setShowNewsForm] = useState(false);
  const [showOfferForm, setShowOfferForm] = useState(false);
  const posts = Array.isArray(teamNews) ? teamNews : [];
  const offers = Array.isArray(teamOffers) ? teamOffers : [];

  const sortedPosts = useMemo(() => [...posts].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')), [posts]);
  const sortedOffers = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const active = offers.filter(o => !o.validUntil || o.validUntil >= today).sort((a, b) => (a.validUntil || '9999').localeCompare(b.validUntil || '9999'));
    const expired = offers.filter(o => o.validUntil && o.validUntil < today).sort((a, b) => b.validUntil.localeCompare(a.validUntil));
    return [...active, ...expired];
  }, [offers]);

  const savePost = async (post) => {
    await onNewsChange?.([...posts, post]);
    setShowNewsForm(false);
  };
  const deletePost = async (id) => onNewsChange?.(posts.filter((p) => p.id !== id));

  const saveOffer = async (offer) => {
    await onOffersChange?.([...offers, offer]);
    setShowOfferForm(false);
  };
  const deleteOffer = async (id) => onOffersChange?.(offers.filter((o) => o.id !== id));

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-0.5 rounded-xl bg-white/[0.03] border border-white/8">
        <button onClick={() => setTab('news')} className={`flex-1 py-2 rounded-lg text-xs font-medium ${tab === 'news' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>📋 News Sistema</button>
        <button onClick={() => setTab('offers')} className={`flex-1 py-2 rounded-lg text-xs font-medium ${tab === 'offers' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>🏷️ Offerte</button>
      </div>

      {tab === 'news' && (
        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-100">Gestione bacheca news</h3>
              <p className="text-xs text-gray-400">{posts.length} post · {ownerTeamName || 'Team non impostato'}</p>
            </div>
            {!showNewsForm && (
              <button onClick={() => setShowNewsForm(true)} className="text-[10px] px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-300 border border-sky-500/25 hover:bg-sky-500/25">+ Nuovo post</button>
            )}
          </div>
          {showNewsForm && <PostForm onSave={savePost} onCancel={() => setShowNewsForm(false)} authorEmail={newsAuthorEmail} />}
          {sortedPosts.length === 0 && !showNewsForm ? <div className="text-center py-8 text-xs text-gray-500">Nessun post disponibile.</div> : null}
          {sortedPosts.map((post) => <PostCard key={post.id} post={post} canEdit={true} onDelete={deletePost} />)}
        </div>
      )}

      {tab === 'offers' && (
        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-100">Gestione offerte</h3>
              <p className="text-xs text-gray-400">{offers.length} offerte · {ownerTeamName || 'Team non impostato'}</p>
            </div>
            {!showOfferForm && (
              <button onClick={() => setShowOfferForm(true)} className="text-[10px] px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/25 hover:bg-amber-500/25">+ Nuova offerta</button>
            )}
          </div>
          {showOfferForm && <OfferForm onSave={saveOffer} onCancel={() => setShowOfferForm(false)} authorEmail={newsAuthorEmail} />}
          {sortedOffers.length === 0 && !showOfferForm ? <div className="text-center py-8 text-xs text-gray-500">Nessuna offerta disponibile.</div> : null}
          {sortedOffers.map((offer) => <OfferCard key={offer.id} offer={offer} canEdit={true} onDelete={deleteOffer} />)}
        </div>
      )}
    </div>
  );
}
