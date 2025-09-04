// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "api-osint",
      script: "./src/index.js",
      exec_mode: "cluster",
      instances: "max",
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      node_args: [
        "--enable-source-maps",
        "--experimental-json-modules"
      ],

      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",

      ignore_watch: ["node_modules", ".git", ".vercel", "logs", "tmp", "session"],

      // ENV default
      env: {
        NODE_ENV: "development",
        PORT: "5000",
        CORS_ALLOW_ALL: "true",
        KPU_TIMEOUT_MS: "6000"
      },

      // ENV production
      env_production: {
        NODE_ENV: "production",
        PORT: "8080",
        CORS_ALLOW_ALL: "false",
        KPU_TIMEOUT_MS: "2500",
        KPU_TOKEN: "ISI_TOKEN_KPU_DI_SINI"
      }
    }
  ]
};
