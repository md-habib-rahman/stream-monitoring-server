module.exports = {
  apps: [
    {
      name: "infra-poller",
      script: "./infrastructure/poller.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      time: true,
    },
  ],
};
