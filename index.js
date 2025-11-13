require('dotenv').config();
const { Rcon } = require('rcon-client');
const axios = require('axios');

const {
  RCON_HOST,
  RCON_PORT,
  RCON_PASSWORD,
  UPTIME_ENDPOINT,
  CHECK_INTERVAL = 60,
  TIMEOUT_MS = 5000,
  ATTEMPTS_PER_CYCLE = 3,
  JITTER_MS = 300,
  CONSECUTIVE_FAILURES_THRESHOLD = 2,
  RCON_COMMAND = 'status'
} = process.env;

let consecutiveFailures = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkServerWithRetry() {
  for (let attempt = 1; attempt <= parseInt(ATTEMPTS_PER_CYCLE, 10); attempt++) {
    try {
      const rcon = await Rcon.connect({
        host: RCON_HOST,
        port: parseInt(RCON_PORT, 10),
        password: RCON_PASSWORD,
        timeout: parseInt(TIMEOUT_MS, 10)
      });

      try {
        const response = await rcon.send(RCON_COMMAND);
        console.log(`[UP] RCON connected successfully | Response: ${response.substring(0, 100)}...`);
        
        await rcon.end();
        
        consecutiveFailures = 0;
        
        await axios.post(UPTIME_ENDPOINT);
        console.log(`[HEARTBEAT] Sent to ${UPTIME_ENDPOINT}`);
        
        return true;
      } catch (cmdError) {
        await rcon.end();
        throw cmdError;
      }
    } catch (err) {
      const errorDetails = {
        message: err.message,
        code: err.code,
        name: err.name
      };
      
      console.error(`[ATTEMPT ${attempt}/${ATTEMPTS_PER_CYCLE}] Connection failed:`, JSON.stringify(errorDetails));
      
      if (attempt < parseInt(ATTEMPTS_PER_CYCLE, 10)) {
        const jitter = Math.random() * parseInt(JITTER_MS, 10);
        await sleep(jitter);
      }
    }
  }
  
  consecutiveFailures++;
  
  if (consecutiveFailures >= parseInt(CONSECUTIVE_FAILURES_THRESHOLD, 10)) {
    console.error(`[DOWN] Server unreachable after ${ATTEMPTS_PER_CYCLE} attempts (${consecutiveFailures} consecutive failures)`);
  } else {
    console.warn(`[WARN] Failed cycle but below threshold (${consecutiveFailures}/${CONSECUTIVE_FAILURES_THRESHOLD})`);
  }
  
  return false;
}

(async function loop() {
  console.log('[INIT] Starting Rust RCON Heartbeat Monitor');
  console.log(`[CONFIG] Host: ${RCON_HOST}:${RCON_PORT}`);
  console.log(`[CONFIG] Check Interval: ${CHECK_INTERVAL}s`);
  console.log(`[CONFIG] Attempts per cycle: ${ATTEMPTS_PER_CYCLE}`);
  console.log(`[CONFIG] Timeout: ${TIMEOUT_MS}ms`);
  console.log(`[CONFIG] Consecutive failures threshold: ${CONSECUTIVE_FAILURES_THRESHOLD}`);
  console.log('');
  
  while (true) {
    await checkServerWithRetry();
    await sleep(parseInt(CHECK_INTERVAL, 10) * 1000);
  }
})();
