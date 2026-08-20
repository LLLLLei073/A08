// PM2 进程配置 - 数智党校学习系统
// 启动：pm2 start ecosystem.config.cjs
// 自启：pm2 save && pm2 startup
module.exports = {
  apps: [
    {
      name: 'party-school-api',
      cwd: './packages/server',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '512M',
      kill_timeout: 5000,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
