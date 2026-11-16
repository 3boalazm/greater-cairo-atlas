-- Keep mutable review and relation records consistent with the core schema.
CREATE TRIGGER trg_entity_relations_set_updated_at BEFORE UPDATE ON entity_relations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
CREATE TRIGGER trg_submissions_set_updated_at BEFORE UPDATE ON submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
CREATE TRIGGER trg_fact_reviews_set_updated_at BEFORE UPDATE ON fact_reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
