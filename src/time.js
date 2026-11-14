// Datas são guardadas como 'YYYY-MM-DD' no fuso de cada site; instantes como ms UTC.
export const DAY = 864e5;

const fmts = new Map();
function parts(ts, tz) {
  if (!fmts.has(tz)) fmts.set(tz, new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
  const p = {};
  for (const { type, value } of fmts.get(tz).formatToParts(ts)) p[type] = Number(value);
  return p;
}
export const pad = n => String(n).padStart(2, '0');
export const localDate = (ts, tz) => { const p = parts(ts, tz); return `${p.year}-${pad(p.month)}-${pad(p.day)}`; };
/** ms a somar a um instante UTC para obter a hora local */
export const tzOffset = (ts, tz) => { const p = parts(ts, tz); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(ts / 60e3) * 60e3; };
export const addDays = (d, n) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
/** instante UTC de "data às HH:00" no fuso tz */
export function zoned(d, hour, tz) {
  const wall = Date.parse(d) + hour * 3600e3;
  return wall - tzOffset(wall - tzOffset(wall, tz), tz);
}
export const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s));

export const RANGES = { today: 'Hoje', yesterday: 'Ontem', '7d': '7 dias', '30d': '30 dias', '90d': '90 dias', '12m': '12 meses' };
const BACK = { today: 0, yesterday: 1, '7d': 6, '30d': 29, '90d': 89, '12m': 364 };

/** Período a partir da query string: { range, from, to, days, compare, prev }. */
export function period(q, tz, now = Date.now()) {
  const today = localDate(now, tz);
  let range = q.get('range'), from, to = today;
  if (range === 'custom' && isDate(q.get('from')) && isDate(q.get('to')) && q.get('from') <= q.get('to')) {
    from = q.get('from'); to = q.get('to');
  } else {
    if (!Object.hasOwn(RANGES, range || '')) range = '7d';
    from = addDays(today, -BACK[range]);
    if (range === 'yesterday') to = from;
  }
  const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
  const compare = ['prev', 'year', 'off'].includes(q.get('compare')) ? q.get('compare') : 'prev';
  const shift = compare === 'year' ? 364 : days; // 364 mantém os dias da semana alinhados
  const prev = compare === 'off' ? null : { from: addDays(from, -shift), to: addDays(to, -shift) };
  return { range, from, to, days, compare, prev };
}

/** Rótulos dos baldes do gráfico: hora (1 dia), dia (≤ 92 dias) ou mês. */
export function buckets(from, to, days) {
  if (days === 1) return Array.from({ length: 24 }, (_, h) => [h, `${pad(h)}:00`]);
  if (days <= 92) return Array.from({ length: days }, (_, i) => { const d = addDays(from, i); return [d, `${d.slice(8)}/${d.slice(5, 7)}`]; });
  const keys = [];
  for (let m = from.slice(0, 7); m <= to.slice(0, 7);) {
    keys.push([m, `${m.slice(5)}/${m.slice(2, 4)}`]);
    const [y, mo] = m.split('-').map(Number);
    m = mo === 12 ? `${y + 1}-01` : `${y}-${pad(mo + 1)}`;
  }
  return keys;
}
