#!/usr/bin/env node
/*
 * record-replay — stdio MCP server entry.
 * Run with `node` (Node 22+ strips TS types for the bundled src if run via a
 * tsx loader, but this bin loads compiled JS if present, else src via tsx).
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, existsSync } from "node:path";
import { existsSync as fsExists } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const here = (p) => join(__dirname, p);

// Prefer compiled JS if shipped; otherwise run from source via tsx.
const compiled = here("../dist/server.js");
const src = here("../src/server.ts");

const target = fsExists(compiled) ? compiled : src;
const args = fsExists(compiled) ? [target] : ["--import", "tsx", target];
spawn(process.execPath, args, { stdio: "inherit" }).on("exit", (c) => process.exit(c ?? 0));
