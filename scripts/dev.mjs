import { spawn } from "node:child_process";

const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const services = [
  {
    name: "API",
    args: ["--filter", "@workspace/api-server", "run", "dev"],
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: process.env.API_PORT ?? "5000",
    },
  },
  {
    name: "Web",
    args: ["--filter", "@workspace/last-exit", "run", "dev"],
    env: {
      ...process.env,
      PORT: process.env.WEB_PORT ?? "5173",
      BASE_PATH: "/",
    },
  },
];

const children = services.map(({ name, args, env }) => {
  const child = spawn(packageManager, args, { env, stdio: "inherit" });
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`${name} exited with code ${code}.`);
      shutdown(code);
    }
  });
  return child;
});

let isShuttingDown = false;
function shutdown(exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(exitCode), 250);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));