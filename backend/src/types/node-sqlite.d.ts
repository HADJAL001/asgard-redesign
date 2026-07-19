declare module "node:sqlite" {
  export interface StatementResultingChanges {
    changes: number | bigint
    lastInsertRowid: number | bigint
  }

  export class StatementSync {
    run(...params: any[]): StatementResultingChanges
    get(...params: any[]): any
    all(...params: any[]): any[]
    iterate(...params: any[]): IterableIterator<any>
    setAllowBareNamedParameters(enabled: boolean): void
    setReadBigInts(enabled: boolean): void
  }

  export interface DatabaseSyncOptions {
    open?: boolean
    enableForeignKeyConstraints?: boolean
    enableDoubleQuotedStringLiterals?: boolean
    readOnly?: boolean
  }

  export class DatabaseSync {
    constructor(path: string, options?: DatabaseSyncOptions)
    open(): void
    close(): void
    prepare(sql: string): StatementSync
    exec(sql: string): void
    function(name: string, fn: (...args: any[]) => any): void
    function(name: string, options: object, fn: (...args: any[]) => any): void
  }
}
