import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const serverRoot = resolve("desktop", "src-tauri", "resources", "modelgate-server");

function copyRequired(source, target) {
  if (!existsSync(source)) {
    throw new Error(`Required desktop server input is missing: ${source}`);
  }

  cpSync(source, target, { recursive: true });
}

function copyOptional(source, target) {
  if (existsSync(source)) {
    cpSync(source, target, { recursive: true });
  }
}

rmSync(serverRoot, { recursive: true, force: true });
mkdirSync(serverRoot, { recursive: true });

copyRequired(resolve("dist"), join(serverRoot, "dist"));
copyRequired(resolve("dist-server", "modelgate-server.cjs"), join(serverRoot, "modelgate-server.cjs"));
copyRequired(resolve("examples"), join(serverRoot, "examples"));
copyRequired(resolve("package.json"), join(serverRoot, "package.json"));
copyRequired(resolve("package-lock.json"), join(serverRoot, "package-lock.json"));
copyRequired(resolve("README.md"), join(serverRoot, "README.md"));
copyRequired(resolve("RELEASE_NOTES.md"), join(serverRoot, "RELEASE_NOTES.md"));
copyOptional(resolve("LICENSE"), join(serverRoot, "LICENSE"));

console.log(`Prepared desktop server runtime at ${serverRoot}`);
