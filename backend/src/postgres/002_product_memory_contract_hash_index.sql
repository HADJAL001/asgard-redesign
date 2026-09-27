-- Existing installations created before approval lifecycle shadowing enforced a
-- unique tenant/hash pair. That is too strict: the same immutable ProductContract
-- can be approved in a later revision without changing its content hash.
ALTER TABLE osgard_product.product_contracts
  DROP CONSTRAINT IF EXISTS product_contracts_tenant_id_contract_hash_key;

CREATE INDEX IF NOT EXISTS product_contracts_tenant_contract_hash_idx
  ON osgard_product.product_contracts (tenant_id, contract_hash);
