const MINUTE = 60_000;
const pad = (n) => String(n).padStart(2, '0');

/** The consecutive grid slots occupied by a booking, e.g. 60 min on a 30-min grid = 2 slots. */
export function buildSlots(start, durationMinutes, slotMinutes) {
  const count = durationMinutes / slotMinutes;
  return Array.from({ length: count }, (_, i) => new Date(start.getTime() + i * slotMinutes * MINUTE));
}

/** Checks that a start time sits on the slot grid and the whole booking fits inside business hours. */
export function checkSlotFit(start, durationMinutes, cfg) {
  if (start.getTime() % MINUTE !== 0) {
    return { ok: false, reason: 'must not include seconds or milliseconds' };
  }
  const minutes = Math.floor(start.getTime() / MINUTE) + cfg.utcOffsetMinutes;
  const minuteOfDay = ((minutes % 1440) + 1440) % 1440; // local time of day

  if (minuteOfDay % cfg.slotMinutes !== 0) {
    return { ok: false, reason: `must be aligned to a ${cfg.slotMinutes}-minute grid` };
  }
  if (minuteOfDay < cfg.openHour * 60 || minuteOfDay + durationMinutes > cfg.closeHour * 60) {
    return {
      ok: false,
      reason: `must fit within business hours (${pad(cfg.openHour)}:00-${pad(cfg.closeHour)}:00)`,
    };
  }
  return { ok: true };
}

/** Converts a local calendar date (YYYY-MM-DD) to the UTC instant of local midnight. Returns null if invalid. */
export function localDayStart(dateStr, utcOffsetMinutes) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr ?? '');
  if (!match) return null;
  const [y, m, d] = match.slice(1).map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return new Date(probe.getTime() - utcOffsetMinutes * MINUTE);
}
