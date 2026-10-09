const OFFSET = 330 * 60000;
const DAY = 86400000;
function milliseconds(date) {
  const value = new Date(date).getTime();
  if (!Number.isFinite(value)) throw new Error('Invalid local-time input.');
  return value;
}
export function startOfLocalDay(date) {
  const value = milliseconds(date);
  return new Date(Math.floor((value + OFFSET) / DAY) * DAY - OFFSET);
}
export function startOfLocalHour(date) {
  const value = milliseconds(date);
  return new Date(Math.floor((value + OFFSET) / 3600000) * 3600000 - OFFSET);
}
export function localHour(date) {
  const local = new Date(milliseconds(date) + OFFSET);
  return (
    local.getUTCHours() +
    local.getUTCMinutes() / 60 +
    local.getUTCSeconds() / 3600
  );
}
