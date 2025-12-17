import { cp, mkdir, readdir, stat } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths relative to the scripts package
const ROOT_DIR = join(__dirname, "../../..");
const INTEGRATIONS_SRC = join(ROOT_DIR, "packages/integrations/src/integrations");
const WEB_PUBLIC = join(ROOT_DIR, "packages/web/public/integrations");

async function copyDirectory(src: string, dest: string) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await cp(srcPath, destPath);
    }
  }
}

async function copyIntegrationAssets() {
  console.log("Copying integration assets...");

  try {
    // Ensure the destination directory exists
    await mkdir(WEB_PUBLIC, { recursive: true });

    // Read all integration directories
    const integrations = await readdir(INTEGRATIONS_SRC, { withFileTypes: true });

    let copiedCount = 0;

    // Copy each integration's assets folder
    for (const integration of integrations) {
      if (!integration.isDirectory()) continue;

      const integrationId = integration.name;
      const assetsSrc = join(INTEGRATIONS_SRC, integrationId, "assets");
      const assetsDest = join(WEB_PUBLIC, integrationId, "assets");

      // Check if assets directory exists
      try {
        const stats = await stat(assetsSrc);
        if (!stats.isDirectory()) {
          console.log(`  ⚠ Skipping ${integrationId} (no assets folder)`);
          continue;
        }
      } catch {
        console.log(`  ⚠ Skipping ${integrationId} (no assets folder)`);
        continue;
      }

      // Copy the assets directory
      await copyDirectory(assetsSrc, assetsDest);

      // Count files copied
      const countFiles = async (dir: string): Promise<number> => {
        let count = 0;
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const path = join(dir, entry.name);
          if (entry.isDirectory()) {
            count += await countFiles(path);
          } else {
            count++;
          }
        }
        return count;
      };

      const fileCount = await countFiles(assetsDest);
      copiedCount += fileCount;
      console.log(`  ✓ Copied ${integrationId} (${fileCount} file(s))`);
    }

    console.log(`\n✅ Successfully copied ${copiedCount} asset file(s) to ${WEB_PUBLIC}`);
  } catch (error) {
    console.error("❌ Error copying integration assets:", error);
    process.exit(1);
  }
}

copyIntegrationAssets();

