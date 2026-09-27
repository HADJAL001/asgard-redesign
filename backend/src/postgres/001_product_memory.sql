-- OSGARD Product OS foundation. Apply only through the explicit PostgreSQL runner.
-- This migration is additive: the file-backed blueprint store remains the read source
-- until a shadow-write migration has been observed and reconciled.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS osgard_product;

CREATE TABLE IF NOT EXISTS osgard_product.tenants (
  tenant_id text PRIMARY KEY,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS osgard_product.product_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES osgard_product.tenants(tenant_id) ON DELETE RESTRICT,
  blueprint_id text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  contract_version text NOT NULL,
  contract_hash char(64) NOT NULL CHECK (contract_hash ~ '^[0-9a-f]{64}$'),
  contract jsonb NOT NULL,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(4,3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, blueprint_id, revision),
  UNIQUE (tenant_id, contract_hash)
);

CREATE INDEX IF NOT EXISTS product_contracts_tenant_blueprint_idx
  ON osgard_product.product_contracts (tenant_id, blueprint_id, revision DESC);

CREATE TABLE IF NOT EXISTS osgard_product.evidence_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES osgard_product.tenants(tenant_id) ON DELETE RESTRICT,
  contract_id uuid NOT NULL REFERENCES osgard_product.product_contracts(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision > 0),
  kind text NOT NULL CHECK (kind IN ('typecheck', 'unit', 'a11y', 'security', 'performance', 'visual-diff', 'deploy', 'social-preview', 'rollback', 'remediation', 'artifact-signature', 'dns-verification', 'supabase-verification', 'integration-verification')),
  status text NOT NULL CHECK (status IN ('passed', 'failed', 'skipped')),
  summary text NOT NULL,
  source text NOT NULL,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS evidence_ledger_contract_idx
  ON osgard_product.evidence_ledger (tenant_id, contract_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS osgard_product.product_graph_nodes (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES osgard_product.tenants(tenant_id) ON DELETE RESTRICT,
  blueprint_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('idea', 'contract', 'evidence', 'delivery', 'generation')),
  label text NOT NULL,
  revision integer CHECK (revision IS NULL OR revision > 0),
  status text,
  contract_hash char(64),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS product_graph_nodes_blueprint_idx
  ON osgard_product.product_graph_nodes (tenant_id, blueprint_id, occurred_at);

CREATE TABLE IF NOT EXISTS osgard_product.product_graph_edges (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES osgard_product.tenants(tenant_id) ON DELETE RESTRICT,
  from_node_id text NOT NULL REFERENCES osgard_product.product_graph_nodes(id) ON DELETE RESTRICT,
  to_node_id text NOT NULL REFERENCES osgard_product.product_graph_nodes(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('created', 'supersedes', 'verified_by', 'delivered_to', 'generated_as', 'transitioned_to')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_node_id <> to_node_id)
);

CREATE INDEX IF NOT EXISTS product_graph_edges_from_idx
  ON osgard_product.product_graph_edges (tenant_id, from_node_id);

CREATE TABLE IF NOT EXISTS osgard_product.memory_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES osgard_product.tenants(tenant_id) ON DELETE RESTRICT,
  layer text NOT NULL CHECK (layer IN ('atomic', 'semantic', 'episodic', 'procedural')),
  content text NOT NULL,
  content_hash char(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(4,3) NOT NULL DEFAULT 0.500 CHECK (confidence BETWEEN 0 AND 1),
  embedding vector(1536),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  UNIQUE (tenant_id, layer, content_hash, version)
);

CREATE INDEX IF NOT EXISTS memory_entries_tenant_layer_idx
  ON osgard_product.memory_entries (tenant_id, layer, created_at DESC);

CREATE INDEX IF NOT EXISTS memory_entries_embedding_hnsw_idx
  ON osgard_product.memory_entries USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

-- Every request must use `SET LOCAL osgard.tenant_id = '<authenticated tenant>'`
-- inside its transaction. The policies fail closed when the setting is absent.
ALTER TABLE osgard_product.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE osgard_product.product_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE osgard_product.evidence_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE osgard_product.product_graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE osgard_product.product_graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE osgard_product.memory_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE osgard_product.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE osgard_product.product_contracts FORCE ROW LEVEL SECURITY;
ALTER TABLE osgard_product.evidence_ledger FORCE ROW LEVEL SECURITY;
ALTER TABLE osgard_product.product_graph_nodes FORCE ROW LEVEL SECURITY;
ALTER TABLE osgard_product.product_graph_edges FORCE ROW LEVEL SECURITY;
ALTER TABLE osgard_product.memory_entries FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION osgard_product.current_tenant_id()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('osgard.tenant_id', true), '')
$$;

CREATE POLICY tenant_scope ON osgard_product.tenants
  USING (tenant_id = osgard_product.current_tenant_id())
  WITH CHECK (tenant_id = osgard_product.current_tenant_id());
CREATE POLICY tenant_scope ON osgard_product.product_contracts
  USING (tenant_id = osgard_product.current_tenant_id())
  WITH CHECK (tenant_id = osgard_product.current_tenant_id());
CREATE POLICY tenant_scope ON osgard_product.evidence_ledger
  USING (tenant_id = osgard_product.current_tenant_id())
  WITH CHECK (tenant_id = osgard_product.current_tenant_id());
CREATE POLICY tenant_scope ON osgard_product.product_graph_nodes
  USING (tenant_id = osgard_product.current_tenant_id())
  WITH CHECK (tenant_id = osgard_product.current_tenant_id());
CREATE POLICY tenant_scope ON osgard_product.product_graph_edges
  USING (tenant_id = osgard_product.current_tenant_id())
  WITH CHECK (tenant_id = osgard_product.current_tenant_id());
CREATE POLICY tenant_scope ON osgard_product.memory_entries
  USING (tenant_id = osgard_product.current_tenant_id())
  WITH CHECK (tenant_id = osgard_product.current_tenant_id());

-- Evidence is a ledger: rows may be added, but never rewritten or removed.
REVOKE UPDATE, DELETE ON osgard_product.evidence_ledger FROM PUBLIC;
