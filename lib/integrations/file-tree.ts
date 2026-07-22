/* Совпадает по форме с backend/src/types/file-tree.ts — держим отдельную
   копию, т.к. фронтенд и backend являются раздельными TS-проектами. */

export type FileTreeEntry = {
  path: string
  content: string
}

export type FileTree = FileTreeEntry[]
