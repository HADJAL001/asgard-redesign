import { Octokit } from "@octokit/rest"
import { withRetry } from "../../utils/retry"
import { logIntegrationEvent } from "./logger"
import type { FileTree } from "../../types/file-tree"

/* ================================================================
   OSGARD · GitHub Repo Adapter
   ----------------------------------------------------------------
   Создаёт репозиторий под сервисным GITHUB_TOKEN (Personal Access
   Token с правом `repo`) и пушит файловое дерево одним коммитом через
   Git Data API (blob → tree → commit → update ref) — атомарно и без
   лишних запросов на файл, в отличие от Contents API.

   ВАЖНО: GITHUB_TOKEN — это НЕ GITHUB_CLIENT_ID/SECRET (те используются
   для OAuth соц-логина пользователей, см. .env.example).

   Пример вызова:
     const repoUrl = await createGitHubRepo(files, "my-generated-app")
     // -> "https://github.com/<owner>/my-generated-app"
   ================================================================ */

export function isGitHubConfigured(): boolean {
  return !!process.env.GITHUB_TOKEN
}

function getOctokit(): Octokit {
  if (!isGitHubConfigured()) {
    throw new Error("GITHUB_TOKEN не сконфигурирован на сервере")
  }
  return new Octokit({ auth: process.env.GITHUB_TOKEN })
}

/** Максимум параллельных createBlob-запросов за раз — защита от вторичного
 *  rate-limit'а GitHub на проектах с большим числом сгенерированных файлов. */
const BLOB_CHUNK_SIZE = 20

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

async function createBlobsChunked(
  octokit: Octokit,
  owner: string,
  repo: string,
  files: FileTree,
) {
  const results: { sha: string }[] = []
  for (const batch of chunk(files, BLOB_CHUNK_SIZE)) {
    const batchResults = await Promise.all(
      batch.map((f) =>
        withRetry(() => octokit.git.createBlob({ owner, repo, content: f.content, encoding: "utf-8" })),
      ),
    )
    results.push(...batchResults.map((r) => r.data))
  }
  return results
}

/** Создаёт репозиторий под сервисным аккаунтом и пушит в него files одним коммитом.
 *  `octokit` можно передать явно (для тестов, с застабленными методами) —
 *  по умолчанию создаётся клиент из GITHUB_TOKEN. */
export async function createGitHubRepo(
  files: FileTree,
  name: string,
  octokit: Octokit = getOctokit(),
): Promise<string> {
  if (files.length === 0) {
    throw new Error("Нет файлов для пуша в репозиторий")
  }

  const startedAt = Date.now()

  try {
    const { data: repo } = await withRetry(() =>
      octokit.repos.createForAuthenticatedUser({ name, auto_init: true, private: false }),
    )

    const owner = repo.owner.login
    const repoName = repo.name
    const branch = repo.default_branch || "main"

    const { data: ref } = await withRetry(() =>
      octokit.git.getRef({ owner, repo: repoName, ref: `heads/${branch}` }),
    )
    const baseCommitSha = ref.object.sha

    const { data: baseCommit } = await withRetry(() =>
      octokit.git.getCommit({ owner, repo: repoName, commit_sha: baseCommitSha }),
    )

    const blobs = await createBlobsChunked(octokit, owner, repoName, files)

    const { data: tree } = await withRetry(() =>
      octokit.git.createTree({
        owner,
        repo: repoName,
        base_tree: baseCommit.tree.sha,
        tree: files.map((f, i) => ({
          path: f.path,
          mode: "100644" as const,
          type: "blob" as const,
          sha: blobs[i].sha,
        })),
      }),
    )

    const { data: commit } = await withRetry(() =>
      octokit.git.createCommit({
        owner,
        repo: repoName,
        message: "Initial commit from OSGARD",
        tree: tree.sha,
        parents: [baseCommitSha],
      }),
    )

    await withRetry(() =>
      octokit.git.updateRef({ owner, repo: repoName, ref: `heads/${branch}`, sha: commit.sha }),
    )

    logIntegrationEvent("github", true, Date.now() - startedAt)
    return repo.html_url
  } catch (err) {
    logIntegrationEvent("github", false, Date.now() - startedAt, err)
    throw err
  }
}
