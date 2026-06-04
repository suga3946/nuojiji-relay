// Cloudflare Workers 入口。
// 部署：wrangler deploy（需在 wrangler.toml 绑定 KV namespace "OUTBOX"，
//      并 `wrangler secret put RELAY_SECRET` / VAPID_* 等）。

import { createApp } from './src/app.js';

const app = createApp();

export default {
    fetch: app.fetch,
    // Phase 2：定时主动生成
    async scheduled(_event, _env, _ctx) {
        // TODO Phase 2: 读 register 的预注册上下文，跑 proactive 生成 → outbox + push
    },
};
