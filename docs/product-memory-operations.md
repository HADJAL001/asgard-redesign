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
```

The environment file is outside the checkout, has mode `0600`, and is loaded
through systemd drop-ins for `osgard-web.service` and `osgard-api.service`.
Never commit the URL, database password, API keys, or a populated `.env` file.

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
   the file Blueprint Store before enabling any Postgres read path.

## Rollback

To stop new shadow writes without losing evidence already recorded, set
`OSGARD_PRODUCT_SHADOW_WRITE=false` in the protected environment file and
restart the two services. Do not drop Product Memory tables as part of an
application rollback.

## Remaining Work

- Add a reconciliation command and a dual-read flag before promoting Postgres
  to a read source.
- Shadow generation, quality-gate, and approval events.
- Add signed sandbox artifacts and verified deployment evidence.
- Add provider credential adapters behind a server-side service bridge.
