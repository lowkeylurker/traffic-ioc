module.exports = {
  apps: [
    {
      name: 'traffic-ioc-be',
      script: './dist/server.js',
      watch: false,

      instances: 'max',
      exec_mode: 'cluster',

      watch: false,
      max_memory_restart: '1G',
      autorestart: false,

      env: {
        NODE_ENV: 'production',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      }
    },
  ],

  deploy: {
    production: {
      user: 'SSH_USERNAME',
      host: 'SSH_HOSTMACHINE',
      ref: 'origin/main',
      repo: 'GIT_REPOSITORY',
      path: 'DESTINATION_PATH',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
    },
  },
};
