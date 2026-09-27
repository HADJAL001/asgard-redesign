# Product Memory Operations

## Purpose

Product Memory is the durable, tenant-isolated evidence layer for AI Cofounder.
It stores ProductContract revisions, Evidence Ledger records, Product Graph
nodes and edges, and the Atomic, Semantic, Episodic, and Procedural memory
layers.

The file Blueprint Store remains the source of reads during the shadow-write
phase. Postgres receives durable copies of writes. Reads must not move to
Postgres until reconciliation proves that both stores agree.

## Production Configuration

The two server processes that can write Product Memory load a root-owned
environment file:

```ini
OSGARD_PRODUCT_POSTGRES_URL=postgresql://...
OSGARD_PRODUCT_SHADOW_WRITE=true
OSGARD_PRODUCT_DUAL_READ=false
OSGARD_PRODUCT_TENANT_ID=osgardnewworld
```

The environment file is outside the checkout, has mode `0600`, and is loaded
through systemd drop-ins for `osgard-web.service` and `osgard-api.service`.
Never commit the URL, database password, API keys, or a populated `.env` file.
`OSGARD_PRODUCT_TENANT_ID` is an allowlisted server value. The backend rejects
shadow payloads that name a different tenant, so browser input cannot select a
Postgres RLS scope.

`OSGARD_PRODUCT_DUAL_READ` is a separate, disabled-by-default observation
flag. When enabled after a successful shadow-write window, it compares the
file-backed contract and evidence IDs against Postgres without changing any API
response source. It must remain `false` until a real authenticated flow has
been reconciled with non-zero records.

For Supabase on an IPv4-only host, use the shared transaction pooler URI. It
does not require enabling the dedicated IPv4 add-on. Keep the connection
server-side only.

## Schema Migration

Run the migration from the backend directory after exporting the protected
server environment:

```bash
set -a
. /etc/osgard/product-memory.env
set +a
npm run migrate:product-memory-postgres
```

The schema is `osgard_product`. It includes these tables:

- `tenants`
- `product_contracts`
- `evidence_ledger`
- `product_graph_nodes`
- `product_graph_edges`
- `memory_entries`

All tenant-bearing tables have Row Level Security enabled and forced.

## Release Check

1. Build frontend and backend.
2. Run the migration idempotently.
3. Restart `osgard-web.service` and `osgard-api.service`.
4. Verify `https://osgardnewworld.com/cofounder` responds with `200`.
5. In an authenticated session create a blueprint, issue a command, save an
   editor revision, and configure a delivery target.
6. Reconcile the resulting contract, evidence records, and graph nodes against
   the file Blueprint Store before enabling any Postgres read path:

   ```bash
   cd backend
   npm run reconcile:product-memory-postgres
   ```

   This command is read-only. It always checks `osgardnewworld` (plus the
   configured Product Memory tenant and any tenants present in source data),
   prints a JSON report, and exits with code `2`
   when contracts, hashes, evidence, graph nodes, graph edges, or unexpected
   PostgreSQL rows diverge. Run it from the same release checkout that owns the
   mounted `.data` files, or set `BLUEPRINT_STORE_PATH` and
   `BLUEPRINT_EVIDENCE_PATH` explicitly.

## Rollback

To stop new shadow writes without losing evidence already recorded, set
`OSGARD_PRODUCT_SHADOW_WRITE=false` in the protected environment file and
restart the two services. Do not drop Product Memory tables as part of an
application rollback.

## Automated Reconciliation

Production runs the read-only gate once per day through
`osgard-product-memory-reconcile.timer`. It is scheduled for `03:15` local
server time with a bounded randomized delay and `Persistent=true`, so a missed
window is recovered after the server returns. The timer invokes the same
`npm run reconcile:product-memory-postgres` command from the deployed backend
checkout, uses the protected Product Memory environment file, and fails after
30 seconds rather than leaving a hung job.

Operator checks:

```bash
systemctl list-timers osgard-product-memory-reconcile.timer
systemctl status osgard-product-memory-reconcile.service --no-pager
journalctl -u osgard-product-memory-reconcile.service -n 50 --no-pager
```

`inactive (dead)` for the service after a successful run is expected because it
is a one-shot job. The timer must remain `enabled` and `active`. A non-zero
service result is a release signal: keep file-store reads authoritative, inspect
the JSON divergence report, and do not advance the Postgres cutover.

## Remaining Work

- Run reconciliation continuously during the shadow-write release window;
  promote only after a full release cycle reports `ok: true`.
- Run the first authenticated non-zero blueprint flow and retain a clean
  dual-read observation window before promoting Postgres to a read source.
- Sealed generation artifacts are shadowed with their signed evidence; extend this next to all sandbox lifecycle statuses and graph nodes.
- Approval lifecycle revisions plus manual and delivery-verification Evidence Ledger writes are shadowed.
- Add signed sandbox artifacts and verified deployment evidence.
- Add provider credential adapters behind a server-side service bridge.
