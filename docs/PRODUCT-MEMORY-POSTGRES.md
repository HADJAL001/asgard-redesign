# Product Memory PostgreSQL Runbook

The Product OS migration is additive. It does not replace `.data` or SQLite at deployment time.

## What is provisioned

`backend/src/postgres/001_product_memory.sql` creates tenant-scoped tables for ProductContract revisions, append-only evidence, Product Graph records and the four memory layers. All tables use PostgreSQL Row Level Security. Semantic memory uses `pgvector` with a 1536-dimensional embedding column and HNSW cosine index.

## Apply

1. Provision a PostgreSQL cluster with `pgcrypto` and `pgvector` available.
2. Create a dedicated, least-privilege migration role. Do not use an application connection string from the browser or commit it to the repository.
3. Set `OSGARD_PRODUCT_POSTGRES_URL` only in the protected operator environment.
4. Run `cd backend && npm run migrate:product-memory-postgres`.
5. Verify RLS with two distinct tenants: each request must execute `SET LOCAL osgard.tenant_id = '<authenticated tenant>'` within one transaction and must not observe the other tenant's rows.

## Shadow write

After the schema is present, set `OSGARD_PRODUCT_SHADOW_WRITE=true` in both the protected Next.js and backend environments. Authenticated blueprint creation then sends a bounded request to `POST /design/product-memory/shadow`. The backend accepts only the server-allowlisted `OSGARD_PRODUCT_TENANT_ID` scope (`osgardnewworld` in production); browser input cannot select a PostgreSQL RLS scope. The current store remains the source of reads. If PostgreSQL is unavailable, the shadow failure does not prevent a preview or change the existing blueprint result.

## Cutover

1. Enable shadow writes from the existing blueprint/evidence store to PostgreSQL.
2. Run the read-only reconciliation gate from the release checkout:

   ```bash
   cd backend
   npm run reconcile:product-memory-postgres
   ```

   The JSON report includes `source`, `postgres`, and `divergence` sections.
   Exit code `0` means no divergence; exit code `2` means a data mismatch and
   blocks cutover. It never writes to either store.
3. Compare contract revision count, hashes, evidence IDs and graph edges for every tenant.
4. Record reconciliation evidence in the Evidence Ledger.
5. Enable Postgres reads behind a tenant-scoped feature flag, retaining fallback reads.
6. Remove the fallback only after a full release cycle has no reconciliation divergence.

No production read path is switched by this migration. This avoids losing existing product records or falsely claiming database-native multi-tenancy before it is verified.

## Automated gate

The production release runs `osgard-product-memory-reconcile.timer` daily at
03:15 local server time with a persistent, randomized-delay schedule. It uses
the same read-only reconciliation command and protected environment described
above. Review its latest result with:

```bash
systemctl status osgard-product-memory-reconcile.service --no-pager
journalctl -u osgard-product-memory-reconcile.service -n 50 --no-pager
```

The service intentionally becomes inactive after a successful one-shot run; the
timer itself must remain enabled and active.
