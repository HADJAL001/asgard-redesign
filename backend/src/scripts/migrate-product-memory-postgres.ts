import fs from "node:fs"
import path from "node:path"
import { Client } from "pg"

async function main() {
  const connectionString = process.env.OSGARD_PRODUCT_POSTGRES_URL
  if (!connectionString) {
    throw new Error("OSGARD_PRODUCT_POSTGRES_URL is required; no database action was taken.")
  }

  const migrationDirectory = path.resolve(__dirname, "../postgres")
  const migrations = fs.readdirSync(migrationDirectory)
    .filter((file) => /^\d+_product_memory.*\.sql$/i.test(file))
    .sort((left, right) => left.localeCompare(right, "en", { numeric: true }))
    .map((file) => ({ file, sql: fs.readFileSync(path.join(migrationDirectory, file), "utf8") }))
  if (!migrations.length) throw new Error("No Product Memory PostgreSQL migrations found.")
  const client = new Client({ connectionString, application_name: "osgard-product-memory-migration" })

  try {
    await client.connect()
    await client.query("BEGIN")
    await client.query("SELECT pg_advisory_xact_lock(hashtext('osgard-product-memory-migrations'))")
    await client.query(`CREATE SCHEMA IF NOT EXISTS osgard_product`)
    await client.query(`CREATE TABLE IF NOT EXISTS osgard_product.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`)

    // Installations created before schema_migrations exist already have the
    // initial schema. Mark that baseline once so a rerun does not recreate RLS
    // policies, then apply every later ordered migration normally.
    const baseline = migrations.find((migration) => migration.file.startsWith("001_"))
    if (baseline) {
      const baselinePresent = await client.query<{ present: string | null }>("SELECT to_regclass('osgard_product.product_contracts') AS present")
      const recorded = await client.query<{ present: number }>("SELECT 1 AS present FROM osgard_product.schema_migrations WHERE name = $1", [baseline.file])
      if (baselinePresent.rows[0]?.present && !recorded.rows.length) {
        await client.query("INSERT INTO osgard_product.schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", [baseline.file])
      }
    }

    for (const migration of migrations) {
      const applied = await client.query<{ present: number }>("SELECT 1 AS present FROM osgard_product.schema_migrations WHERE name = $1", [migration.file])
      if (applied.rows.length) continue
      await client.query(migration.sql)
      await client.query("INSERT INTO osgard_product.schema_migrations (name) VALUES ($1)", [migration.file])
      console.log(`Product memory migration applied: ${migration.file}`)
    }
    await client.query("COMMIT")
    console.log("Product memory PostgreSQL migrations are current.")
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw error
  } finally {
    await client.end().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
