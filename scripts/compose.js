#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");

function canRun(command, args) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  return result.status === 0;
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    // eslint-disable-next-line no-console
    console.error(result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

const passthroughArgs = process.argv.slice(2);

if (canRun("docker", ["compose", "version"])) {
  run("docker", ["compose", ...passthroughArgs]);
}

if (canRun("docker-compose", ["version"])) {
  run("docker-compose", passthroughArgs);
}

// eslint-disable-next-line no-console
console.error(
  "Docker Compose not found. Install either the Docker Compose plugin (`docker compose`) or docker-compose (`docker-compose`)."
);
process.exit(1);

