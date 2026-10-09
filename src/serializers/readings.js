export function serializeReading(row, siteId) {
  return {
    site_id: siteId,
    meter_id: row.meter_id,
    timestamp: row.timestamp.toISOString(),
    power_Kw: row.power_Kw,
    cumulative_energy_Kwh: row.cumulative_energy_Kwh,
    voltage: row.voltage,
  };
}
