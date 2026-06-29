import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const version = "0.1.0";
const releaseRoot = resolve("release", `modelgate-v${version}`);
const artifactsDir = join(releaseRoot, "artifacts");
const desktopReleaseDir = resolve("desktop", "src-tauri", "target", "release");
const nsisDir = join(desktopReleaseDir, "bundle", "nsis");

function copyRequired(source, target) {
  if (!existsSync(source)) {
    throw new Error(`Required release input is missing: ${source}`);
  }

  cpSync(source, target, { recursive: true });
}

function copyOptional(source, target) {
  if (existsSync(source)) {
    cpSync(source, target, { recursive: true });
  }
}

function copyDesktopArtifacts() {
  const desktopExe = join(desktopReleaseDir, "modelgate-desktop.exe");
  copyRequired(desktopExe, join(artifactsDir, "modelgate-desktop.exe"));

  if (!existsSync(nsisDir)) {
    throw new Error(`NSIS bundle directory is missing: ${nsisDir}`);
  }

  const installers = readdirSync(nsisDir)
    .filter((name) => name.toLowerCase().endsWith(".exe"))
    .map((name) => join(nsisDir, name));

  if (installers.length === 0) {
    throw new Error(`No NSIS installer found in ${nsisDir}`);
  }

  for (const installer of installers) {
    cpSync(installer, join(artifactsDir, basename(installer)));
  }

  return {
    desktopExe,
    installers
  };
}

rmSync(releaseRoot, { recursive: true, force: true });
mkdirSync(artifactsDir, { recursive: true });

copyRequired(resolve("dist"), join(releaseRoot, "dist"));
copyRequired(resolve("examples"), join(releaseRoot, "examples"));
copyRequired(resolve("package.json"), join(releaseRoot, "package.json"));
copyRequired(resolve("package-lock.json"), join(releaseRoot, "package-lock.json"));
copyRequired(resolve("README.md"), join(releaseRoot, "README.md"));
copyRequired(resolve("RELEASE_NOTES.md"), join(releaseRoot, "RELEASE_NOTES.md"));
copyOptional(resolve("LICENSE"), join(releaseRoot, "LICENSE"));

const artifacts = copyDesktopArtifacts();

console.log(`Prepared ModelGate v${version} release at ${releaseRoot}`);
console.log("Included server files:");
console.log("  dist/");
console.log("  examples/");
console.log("  package.json");
console.log("  package-lock.json");
console.log("  README.md");
console.log("  RELEASE_NOTES.md");
console.log("Included desktop artifacts:");
console.log(`  ${join("artifacts", basename(artifacts.desktopExe))}`);
for (const installer of artifacts.installers) {
  console.log(`  ${join("artifacts", basename(installer))}`);
}
