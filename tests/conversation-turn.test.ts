import { afterEach, expect, it, vi } from 'vitest';
import { Store } from '../src/server/store.js';
import { WorkspaceStore } from '../src/server/workspace.js';
import { Platform } from '../src/server/platform.js';
import { Runner } from '../src/server/runner.js';
import { createApp } from '../src/server/app.js';
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((fn) => fn()));
function fixture() {
  const store = new Store(':memory:');
  const ws = new WorkspaceStore(':memory:', 'owner');
  cleanup.push(() => {
    store.close();
    ws.close();
  });
  const config = { mode: 'live' as const, baseUrl: 'https://example.com' };
  const platform = new Platform(store, ws, {
    baseUrl: config.baseUrl,
    voiceName: 'marin',
    slackUsers: [],
    runtimeUrl: '',
  });
  vi.spyOn(platform, 'setup').mockReturnValue({
    ...platform.setup(),
    missing: [],
  });
  const turn = vi.spyOn(platform, 'turn').mockResolvedValue('51');
  return {
    ws,
    turn,
    app: createApp({
      store,
      runner: new Runner(store, config),
      config,
      platform,
    }),
  };
}
const post = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

it('runs one server-side turn on an owned conversation and returns its text', async () => {
  const { ws, turn, app } = fixture();
  const thread = ws.bindThread('thread-1', ws.dots()[0].id, 'Nano');
  const response = await app.request(
    `/api/conversations/${thread.id}/turn`,
    post({ prompt: 'What is 17 times 3?', timeoutSeconds: 30 }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ text: '51' });
  expect(turn).toHaveBeenCalledWith(
    thread.id,
    'What is 17 times 3?',
    expect.any(AbortSignal),
  );
});

it('rejects a malformed prompt and a conversation this workspace does not own', async () => {
  const { turn, app } = fixture();
  expect(
    (await app.request('/api/conversations/x/turn', post({ prompt: '' })))
      .status,
  ).toBe(400);
  expect(
    (await app.request('/api/conversations/x/turn', post({ prompt: 'hi' })))
      .status,
  ).toBe(403);
  expect(turn).not.toHaveBeenCalled();
});
