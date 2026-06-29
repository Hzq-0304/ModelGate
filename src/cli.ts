#!/usr/bin/env node
import {
  type DiagnosticResult,
  clearLogs,
  getAliases,
  getCcSwitchLink,
  getLogs,
  getProviderPresets,
  getStats,
  getStatus,
  reloadConfig,
  switchAlias,
  testActive,
  testAlias,
  testProvider
} from "./cli/client.js";

function printUsage() {
  console.log("Usage: modelgate <status|aliases|switch <alias>|reload|logs [--limit N|--clear]|stats|presets|ccswitch-link [--app codex]|test active [--responses]|test alias <alias> [--stream] [--responses]|test provider <provider> --model <model> [--stream] [--responses]>");
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

function printDiagnosticResult(result: DiagnosticResult) {
  if (result.target === "provider") {
    console.log(`Testing provider: ${result.provider ?? "-"}`);
  } else if (result.target === "active") {
    console.log(`Testing active alias: ${result.alias ?? "-"}`);
  } else {
    console.log(`Testing alias: ${result.alias ?? "-"}`);
  }

  console.log(`Provider: ${result.provider ?? "-"}`);
  console.log(`Upstream model: ${result.model ?? "-"}`);
  console.log(`API: ${result.api_type ?? "chat_completions"}`);
  console.log(`Fallback: ${result.fallback_mode ?? "-"}`);
  console.log(`Stream: ${result.stream}`);
  if (result.status_code) {
    console.log(`HTTP status: ${result.status_code}`);
  }
  console.log("");

  for (const check of result.checks) {
    const status = check.ok ? "OK" : "FAIL";
    console.log(`[${status}] ${check.name}${check.message ? `: ${check.message}` : ""}`);
  }

  console.log("");
  console.log(`Result: ${result.ok ? "passed" : "failed"}`);
  console.log(`Duration: ${result.duration_ms}ms`);
  if (result.error_message) {
    console.log(`Error: ${result.error_message}`);
  }
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

    console.log("Time                  Kind        API        Fallback           OK   Stream  Alias             Provider     Upstream Model       Duration");
    for (const entry of result.logs) {
      const error = entry.ok ? "" : `  ${entry.error_type ?? "error"} ${entry.status_code ?? ""}`.trimEnd();
      console.log(
        `${formatTime(entry.started_at).padEnd(21)} ` +
        `${(entry.kind ?? "normal").padEnd(11)} ` +
        `${(entry.api_type ?? "chat_completions").replace("_completions", "").padEnd(10)} ` +
        `${(entry.fallback_mode ?? "-").padEnd(18)} ` +
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

  if (command === "presets") {
    const result = await getProviderPresets();
    console.log("Provider             Base URL                                            Default Model");
    for (const preset of result.presets) {
      console.log(
        `${preset.provider_name.padEnd(20)} ` +
        `${preset.base_url.padEnd(51)} ` +
        `${preset.default_model}`
      );
    }
    return;
  }

  if (command === "ccswitch-link") {
    const app = argValue(args, "--app") ?? "codex";
    const result = await getCcSwitchLink(app);
    console.log(result.url);
    return;
  }

  if (command === "test") {
    const target = value;
    const stream = args.includes("--stream");
    const apiType = args.includes("--responses") ? "responses" : "chat_completions";

    if (target === "active") {
      printDiagnosticResult(await testActive(stream, apiType));
      return;
    }

    if (target === "alias") {
      const alias = args[2];
      if (!alias) {
        throw new Error("Missing alias name. Usage: modelgate test alias <alias> [--stream]");
      }

      printDiagnosticResult(await testAlias(alias, stream, apiType));
      return;
    }

    if (target === "provider") {
      const provider = args[2];
      if (!provider) {
        throw new Error("Missing provider name. Usage: modelgate test provider <provider> --model <model> [--stream]");
      }

      printDiagnosticResult(await testProvider(provider, argValue(args, "--model"), stream, apiType));
      return;
    }

    throw new Error("Unknown test target. Usage: modelgate test <active|alias|provider>");
  }

  throw new Error(`Unknown command "${command}"`);
}

try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
