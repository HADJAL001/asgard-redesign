import fs from "node:fs"
import path from "node:path"
import { Client } from "pg"

async function main() {
  const connectionString = process.env.OSGARD_PRODUCT_POSTGRES_URL
  if (!connectionString) {
    throw new Error("OSGARD_PRODUCT_POSTGRES_URL is required; no database action was taken.")
  }

  const migrationPath = path.resolve(__dirname, "../postgres/001_product_memory.sql")
  const sql = fs.readFileSync(migrationPath, "utf8")
  const client = new Client({ connectionString, application_name: "osgard-product-memory-migration" })

  try {
    await client.connect()
    await client.query("BEGIN")
    await client.query("SELECT pg_advisory_xact_lock(hashtext('osgard-product-memory-001'))")
    await client.query(sql)
    await client.query("COMMIT")
    console.log("Product memory PostgreSQL migration applied.")
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
