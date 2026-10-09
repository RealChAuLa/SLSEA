-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "JurisdictionType" AS ENUM ('national', 'provincial', 'district');

-- CreateTable
CREATE TABLE "provinces" (
    "province_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "provinces_pkey" PRIMARY KEY ("province_id")
);

-- CreateTable
CREATE TABLE "districts" (
    "district_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "province_id" INTEGER NOT NULL,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("district_id")
);

-- CreateTable
CREATE TABLE "grid_substations" (
    "substation_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "district_id" INTEGER NOT NULL,

    CONSTRAINT "grid_substations_pkey" PRIMARY KEY ("substation_id")
);

-- CreateTable
CREATE TABLE "solar_installations" (
    "site_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "meter_id" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "substation_id" INTEGER NOT NULL,

    CONSTRAINT "solar_installations_pkey" PRIMARY KEY ("site_id")
);

-- CreateTable
CREATE TABLE "generation_readings" (
    "meter_id" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ(3) NOT NULL,
    "power_kw" DOUBLE PRECISION NOT NULL,
    "cumulative_energy_kwh" DOUBLE PRECISION NOT NULL,
    "voltage" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "generation_readings_pkey" PRIMARY KEY ("meter_id","timestamp")
);

-- CreateTable
CREATE TABLE "users" (
    "user_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "jurisdiction_type" "JurisdictionType" NOT NULL,
    "jurisdiction_id" INTEGER,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "provinces_name_key" ON "provinces"("name");

-- CreateIndex
CREATE INDEX "districts_province_id_idx" ON "districts"("province_id");

-- CreateIndex
CREATE UNIQUE INDEX "districts_province_id_name_key" ON "districts"("province_id", "name");

-- CreateIndex
CREATE INDEX "grid_substations_district_id_idx" ON "grid_substations"("district_id");

-- CreateIndex
CREATE UNIQUE INDEX "grid_substations_district_id_name_key" ON "grid_substations"("district_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "solar_installations_meter_id_key" ON "solar_installations"("meter_id");

-- CreateIndex
CREATE INDEX "solar_installations_substation_id_idx" ON "solar_installations"("substation_id");

-- CreateIndex
CREATE INDEX "generation_readings_timestamp_idx" ON "generation_readings"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "districts" ADD CONSTRAINT "districts_province_id_fkey" FOREIGN KEY ("province_id") REFERENCES "provinces"("province_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grid_substations" ADD CONSTRAINT "grid_substations_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("district_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solar_installations" ADD CONSTRAINT "solar_installations_substation_id_fkey" FOREIGN KEY ("substation_id") REFERENCES "grid_substations"("substation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_readings" ADD CONSTRAINT "generation_readings_meter_id_fkey" FOREIGN KEY ("meter_id") REFERENCES "solar_installations"("meter_id") ON DELETE RESTRICT ON UPDATE CASCADE;

