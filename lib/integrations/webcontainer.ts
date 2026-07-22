import type { FileTree } from "./file-tree"

/* ================================================================
   OSGARD · WebContainer Preview Adapter
   ----------------------------------------------------------------
   @webcontainer/api грузит Node.js-рантайм внутри WASM ПРЯМО В
   ВКЛАДКЕ БРАУЗЕРА — это невозможно вызвать из Express-бэкенда, только
   из клиентского кода (см. throw ниже при typeof window === "undefined").

   ТРЕБОВАНИЕ ОКРУЖЕНИЯ: странице, где вызывается runInWebContainer,
   нужны заголовки кросс-origin изоляции (нужны для SharedArrayBuffer):
     Cross-Origin-Opener-Policy: same-origin
     Cross-Origin-Embedder-Policy: require-corp
   Добавьте их в next.config.mjs через headers() СТРОГО для конкретного
   preview-роута (а не глобально — глобально может сломать сторонние
   встраивания/изображения на остальных страницах).

   Пример вызова (из клиентского компонента):
     const previewUrl = await runInWebContainer(files)
     iframeRef.current.src = previewUrl
   ================================================================ */

let containerPromise: Promise<import("@webcontainer/api").WebContainer> | null = null

async function getContainer() {
  if (typeof window === "undefined") {
    throw new Error("runInWebContainer доступен только в браузере")
  }
  if (!containerPromise) {
    const { WebContainer } = await import("@webcontainer/api")
    containerPromise = WebContainer.boot()
  }
  return containerPromise
}

type WebContainerFsTree = Record<string, { file: { contents: string } } | { directory: WebContainerFsTree }>

function toWebContainerTree(files: FileTree): WebContainerFsTree {
  const tree: WebContainerFsTree = {}

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean)
    let node = tree

    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i]
      const existing = node[dirName]
      if (!existing || !("directory" in existing)) {
        node[dirName] = { directory: {} }
      }
      node = (node[dirName] as { directory: WebContainerFsTree }).directory
    }

    node[parts[parts.length - 1]] = { file: { contents: file.content } }
  }

  return tree
}

/** Монтирует файлы, ставит зависимости и поднимает dev-сервер; возвращает превью-URL. */
export async function runInWebContainer(files: FileTree): Promise<string> {
  if (files.length === 0) {
    throw new Error("Нет файлов для превью")
  }

  const container = await getContainer()
  await container.mount(toWebContainerTree(files))

  const install = await container.spawn("npm", ["install"])
  const installExitCode = await install.exit
  if (installExitCode !== 0) {
    throw new Error(`npm install завершился с кодом ${installExitCode}`)
  }

  const devProcess = await container.spawn("npm", ["run", "dev"])

  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("WebContainer не поднял dev-сервер за 60с")), 60_000)

    container.on("server-ready", (_port, url) => {
      clearTimeout(timeout)
      resolve(url)
    })

    devProcess.exit.then((code) => {
      if (code !== 0) {
        clearTimeout(timeout)
        reject(new Error(`dev-сервер завершился с кодом ${code}`))
      }
    })
  })
}
