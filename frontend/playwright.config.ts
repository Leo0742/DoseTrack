import { defineConfig, devices } from "@playwright/test";

const backendEnv = [
  "DATABASE_URL=sqlite:////tmp/dosetrack-e2e.db",
  "UPLOAD_DIR=/tmp/dosetrack-e2e-uploads",
  "THUMBNAIL_DIR=/tmp/dosetrack-e2e-thumbs",
  "SECURE_COOKIES=false",
  "FRONTEND_URL=http://127.0.0.1:3011"
].join(" ");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3011",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: [
    {
      command: `cd ../backend && ${backendEnv} .venv/bin/python tests/e2e_seed.py && ${backendEnv} .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8011`,
      url: "http://127.0.0.1:8011/health",
      reuseExistingServer: false,
      timeout: 30_000
    },
    {
      command: "BACKEND_INTERNAL_URL=http://127.0.0.1:8011 npm run dev -- --hostname 127.0.0.1 --port 3011",
      url: "http://127.0.0.1:3011/login",
      reuseExistingServer: false,
      timeout: 30_000
    }
  ]
});
