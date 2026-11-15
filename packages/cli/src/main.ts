#!/usr/bin/env bun
// The `lydie` command.
import { runCli } from "./cli.ts";

const code = await runCli(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(`${text}\n`),
  stderr: (text) => process.stderr.write(`${text}\n`),
  stdin: async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8");
  },
  env: process.env,
  cwd: process.cwd(),
});
process.exit(code);
