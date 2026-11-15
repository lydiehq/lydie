import { describe, expect, it } from "bun:test";

import { checkManifest, checkSpecifier, extractImports, packageName } from "./check-boundaries.ts";
import type { PackageInfo } from "./check-boundaries.ts";

const clientRoot = "/repo/client";

function pkg(name: string, dir: string, kind: PackageInfo["kind"] = "package"): PackageInfo {
  return { name, kind, dir: `${clientRoot}/${dir}` };
}

const store = pkg("@lydie/store", "packages/store");
const ui = pkg("@lydie/ui", "packages/ui");
const plugin = pkg("@lydie/plugin-document-tree", "plugins/document-tree", "plugin");

function rules(p: PackageInfo, file: string, source: string) {
  const path = `${p.dir}/${file}`;
  return extractImports(source).flatMap((s) =>
    checkSpecifier({ clientRoot, pkg: p }, path, s).map((v) => v.rule),
  );
}

describe("extractImports", () => {
  it("finds static, side-effect, type, re-export, dynamic and require imports", () => {
    const source = `
      import a from "a";
      import type { B } from 'b';
      import {
        c,
        d,
      } from "c";
      import "side-effect";
      export * from "./re-export.ts";
      const e = await import("e");
      const f = require("f");
      // import nope from "commented-out";
      /* import nope2 from "block-comment"; */
    `;
    expect(extractImports(source).sort()).toEqual(
      ["./re-export.ts", "a", "b", "c", "e", "f", "side-effect"].sort(),
    );
  });

  it("does not read the word import at the end of a string as an import", () => {
    const source = `
      const keywords = ["import", "export"];
      const name = "Markdown import";
      import "./styles.css";
    `;
    expect(extractImports(source)).toEqual(["./styles.css"]);
  });

  it("maps specifiers to package names", () => {
    expect(packageName("@lydie/plugin-api/views")).toBe("@lydie/plugin-api");
    expect(packageName("react/jsx-runtime")).toBe("react");
  });
});

describe("rule a: nothing outside client/", () => {
  it("rejects relative imports escaping client/ and @lydie-core packages", () => {
    expect(
      rules(store, "src/index.ts", `import x from "../../../../services/api/src/index.ts";`),
    ).toEqual(["a"]);
    expect(rules(store, "src/index.ts", `import { api } from "@lydie-core/api";`)).toEqual(["a"]);
  });

  it("allows relative imports inside client/", () => {
    expect(rules(store, "src/index.ts", `import { x } from "./x.ts";`)).toEqual([]);
  });

  it("rejects manifests that reach outside client/", () => {
    const violations = checkManifest({ clientRoot, pkg: store }, `${store.dir}/package.json`, {
      dependencies: { "@lydie-core/api": "workspace:*", outside: "file:../../../shared" },
    });
    expect(violations.map((v) => v.rule)).toEqual(["a", "a"]);
  });
});

describe("rule b: internal dependency table", () => {
  it("allows dependencies listed in the table", () => {
    expect(rules(store, "src/index.ts", `import { op } from "@lydie/contract";`)).toEqual([]);
  });

  it("rejects dependencies not listed in the table", () => {
    expect(rules(store, "src/index.ts", `import { App } from "@lydie/app";`)).toEqual(["b"]);
    const violations = checkManifest({ clientRoot, pkg: ui }, `${ui.dir}/package.json`, {
      dependencies: { "@lydie/store": "workspace:*" },
    });
    expect(violations.map((v) => v.rule)).toEqual(["b"]);
  });

  it("rejects packages missing from the table", () => {
    const unknown = pkg("@lydie/mystery", "packages/mystery");
    expect(rules(unknown, "src/index.ts", `import "@lydie/contract";`)).toEqual(["b"]);
  });
});

describe("rule c: plugins import only the plugin API", () => {
  it("allows the plugin API, react and files inside the plugin", () => {
    const source = `
      import { definePlugin } from "@lydie/plugin-api";
      import { useState } from "react";
      import { jsx } from "react/jsx-runtime";
      import { Tree } from "./Tree.tsx";
    `;
    expect(rules(plugin, "src/index.ts", source)).toEqual([]);
  });

  it("rejects other packages and files outside the plugin", () => {
    expect(rules(plugin, "src/index.ts", `import { Button } from "@lydie/ui";`)).toEqual(["c"]);
    expect(rules(plugin, "src/index.ts", `import x from "../../editor-view/src/x.ts";`)).toEqual([
      "c",
    ]);
  });

  it("lets plugin test files use bun:test", () => {
    expect(rules(plugin, "src/tree.test.ts", `import { it } from "bun:test";`)).toEqual([]);
    expect(rules(plugin, "src/tree.ts", `import { it } from "bun:test";`)).toEqual(["c"]);
  });
});

describe("rule d: UI never touches the filesystem or SQL", () => {
  it("rejects node, fs, sqlite and powersync imports in ui", () => {
    expect(rules(ui, "src/a.ts", `import { readFile } from "node:fs/promises";`)).toEqual(["d"]);
    expect(rules(ui, "src/a.ts", `import fs from "fs";`)).toEqual(["d"]);
    expect(rules(ui, "src/a.ts", `import Database from "better-sqlite3";`)).toEqual(["d"]);
    expect(rules(ui, "src/a.ts", `import { PowerSyncDatabase } from "@powersync/web";`)).toEqual([
      "d",
    ]);
    expect(rules(ui, "src/a.ts", `import sqlite from "@sqlite.org/sqlite-wasm";`)).toEqual(["d"]);
  });

  it("does not apply to non-UI packages", () => {
    expect(rules(store, "src/a.ts", `import { PowerSyncDatabase } from "@powersync/web";`)).toEqual(
      [],
    );
  });

  it("reports both c and d for a plugin touching the filesystem", () => {
    expect(rules(plugin, "src/a.ts", `import fs from "node:fs";`).sort()).toEqual(["c", "d"]);
  });
});
