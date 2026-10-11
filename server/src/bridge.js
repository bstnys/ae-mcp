// Client for the Claude Bridge panel running inside After Effects.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function defaultConfigPath() {
  const base = process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support', 'ae-mcp')
    : path.join(os.homedir(), '.ae-mcp');
  return path.join(base, 'bridge.json');
}

const NOT_RUNNING =
  'After Effects bridge is not reachable. Open After Effects and make sure ' +
  'Window > Extensions > Claude Bridge is running.';

export class BridgeError extends Error {}

export class Bridge {
  constructor({ configPath = process.env.AE_MCP_CONFIG || defaultConfigPath(), timeoutMs = 130000 } = {}) {
    this.configPath = configPath;
    this.timeoutMs = timeoutMs;
  }

  // Re-read on every call: the panel picks a new token each time AE starts.
  readConfig() {
    if (process.env.AE_MCP_PORT && process.env.AE_MCP_TOKEN) {
      return { port: Number(process.env.AE_MCP_PORT), token: process.env.AE_MCP_TOKEN };
    }
    try {
      return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
    } catch {
      throw new BridgeError(NOT_RUNNING);
    }
  }

  async call(method, params = {}) {
    const { port, token } = this.readConfig();
    let res;
    try {
      res = await fetch(`http://127.0.0.1:${port}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ method, params }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      if (err.name === 'TimeoutError') throw new BridgeError('After Effects did not respond in time.');
      throw new BridgeError(NOT_RUNNING);
    }
    if (res.status === 401) throw new BridgeError('Bridge rejected the token. Restart the Claude Bridge panel.');
    const reply = await res.json();
    if (!reply.ok) throw new BridgeError(reply.error || 'Unknown After Effects error');
    return reply.result;
  }
}
