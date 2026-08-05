const path = require("node:path");
const { pathToFileURL } = require("node:url");
const childProcess = require("node:child_process");
const { syncBuiltinESMExports } = require("node:module");

const originalSpawn = childProcess.spawn;
childProcess.spawn = function spawnWithEmbeddedNode(command, args, options) {
  return originalSpawn(command === "node" ? process.execPath : command, args, options);
};
syncBuiltinESMExports();

const cli = path.join(process.resourcesPath, "app.asar", "node_modules", "omniroute", "bin", "omniroute.mjs");
import(pathToFileURL(cli).href).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
