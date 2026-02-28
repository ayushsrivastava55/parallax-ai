module.exports = {
  apps: [
    {
      name: 'flash-gateway',
      cwd: './flash-agent',
      script: 'npx',
      args: 'tsx src/server.ts',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      max_memory_restart: '512M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/flash-gateway-error.log',
      out_file: './logs/flash-gateway-out.log',
      merge_logs: true,
    },
  ],
};
