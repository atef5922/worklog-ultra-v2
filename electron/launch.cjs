const { spawn } = require("node:child_process");
const electronPath = require("electron");
const path = require("node:path");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [path.join(__dirname, "main.cjs")], {
  cwd: path.join(__dirname, ".."),
  env,
  stdio: "inherit",
  windowsHide: false,
});

child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
