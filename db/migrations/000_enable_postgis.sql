-- Migration 000: Enable PostGIS spatial extension
-- Phase 01 (Foundation) — Greater Cairo Atlas
-- Note: Core domain tables (entities, facts, evidence, features) are intentionally deferred to Phase 02.

CREATE EXTENSION IF NOT EXISTS postgis;
