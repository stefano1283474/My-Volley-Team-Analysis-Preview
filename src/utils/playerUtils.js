// ============================================================================
// PLAYER UTILS — Formattazione consistente del nome/soprannome giocatrice
// Regola: ogni citazione di una giocatrice deve mostrare NUMERO + SOPRANNOME
// ============================================================================

/**
 * Restituisce il nome visualizzabile di una giocatrice (priorità: nickname > name > surname).
 * Non include il numero — usare playerLabel() per ottenere "#XX soprannome".
 * @param {object} player — oggetto con campi nickname, name, surname
 * @returns {string}
 */
export function playerDisplayName(player) {
  if (!player) return '';
  const nick = String(player.nickname || player.nick || '').trim();
  if (nick) return nick;
  const name = String(player.name || player.firstName || '').trim();
  if (name) return name;
  const surn = String(player.surname || player.lastName || '').trim();
  return surn ? surn.split(' ')[0] : '';
}

/**
 * Restituisce la label completa "#XX soprannome" dato un numero e il roster.
 * @param {string|number} num — numero maglia (viene padded a 2 cifre)
 * @param {Array}  roster — array di oggetti player dal roster
 * @returns {string}  es. "#04 Marta"
 */
export function playerLabel(num, roster) {
  const numStr  = String(num || '');
  const numPad  = numStr.padStart(2, '0');
  const p = (roster || []).find(r => {
    const rn = String(r.number || '');
    return rn === numStr || rn === numPad || rn.padStart(2, '0') === numPad;
  });
  const dn = playerDisplayName(p);
  return dn ? `#${numPad} ${dn}` : `#${numPad}`;
}

/**
 * Costruisce una mappa numero → playerDisplayName da un array di partite.
 * Utile nei componenti che non ricevono il roster direttamente.
 * @param {Array} matches
 * @returns {object}  es. { "04": "Marta", "08": "Sofia" }
 */
export function buildRosterDisplayMap(matches) {
  const map = {};
  for (const m of (matches || [])) {
    for (const p of (m.roster || [])) {
      const num = String(p.number || '').padStart(2, '0');
      if (num && !map[num]) {
        map[num] = playerDisplayName(p);
      }
    }
  }
  return map;
}
