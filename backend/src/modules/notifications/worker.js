const env = require('../../config/env');
const service = require('./notifications.service');

let timer;
let running = false;

function start() {
  if (!env.email.worker.enabled || timer) return;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await service.tick();
    } catch (err) {
      console.error('Email worker error:', err.message);
    } finally {
      running = false;
    }
  };
  timer = setInterval(run, env.email.worker.intervalSeconds * 1000);
  timer.unref();
  run();
  console.log(`Email worker started (${env.email.driver}, every ${env.email.worker.intervalSeconds}s)`);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop };
