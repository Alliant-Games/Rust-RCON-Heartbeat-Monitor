# Rust RCON Heartbeat Monitor

A TCP-based heartbeat monitor for Rust game servers using RCON protocol. This monitor is designed to be more firewall-friendly than UDP-based game query approaches.

## Why TCP/RCON Instead of UDP?

Traditional game server monitors use UDP-based query protocols, which can be problematic with modern firewall configurations:

- **UDP is connectionless** and commonly rate-limited or dropped by anti-DDoS filters
- **Firewall scrubbing** can cause sporadic UDP packet loss
- **No whitelisting** options may leave UDP queries vulnerable to filtering

This RCON-based monitor uses **TCP connections** which are generally more firewall-friendly and reliable for monitoring purposes.

## Features

- **TCP-based RCON protocol** for reliable server connectivity checks
- **Automatic retry logic** with configurable attempts per cycle
- **Jitter between retries** to avoid triggering anti-DDoS patterns
- **Consecutive failure threshold** to prevent false-positive "down" alerts
- **Configurable timeouts** to accommodate network latency
- **Detailed error logging** with error codes and types for debugging
- **Secure credential handling** via environment variables

## Requirements

- Node.js (v12 or higher)
- RCON enabled on your Rust server
- RCON port accessible from where this monitor runs
- An uptime monitoring endpoint (e.g., UptimeRobot, Healthchecks.io)

## Installation

1. Clone this repository:
```bash
git clone https://github.com/Alliant-Games/Rust-RCON-Heartbeat-Monitor.git
cd Rust-RCON-Heartbeat-Monitor
```

2. Install dependencies:
```bash
npm install
```

3. Create your `.env` file:
```bash
cp .env.example .env
```

4. Edit `.env` with your server details:
```bash
nano .env
```

## Configuration

### Required Variables

- `RCON_HOST` - IP address of your Rust server
- `RCON_PORT` - RCON port (typically 28016)
- `RCON_PASSWORD` - Your RCON password
- `UPTIME_ENDPOINT` - URL to receive heartbeat POST requests

### Optional Variables (with defaults)

- `CHECK_INTERVAL=60` - Seconds between monitoring cycles
- `TIMEOUT_MS=5000` - Milliseconds to wait for RCON connection/response
- `ATTEMPTS_PER_CYCLE=3` - Number of retry attempts per cycle
- `JITTER_MS=300` - Maximum random delay (ms) between retry attempts
- `CONSECUTIVE_FAILURES_THRESHOLD=2` - Failed cycles before marking as "down"
- `RCON_COMMAND=status` - RCON command to execute for health check

## Usage

Start the monitor:
```bash
npm start
```

Or run directly:
```bash
node index.js
```

## How It Works

1. **Connection Attempt**: Connects to the Rust server via RCON over TCP
2. **Authentication**: Authenticates using the provided RCON password
3. **Health Check**: Sends a status command to verify the server is responsive
4. **Retry Logic**: If connection fails, retries up to `ATTEMPTS_PER_CYCLE` times with jitter
5. **Failure Tracking**: Tracks consecutive failures; only marks "down" after threshold is reached
6. **Heartbeat**: On success, sends HTTP POST to your uptime endpoint
7. **Loop**: Waits for `CHECK_INTERVAL` seconds and repeats

## Log Output

The monitor provides clear, structured logging:

- `[INIT]` - Startup information and configuration
- `[CONFIG]` - Configuration values being used
- `[UP]` - Successful RCON connection with server response preview
- `[HEARTBEAT]` - Successful heartbeat sent to uptime endpoint
- `[ATTEMPT X/Y]` - Individual retry attempt with error details
- `[WARN]` - Failed cycle but below consecutive failure threshold
- `[DOWN]` - Server marked as down after exceeding failure threshold

## Example Output

```
[INIT] Starting Rust RCON Heartbeat Monitor
[CONFIG] Host: 192.168.1.100:28016
[CONFIG] Check Interval: 60s
[CONFIG] Attempts per cycle: 3
[CONFIG] Timeout: 5000ms
[CONFIG] Consecutive failures threshold: 2

[UP] RCON connected successfully | Response: hostname: "My Rust Server"
players : 12 (50 max)
build   : 2345...
[HEARTBEAT] Sent to https://uptime.example.com/heartbeat

[ATTEMPT 1/3] Connection failed: {"message":"ETIMEDOUT","code":"ETIMEDOUT","name":"Error"}
[ATTEMPT 2/3] Connection failed: {"message":"ETIMEDOUT","code":"ETIMEDOUT","name":"Error"}
[ATTEMPT 3/3] Connection failed: {"message":"ETIMEDOUT","code":"ETIMEDOUT","name":"Error"}
[WARN] Failed cycle but below threshold (1/2)

[DOWN] Server unreachable after 3 attempts (2 consecutive failures)
```

## Security Best Practices

1. **Never commit your `.env` file** - It contains sensitive credentials
2. **Use a strong RCON password** - Treat it like any other password
3. **Restrict RCON port access** - Use firewall rules to limit access if possible
4. **Monitor your logs** - Watch for authentication failures that might indicate attacks
5. **Keep dependencies updated** - Run `npm audit` periodically

## Troubleshooting

### Connection Refused
- Verify RCON is enabled in your server configuration
- Check that the RCON port is correct (typically 28016)
- Ensure firewall allows TCP connections to the RCON port

### Authentication Failed
- Double-check your RCON password in `.env`
- Verify the password matches your server's RCON configuration

### Timeout Errors
- Increase `TIMEOUT_MS` if your server/network has high latency
- Check network connectivity between monitor and server
- Verify the server is actually running

### False "Down" Alerts
- Increase `CONSECUTIVE_FAILURES_THRESHOLD` to require more failed cycles
- Increase `ATTEMPTS_PER_CYCLE` for more retries per cycle
- Increase `TIMEOUT_MS` to allow more time for responses

## Comparison with UDP-Based Monitoring

| Feature | UDP (gamedig) | TCP (RCON) |
|---------|---------------|------------|
| Protocol | UDP | TCP |
| Firewall Friendly | ❌ Often filtered | ✅ More reliable |
| Connection State | Connectionless | Stateful |
| Authentication | None | Password required |
| Retry Reliability | Limited | Built-in TCP retries |
| Port | Game query port | RCON port (28016) |

## Running as a Service

### systemd (Linux)

Create `/etc/systemd/system/rust-rcon-monitor.service`:

```ini
[Unit]
Description=Rust RCON Heartbeat Monitor
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/Rust-RCON-Heartbeat-Monitor
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable rust-rcon-monitor
sudo systemctl start rust-rcon-monitor
sudo systemctl status rust-rcon-monitor
```

## License

ISC

## Support

For issues or questions, please open an issue on GitHub.
