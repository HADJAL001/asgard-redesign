import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { DeployAgent } from "../../../services/agents/deploy.agent"

/* DeployAgent.execute() никогда не должен обращаться к реальной сети в обычном
   npm test — deployToVercel/createGitHubRepo сами бросают синхронно (до сетевого
   запроса), если VERCEL_TOKEN/GITHUB_TOKEN не заданы, а execute() эту ошибку
   ловит и деградирует на source:"fallback" (см. deploy.agent.ts). Поэтому здесь
   тестируется именно контракт деградации, а не реальный деплой (для него —
   integrations/e2e/vercel.e2e.test.ts, гейтится по токену). */

const originalVercelToken = process.env.VERCEL_TOKEN
const originalGitHubToken = process.env.GITHUB_TOKEN

before(() => {
  delete process.env.VERCEL_TOKEN
  delete process.env.GITHUB_TOKEN
})

after(() => {
  if (originalVercelToken === undefined) delete process.env.VERCEL_TOKEN
  else process.env.VERCEL_TOKEN = originalVercelToken
  if (originalGitHubToken === undefined) delete process.env.GITHUB_TOKEN
  else process.env.GITHUB_TOKEN = originalGitHubToken
})

test("DeployAgent: пустой список файлов -> fallback без обращения к интеграциям", async () => {
  const agent = new DeployAgent()
  const result = await agent.execute({ files: [], projectName: "empty-project" })

  assert.equal(result.type, "deployed")
  assert.equal(result.source, "fallback")
  assert.equal(result.appUrl, null)
  assert.equal(result.repoUrl, null)
})

test("DeployAgent: без токенов деградирует на fallback (не бросает исключение)", async () => {
  const agent = new DeployAgent()
  const files = [
    { path: "index.html", content: "<html><body>Hello</body></html>" },
    { path: "package.json", content: JSON.stringify({ name: "test-app" }) },
  ]

  const result = await agent.execute({ files, projectName: "deploy-agent-test" })

  assert.equal(result.source, "fallback")
  assert.equal(result.appUrl, null)
  assert.equal(result.repoUrl, null)
})

test("DeployAgent: sandbox mode stops after a successful build without publishing", async () => {
  const buildSandbox = async () => ({
    ok: true,
    skipped: false,
    timedOut: false,
    durationMs: 10,
    exitCode: 0,
    logs: "build passed",
  }) as any
  let vercelCalls = 0
  let githubCalls = 0
  const agent = new DeployAgent({
    deployToVercel: async () => { vercelCalls++; return "https://unexpected.example" },
    createGitHubRepo: async () => { githubCalls++; return "https://unexpected.example" },
  }, buildSandbox)
  const files = [
    { path: "index.html", content: "<html><body>Hello</body></html>" },
    { path: "package.json", content: JSON.stringify({ name: "test-app" }) },
  ]

  const result = await agent.execute({ files, projectName: "sandbox-only-test", mode: "sandbox" })

  assert.equal(result.source, "sandbox-only")
  assert.equal(result.appUrl, null)
  assert.equal(result.repoUrl, null)
  assert.equal(vercelCalls, 0)
  assert.equal(githubCalls, 0)
})

test("DeployAgent: при наличии package.json генерирует Dockerfile, если его ещё нет в дереве", async () => {
  const agent = new DeployAgent()
  const files = [{ path: "package.json", content: JSON.stringify({ name: "test-app" }) }]

  const result = await agent.execute({ files, projectName: "deploy-agent-dockerfile-test" })

  assert.ok(result.dockerfile, "dockerfile должен быть сгенерирован для проекта с package.json")
  assert.match(result.dockerfile!, /FROM node:/)
})

test("DeployAgent: не перезаписывает уже существующий в дереве Dockerfile", async () => {
  const agent = new DeployAgent()
  const customDockerfile = "FROM scratch\n"
  const files = [
    { path: "package.json", content: JSON.stringify({ name: "test-app" }) },
    { path: "Dockerfile", content: customDockerfile },
  ]

  const result = await agent.execute({ files, projectName: "deploy-agent-custom-dockerfile-test" })

  assert.equal(result.dockerfile, customDockerfile)
})
