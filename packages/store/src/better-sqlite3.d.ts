// The part of better-sqlite3 that node.ts uses (it ships no types; PowerSync uses it internally).
declare module "better-sqlite3" {
  type Statement = { get(...params: unknown[]): unknown };
  class Database {
    constructor(path: string, options?: { readonly?: boolean; fileMustExist?: boolean });
    prepare(sql: string): Statement;
    close(): void;
  }
  export default Database;
}
