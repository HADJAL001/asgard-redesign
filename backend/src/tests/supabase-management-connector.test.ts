import assert from "node:assert/strict"
import test from "node:test"
import { getConnector, getConnectorAction } from "../services/service-bridge/connector-registry"

test("Supabase Management exposes an explicit, non-test provisioning action", () => {
  const connector = getConnector("supabase-management")
  assert.ok(connector)
  const action = getConnectorAction(connector, "create_project")
  assert.ok(action)
  assert.equal(action.method, "POST")
  assert.equal(action.path, "/projects")
  assert.equal(action.isTestAction, undefined)
  assert.deepEqual(action.params?.filter((param) => param.required).map((param) => param.key), ["name", "organization_id", "region", "db_pass"])
})
