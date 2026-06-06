// Session-aware cadence: markets refresh fast while open, slow while closed.
// Sessions are deliberately coarse (regular hours, no holiday calendar) —
// worst case we poll a closed market at open-cadence for a holiday, which is harmless.
const SESSIONS = {
  us: { tz: 'America/New_York', open: 9 * 60 + 30, close: 16 * 60 },
  // wide window covering KRX (KST 9:00–15:30), TSE and HKEX
  asia: { tz: 'Asia/Seoul', open: 9 * 60, close: 17 * 60 },
  always: null, // crypto, FX
};

export function isSessionOpen(session, date = new Date()) {
  const s = SESSIONS[session ?? 'always'];
  if (!s) return true;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: s.tz,
      hour12: false,
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return false;
  const mins = (Number(parts.hour) % 24) * 60 + Number(parts.minute);
  return mins >= s.open && mins < s.close;
}

// cadence is either a number (fixed) or { open, closed, session }
export function currentCadence(cadence) {
  if (typeof cadence === 'number') return cadence;
  return isSessionOpen(cadence.session) ? cadence.open : cadence.closed;
}

export function sessionOpenFor(cadence) {
  if (typeof cadence === 'number') return null; // not session-bound
  return isSessionOpen(cadence.session);
}
