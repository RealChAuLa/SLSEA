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

function bucketStep(interval) {
  if (!['hour', 'day'].includes(interval))
    throw new Error('Invalid bucket interval.');
  return interval === 'hour' ? 3600000 : DAY;
}
export function snapTrendWindow(from, to, interval) {
  const step = bucketStep(interval);
  const floor = (date) =>
    Math.floor((milliseconds(date) + OFFSET) / step) * step - OFFSET;
  const start = floor(from);
  const endFloor = floor(to);
  return {
    from: new Date(start),
    to: new Date(endFloor + (milliseconds(to) === endFloor ? 0 : step)),
  };
}
export function enumerateBuckets(from, to, interval) {
  const step = bucketStep(interval);
  const start = milliseconds(from),
    end = milliseconds(to);
  const limit = interval === 'hour' ? 168 : 92;
  if (start >= end || (end - start) / step > limit)
    throw new Error('Invalid bucket window.');
  return Array.from({ length: (end - start) / step }, (_, index) => ({
    bucket_start: new Date(start + index * step).toISOString(),
    bucket_end: new Date(start + (index + 1) * step).toISOString(),
    energy_Kwh: 0,
    reporting_installations: 0,
    reading_count: 0,
  }));
}
