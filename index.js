require('dotenv').config();
const { Rcon } = require('rcon-client');
const WebSocket = require('ws');
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
  RCON_COMMAND = 'status',
  RCON_TRANSPORT = 'web',
  RCON_SECURE = 'false'
} = process.env;

let consecutiveFailures = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkServerClassicRCON() {
  const rcon = await Rcon.connect({
    host: RCON_HOST,
    port: parseInt(RCON_PORT, 10),
    password: RCON_PASSWORD,
    timeout: parseInt(TIMEOUT_MS, 10)
  });

  try {
    const response = await rcon.send(RCON_COMMAND);
    console.log(`[UP] Classic RCON connected | Response: ${response.substring(0, 100)}...`);
    await rcon.end();
    return true;
  } catch (cmdError) {
    await rcon.end();
    throw cmdError;
  }
}

async function checkServerWebRCON() {
  return new Promise((resolve, reject) => {
    const protocol = RCON_SECURE === 'true' ? 'wss' : 'ws';
    const url = `${protocol}://${RCON_HOST}:${RCON_PORT}`;
    const timeout = parseInt(TIMEOUT_MS, 10);
    
    let ws;
    let timeoutId;
    let authSuccess = false;
    let commandId;
    
    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (ws) {
        ws.removeAllListeners();
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }
    };
    
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('WebRCON timeout'));
    }, timeout);
    
    try {
      ws = new WebSocket(url, {
        handshakeTimeout: timeout
      });
      
      ws.on('error', (err) => {
        cleanup();
        reject(err);
      });
      
      ws.on('open', () => {
        const authMessage = {
          Identifier: 1,
          Message: RCON_PASSWORD,
          Name: 'monitor',
          Type: 'auth'
        };
        ws.send(JSON.stringify(authMessage));
      });
      
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          
          if (!authSuccess && msg.Identifier === -1) {
            authSuccess = true;
            
            commandId = Date.now();
            const commandMessage = {
              Identifier: commandId,
              Message: RCON_COMMAND,
              Name: 'monitor',
              Type: 'command'
            };
            ws.send(JSON.stringify(commandMessage));
            return;
          }
          
          if (authSuccess && msg.Identifier === commandId) {
            const responsePreview = msg.Message ? msg.Message.substring(0, 100) : 'empty';
            console.log(`[UP] WebRCON connected | Response: ${responsePreview}...`);
            cleanup();
            resolve(true);
          }
        } catch (parseErr) {
          cleanup();
          reject(new Error(`WebRCON parse error: ${parseErr.message}`));
        }
      });
      
      ws.on('close', () => {
        if (!authSuccess) {
          cleanup();
          reject(new Error('WebRCON connection closed before auth'));
        }
      });
      
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}

async function checkServerWithRetry() {
  const transport = RCON_TRANSPORT.toLowerCase();
  
  for (let attempt = 1; attempt <= parseInt(ATTEMPTS_PER_CYCLE, 10); attempt++) {
    try {
      if (transport === 'classic') {
        await checkServerClassicRCON();
      } else if (transport === 'web') {
        await checkServerWebRCON();
      } else {
        throw new Error(`Unknown RCON_TRANSPORT: ${RCON_TRANSPORT}`);
      }
      
      consecutiveFailures = 0;
      
      await axios.post(UPTIME_ENDPOINT);
      console.log(`[HEARTBEAT] Sent to ${UPTIME_ENDPOINT}`);
      
      return true;
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
  console.log(`[CONFIG] Transport: ${RCON_TRANSPORT}`);
  console.log(`[CONFIG] Secure: ${RCON_SECURE}`);
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
