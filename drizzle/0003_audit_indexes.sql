-- Custom SQL migration: performance indexes identified in pre-production audit
CREATE INDEX IF NOT EXISTS expenses_project_status_idx ON expenses (project_id, status);
CREATE INDEX IF NOT EXISTS wir_boq_item_idx ON wir (boq_item_id);
CREATE INDEX IF NOT EXISTS boq_items_project_idx ON boq_items (project_id);
CREATE INDEX IF NOT EXISTS adjustments_project_status_idx ON adjustments (project_id, status);
