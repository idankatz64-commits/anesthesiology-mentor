const TZ = 'Asia/Jerusalem';

export function getIsraelToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

/**
 * The instant Israel's civil day starts, as an ISO string Postgres can compare
 * against a timestamptz.
 *
 * Israel is UTC+2 (IST) for roughly a third of the year and UTC+3 (IDT) for the
 * rest, so neither offset can be hardcoded: pick the wrong one and the day
 * boundary moves an hour, quietly pulling the tail of yesterday into "today".
 * Ask Intl which offset applies on that date instead. The probe is midday UTC,
 * far from the ~02:00 local changeover, so the transition days answer cleanly.
 */
export function getIsraelStartOfDay(isoDate: string): string {
  const offset = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    timeZoneName: 'longOffset',
  })
    .formatToParts(new Date(`${isoDate}T12:00:00Z`))
    .find(p => p.type === 'timeZoneName')!.value; // "GMT+03:00"
  return `${isoDate}T00:00:00${offset.replace('GMT', '')}`;
}

/** The Israel-local calendar date of an instant, as YYYY-MM-DD. */
export function getIsraelDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

export function addDaysIsrael(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86400000);
}
