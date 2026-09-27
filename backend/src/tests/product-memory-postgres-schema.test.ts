import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const schemaPath = path.resolve(__dirname, "../postgres/001_product_memory.sql")
const sql = fs.readFileSync(schemaPath, "utf8")
const lifecycleMigrationPath = path.resolve(__dirname, "../postgres/002_product_memory_contract_hash_index.sql")
const lifecycleSql = fs.readFileSync(lifecycleMigrationPath, "utf8")

test("Product OS PostgreSQL schema contains tenant-scoped contracts, evidence and four memory layers", () => {
  for (const table of ["product_contracts", "evidence_ledger", "product_graph_nodes", "product_graph_edges", "memory_entries"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS osgard_product\\.${table}`))
    assert.match(sql, new RegExp(`ALTER TABLE osgard_product\\.${table} ENABLE ROW LEVEL SECURITY`))
    assert.match(sql, new RegExp(`ALTER TABLE osgard_product\\.${table} FORCE ROW LEVEL SECURITY`))
  }
  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS vector/)
  assert.match(sql, /embedding vector\(1536\)/)
  assert.match(sql, /'atomic', 'semantic', 'episodic', 'procedural'/)
})

test("Evidence ledger is append-only and RLS fails closed without an authenticated tenant", () => {
  assert.match(sql, /NULLIF\(current_setting\('osgard\.tenant_id', true\), ''\)/)
  assert.match(sql, /REVOKE UPDATE, DELETE ON osgard_product\.evidence_ledger FROM PUBLIC/)
  assert.match(sql, /CREATE POLICY tenant_scope ON osgard_product\.evidence_ledger/)
})

test("ProductContract content hashes remain indexable without forbidding approval revisions", () => {
  assert.doesNotMatch(sql, /UNIQUE \(tenant_id, contract_hash\)/)
  assert.match(sql, /CREATE INDEX IF NOT EXISTS product_contracts_tenant_contract_hash_idx/)
  assert.match(lifecycleSql, /DROP CONSTRAINT IF EXISTS product_contracts_tenant_id_contract_hash_key/)
})
