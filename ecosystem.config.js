/**
 * PM2 config для деплоя на VPS.
 * Запуск из корня проекта: pm2 start ecosystem.config.js
 */
module.exports = {
  apps: [
    {
      name: 'cryptosignal',
      script: 'backend/dist/index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
