-- Hand-written invariants that Prisma's schema cannot express (project.md §2.5).
ALTER TABLE users ADD CONSTRAINT users_jurisdiction_chk CHECK (
  (jurisdiction_type = 'national' AND jurisdiction_id IS NULL) OR
  (jurisdiction_type <> 'national' AND jurisdiction_id IS NOT NULL)
);

ALTER TABLE generation_readings ADD CONSTRAINT readings_values_chk CHECK (
  power_kw >= 0 AND cumulative_energy_kwh >= 0 AND voltage > 0
);
