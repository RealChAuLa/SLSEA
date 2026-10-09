import { mulberry32, siteRandom } from './prng.js';

export const QUARTER_HOUR = 15 * 60000;
const DAY = 86400000;
const OFFSET = 330 * 60000;
const DEFAULT_SEED = 20260601;
const round = (value, places = 3) => Number(value.toFixed(places));
export function floorQuarterHour(date) {
  const value = new Date(date).getTime();
  if (!Number.isFinite(value)) throw new Error('Invalid generation timestamp.');
  return new Date(Math.floor(value / QUARTER_HOUR) * QUARTER_HOUR);
}
export function siteCapacity(siteId, seedRandom = DEFAULT_SEED) {
  return 3 + 12 * siteRandom(seedRandom, siteId)();
}
export function startEnergy(siteId, seedRandom = DEFAULT_SEED) {
  const random = siteRandom(seedRandom, siteId);
  random();
  return round(500 + 20000 * random());
}
export function solarCurve(hour) {
  return hour > 6 && hour < 18
    ? Math.sin((Math.PI * (hour - 6)) / 12) ** 1.5
    : 0;
}
function dayCloud(siteId, day, seedRandom) {
  const random = mulberry32((seedRandom + siteId) ^ Math.imul(day, 0x9e3779b1));
  let cloud = 0.35 + 0.65 * random();
  return Array.from({ length: 96 }, () => {
    cloud = Math.max(0.35, Math.min(1, cloud + (random() - 0.5) * 0.04));
    return cloud;
  });
}
export function generateSeries({
  site_id,
  endTimestamp,
  count,
  startEnergy: initial,
  meter_id = `MTR-${String(site_id).padStart(4, '0')}`,
  seedRandom = DEFAULT_SEED,
  alignEnd = true,
}) {
  if (
    !Number.isInteger(site_id) ||
    site_id < 1 ||
    !Number.isInteger(count) ||
    count < 0 ||
    count > 100000 ||
    !Number.isInteger(seedRandom) ||
    seedRandom < 0 ||
    seedRandom > 4294967295 ||
    typeof alignEnd !== 'boolean'
  )
    throw new Error('Invalid generation parameters.');
  const end = alignEnd
    ? floorQuarterHour(endTimestamp).getTime()
    : new Date(endTimestamp).getTime();
  if (!Number.isFinite(end)) throw new Error('Invalid generation timestamp.');
  let energy = initial ?? startEnergy(site_id, seedRandom);
  if (!Number.isFinite(energy) || energy < 0)
    throw new Error('Invalid starting energy.');
  const clouds = new Map();
  const capacity = siteCapacity(site_id, seedRandom);
  return Array.from({ length: count }, (_, index) => {
    const timestamp = new Date(end - (count - 1 - index) * QUARTER_HOUR);
    const local = timestamp.getTime() + OFFSET;
    const day = Math.floor(local / DAY);
    const slot = Math.floor((local - day * DAY) / QUARTER_HOUR);
    if (!clouds.has(day)) clouds.set(day, dayCloud(site_id, day, seedRandom));
    const random = mulberry32(
      (seedRandom + site_id) ^
        Math.imul(day, 0x85ebca6b) ^
        Math.imul(slot, 0xc2b2ae35),
    );
    const power_Kw = round(
      capacity *
        solarCurve((local - day * DAY) / 3600000) *
        clouds.get(day)[slot] *
        (0.95 + 0.1 * random()),
    );
    energy = round(energy + power_Kw * 0.25);
    const gaussian =
      Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, random()))) *
      Math.cos(2 * Math.PI * random());
    const voltage = round(
      Math.max(215, Math.min(245, 230 + 2.5 * gaussian)),
      1,
    );
    return {
      meter_id,
      timestamp,
      power_Kw,
      cumulative_energy_Kwh: energy,
      voltage,
    };
  });
}
