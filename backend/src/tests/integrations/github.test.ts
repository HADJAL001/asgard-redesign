import { test } from "node:test"
import assert from "node:assert/strict"
import type { Octokit } from "@octokit/rest"
import { createGitHubRepo } from "../../services/integrations/github"

/* Октокит передаётся инъекцией (второй параметр createGitHubRepo) — реальных
   репозиториев/сети эти тесты не создают. */

function makeFakeOctokit(fileCount: number) {
  const blobCalls: string[] = []

  const fake = {
    repos: {
      createForAuthenticatedUser: async () => ({
        data: { owner: { login: "osgard-bot" }, name: "generated-app", default_branch: "main", html_url: "https://github.com/osgard-bot/generated-app" },
      }),
    },
    git: {
      getRef: async () => ({ data: { object: { sha: "base-commit-sha" } } }),
      getCommit: async () => ({ data: { tree: { sha: "base-tree-sha" } } }),
      createBlob: async ({ content }: { content: string }) => {
        blobCalls.push(content)
        return { data: { sha: `blob-sha-${blobCalls.length}` } }
      },
      createTree: async ({ tree }: { tree: Array<{ path: string; sha: string }> }) => {
        assert.equal(tree.length, fileCount, "в дерево должны попасть все файлы, включая после чанкинга")
        return { data: { sha: "new-tree-sha" } }
      },
      createCommit: async () => ({ data: { sha: "new-commit-sha" } }),
      updateRef: async () => ({ data: {} }),
    },
  } as unknown as Octokit

  return { fake, blobCalls }
}

test("createGitHubRepo: без файлов бросает ошибку без обращения к API", async () => {
  const { fake } = makeFakeOctokit(0)
  await assert.rejects(() => createGitHubRepo([], "empty-repo", fake), /Нет файлов для пуша/)
})

test("createGitHubRepo: пушит одним коммитом и возвращает html_url", async () => {
  const { fake } = makeFakeOctokit(2)
  const files = [
    { path: "package.json", content: "{}" },
    { path: "index.js", content: "console.log(1)" },
  ]
  const url = await createGitHubRepo(files, "generated-app", fake)
  assert.equal(url, "https://github.com/osgard-bot/generated-app")
})

test("createGitHubRepo: создаёт blob на каждый файл, даже когда файлов больше размера чанка", async () => {
  const fileCount = 45 // > BLOB_CHUNK_SIZE (20) — проверяем чанкинг в несколько партий
  const { fake, blobCalls } = makeFakeOctokit(fileCount)
  const files = Array.from({ length: fileCount }, (_, i) => ({ path: `file-${i}.txt`, content: `content-${i}` }))

  await createGitHubRepo(files, "big-generated-app", fake)

  assert.equal(blobCalls.length, fileCount)
  assert.deepEqual(blobCalls, files.map((f) => f.content), "порядок blob'ов должен соответствовать порядку файлов")
})
