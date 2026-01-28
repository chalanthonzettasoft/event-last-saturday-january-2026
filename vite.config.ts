import path from "path";
import { execSync } from "child_process";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  
  let commitHash = env.VITE_GIT_COMMIT_HASH || "unknown";
  if (commitHash === "unknown") {
    try {
      commitHash = execSync("git rev-parse --short HEAD").toString().trim();
    } catch (e) {
      console.warn("Could not get git commit hash", e);
    }
  }

  return {
    base: env.VITE_BASE_PATH || "/event-last-saturday-january-2026/",
    publicDir: "static",
    server: {
      port: 3000,
      host: "0.0.0.0",
    },
    plugins: [react()],
    define: {
      "process.env.API_KEY": JSON.stringify(env.GEMINI_API_KEY),
      "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY),
      "__COMMIT_HASH__": JSON.stringify(commitHash),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
  };
});
