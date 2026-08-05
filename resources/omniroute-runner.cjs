const path = require("node:path");
const { pathToFileURL } = require("node:url");

const cli = path.join(process.resourcesPath, "app.asar", "node_modules", "omniroute", "bin", "omniroute.mjs");
import(pathToFileURL(cli).href).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
