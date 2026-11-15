// electron-builder afterPack hook: removes native binaries of other platforms and architectures
// from the packaged app (PowerSync extensions, better-sqlite3 prebuilds). They sit in
// app.asar.unpacked, so this runs before signing and leaves the asar archive untouched.
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

type Context = {
  appOutDir: string;
  electronPlatformName: string;
  arch: number;
  packager: { appInfo: { productFilename: string } };
};

// electron-builder's Arch enum.
const ARCH: Record<number, string> = {
  0: "ia32",
  1: "x64",
  2: "armv7l",
  3: "arm64",
  4: "universal",
};

export default async function afterPack(context: Context): Promise<void> {
  const platform = context.electronPlatformName;
  const arch = ARCH[context.arch] ?? "";
  if (arch === "universal") return;
  const resources =
    platform === "darwin"
      ? join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          "Contents",
          "Resources",
        )
      : join(context.appOutDir, "resources");
  const modules = join(resources, "app.asar.unpacked", "node_modules");

  // better-sqlite3: prebuilds/<platform>-<arch>.node (linuxmusl-* on musl).
  const keepPrebuild = (name: string) =>
    name.startsWith(`${platform}-${arch}.`) ||
    (platform === "linux" && name.startsWith(`linuxmusl-${arch}.`));
  await prune(join(modules, "better-sqlite3", "prebuilds"), keepPrebuild);

  // PowerSync: libpowersync_<arch>.<os>.{dylib,so} / powersync_<arch>.dll.
  const psArch = { x64: "x64", arm64: "aarch64", ia32: "x86", armv7l: "armv7" }[arch] ?? arch;
  const psOs = { darwin: "macos", linux: "linux", win32: "" }[platform] ?? platform;
  const keepExtension = (name: string) => {
    if (!/\.(dylib|so|dll)$/.test(name)) return true;
    return platform === "win32"
      ? name === `powersync_${psArch}.dll`
      : name === `libpowersync_${psArch}.${psOs}.${platform === "darwin" ? "dylib" : "so"}`;
  };
  await prune(join(modules, "@powersync", "node", "lib"), keepExtension);

  // @parcel/watcher: one optional package per platform (watcher-darwin-arm64, ...). A release
  // build installs both Mac architectures (`bun install --os=darwin --cpu='*'`) and each app keeps
  // its own.
  await prune(
    join(modules, "@parcel"),
    (name) =>
      !name.startsWith("watcher-") ||
      name === `watcher-${platform}-${arch}` ||
      name.startsWith(`watcher-${platform}-${arch}-`),
    true,
  );
}

async function prune(
  dir: string,
  keep: (name: string) => boolean,
  recursive = false,
): Promise<void> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return;
  }
  await Promise.all(
    names.filter((n) => !keep(n)).map((n) => rm(join(dir, n), { force: true, recursive })),
  );
}
