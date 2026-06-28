#!/usr/bin/env node
import {
  clearLogs,
  getAliases,
  getLogs,
  getStats,
  getStatus,
  reloadConfig,
  switchAlias
} from "./cli/client.js";

function printUsage() {
  console.log("Usage: modelgate <status|aliases|switch <alias>|reload|logs [--limit N|--clear]|stats>");
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toISOString().replace("T", " ").slice(0, 19);
}

function argValue(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function run() {
  const args = process.argv.slice(2);
  const [command, value] = args;

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

  if (command === "logs") {
    if (args.includes("--clear")) {
      await clearLogs();
      console.log("Request logs cleared");
      return;
    }

    const limit = Number.parseInt(argValue(args, "--limit") ?? "50", 10);
    const result = await getLogs(Number.isFinite(limit) ? limit : 50);

    console.log("Time                  OK   Stream  Alias             Provider     Upstream Model       Duration");
    for (const entry of result.logs) {
      const error = entry.ok ? "" : `  ${entry.error_type ?? "error"} ${entry.status_code ?? ""}`.trimEnd();
      console.log(
        `${formatTime(entry.started_at).padEnd(21)} ` +
        `${(entry.ok ? "yes" : "no").padEnd(4)} ` +
        `${String(entry.stream).padEnd(7)} ` +
        `${(entry.resolved_alias ?? "-").padEnd(17)} ` +
        `${(entry.provider ?? "-").padEnd(12)} ` +
        `${(entry.upstream_model ?? "-").padEnd(20)} ` +
        `${(`${entry.duration_ms ?? 0}ms`).padEnd(9)}${error ? ` ${error}` : ""}`
      );
    }
    return;
  }

  if (command === "stats") {
    const stats = await getStats();
    console.log(`Total requests: ${stats.total}`);
    console.log(`Success: ${stats.success}`);
    console.log(`Failed: ${stats.failed}`);
    console.log(`Stream: ${stats.stream}`);
    console.log(`Non-stream: ${stats.non_stream}`);
    console.log(`Average duration: ${stats.avg_duration_ms}ms`);

    const providers = Object.entries(stats.by_provider);
    if (providers.length > 0) {
      console.log("");
      console.log("By provider:");
      for (const [provider, count] of providers) {
        console.log(`  ${provider}: ${count}`);
      }
    }
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
