const STOPWORDS = new Set([
  'ASD', 'SSD', 'SOCIETA', 'SPORTIVA', 'DILETTANTISTICA', 'VOLLEY', 'TEAM', 'PALLAVOLO',
  'CLUB', 'POLISPORTIVA', 'U', 'S', 'CUS', 'A', 'D', 'F', 'M',
]);

function normalizeBase(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokenSet(value = '') {
  return new Set(
    normalizeBase(value)
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token && !STOPWORDS.has(token))
  );
}

export function normalizeTeamNameForMatch(value = '') {
  return normalizeBase(value);
}

export function areTeamNamesLikelySame(a = '', b = '') {
  const left = normalizeBase(a);
  const right = normalizeBase(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if ((left.length >= 4 && right.includes(left)) || (right.length >= 4 && left.includes(right))) return true;

  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return false;
  const smaller = leftTokens.size <= rightTokens.size ? leftTokens : rightTokens;
  const larger = leftTokens.size <= rightTokens.size ? rightTokens : leftTokens;
  let common = 0;
  smaller.forEach((token) => { if (larger.has(token)) common += 1; });
  if (common === 0) return false;
  const coverage = common / smaller.size;
  return coverage >= 0.67 || (common >= 2 && coverage >= 0.5);
}

export function pickCanonicalTeamLabel(current = '', next = '') {
  const left = String(current || '').trim();
  const right = String(next || '').trim();
  if (!left) return right;
  if (!right) return left;
  return right.length > left.length ? right : left;
}
