#!/usr/bin/env node
import {
  getAliases,
  getStatus,
  reloadConfig,
  switchAlias
} from "./cli/client.js";

function printUsage() {
  console.log("Usage: modelgate <status|aliases|switch <alias>|reload>");
}

async function run() {
  const [command, value] = process.argv.slice(2);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  if (command === "status") {
    const status = await getStatus();
    console.log(`${status.name} is running`);
    console.log(`Active alias: ${status.active}`);

    const entrypoints = Object.entries(status.entrypoints);
    if (entrypoints.length > 0) {
      console.log("");
      console.log("Entrypoints:");
      for (const [name, entrypoint] of entrypoints) {
        console.log(`  ${name} -> ${entrypoint.use} -> ${entrypoint.resolved}`);
      }
    }
    return;
  }

  if (command === "aliases") {
    const result = await getAliases();
    for (const alias of result.aliases) {
      const marker = alias.name === result.active ? "*" : " ";
      console.log(`${marker} ${alias.name.padEnd(16)} ${alias.provider.padEnd(12)} ${alias.model}`);
    }
    return;
  }

  if (command === "switch") {
    if (!value) {
      throw new Error("Missing alias name. Usage: modelgate switch <alias>");
    }

    const result = await switchAlias(value);
    console.log(`Switched active alias to ${result.active}`);
    return;
  }

  if (command === "reload") {
    const result = await reloadConfig();
    console.log("Configuration reloaded");
    console.log(`Active alias: ${result.active}`);
    return;
  }

  throw new Error(`Unknown command "${command}"`);
}

try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
