const { spawn } = require("node:child_process");

const port = process.env.PORT || "3000";
const command = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(command, ["next", "start", "-p", port], {
  cwd: __dirname,
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
