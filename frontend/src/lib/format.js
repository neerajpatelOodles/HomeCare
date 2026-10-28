export const fmtDateTime = (v) =>
  v ? new Date(v).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
export const fmtTime = (v) => (v ? new Date(v).toLocaleTimeString(undefined, { timeStyle: 'short' }) : '—');
export const fmtDate = (v) => {
  if (!v) return '—';
  // Plain dates (YYYY-MM-DD) must not shift by timezone.
  const s = String(v).slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { dateStyle: 'medium' });
};
export const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** <input type="datetime-local"> value -> ISO string with timezone (what the API expects). */
export const localToIso = (v) => new Date(v).toISOString();
/** ISO -> value for <input type="datetime-local"> in the browser's timezone. */
export const isoToLocal = (iso) => {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const fullName = (o) => [o?.firstName, o?.lastName].filter(Boolean).join(' ');

export const STATUS_LABEL = {
  applied: 'Applied', screening: 'Screening', interview: 'Interview', offer: 'Offer', hired: 'Hired', rejected: 'Rejected',
  scheduled: 'Scheduled', completed: 'Completed', cancelled: 'Cancelled', missed: 'Missed',
  active: 'Active', on_leave: 'On leave', inactive: 'Inactive', on_hold: 'On hold',
  pending: 'Pending', sent: 'Sent', failed: 'Failed',
};

export const DOC_LABEL = {
  resume: 'Résumé', cpr_first_aid: 'CPR / First Aid', police_check: 'Police check',
  certification: 'Certification', government_id: 'Government ID', other: 'Other',
};

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png'];
export const MAX_MB = 10;
export function checkFileClient(file) {
  if (!file) return '';
  const ext = file.name.split('.').pop().toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) return 'Only PDF, JPG or PNG files are allowed';
  if (file.size > MAX_MB * 1024 * 1024) return `File is larger than ${MAX_MB} MB`;
  return '';
}
