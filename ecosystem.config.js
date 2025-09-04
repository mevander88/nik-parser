// ecosystem.config.js
// PM2 config for running the OSINT/NIK Parser API on a VPS (not used on Vercel).
// - Uses Node.js cluster mode
// - Works with ESM (`type: "module"`) by running src/server.js
// - Separate env for development/production
// - Safe watch/ignore lists

module.exports = {
  apps: [
    {
      name: "api-osint",
      script: "src/server.js",         // <-- server entry (app.listen)
      exec_mode: "cluster",            // "fork" | "cluster"
      instances: "max",                // or a number, e.g. 2
      autorestart: true,
      watch: false,                    // set true only if you need watch in dev
      max_memory_restart: "300M",

      // Optional: enable if you want to see original TS/ESM stacktraces
      node_args: ["--enable-source-maps"],

      // Graceful shutdown
      kill_timeout: 5000,
      shutdown_with_message: false,

      // Log files (pm2 will rotate if logrotate module is used)
      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",

      // If watch=true, exclude noisy paths
      ignore_watch: [
        "node_modules",
        ".git",
        ".vercel",
        "logs",
        "tmp",
        "session"
      ],

      env: {
        NODE_ENV: "development",
        PORT: "5000",
        CORS_ALLOW_ALL: "true",
        // KPU_TOKEN: "isi_token_kamu_di_sini" // set via `pm2 setpm2` or env file
      },

      env_production: {
        NODE_ENV: "production",
        PORT: "8080",
        CORS_ALLOW_ALL: "false",
        KPU_TOKEN: "isi_token_kamu_di_sini"
      }
    }
  ]
};

// --- Quick commands ---
// pm2 start ecosystem.config.js --env production
// pm2 logs api-osint
// pm2 restart api-osint
// pm2 stop api-osint
// pm2 save && pm2 startup
