// Cloudflare KV outbox（Workers）。KV 自带 expirationTtl，无需手动 sweep。
//
// key 设计：
//   item:  `o:<inboxId>:<createdAt>:<id>`  （前缀 list，createdAt 在 key 里 → 天然有序）
//   reqId: `r:<requestId>`                  （去重标记）
//
// 注意：KV list 在同一 prefix 下按 key 字典序返回，createdAt 用定长零填充保证有序。

import { DEFAULT_TTL_MS } from './outboxStore.js';

const TTL_SEC = Math.floor(DEFAULT_TTL_MS / 1000);

function pad(ts) {
    return String(ts).padStart(15, '0');
}

export class KvOutboxStore {
    constructor(kv) {
        this.kv = kv;
        this.kind = 'kv';
    }

    async seenRequest(requestId) {
        const v = await this.kv.get(`r:${requestId}`);
        return v != null;
    }

    async markRequest(requestId) {
        await this.kv.put(`r:${requestId}`, '1', { expirationTtl: TTL_SEC });
    }

    async put(inboxId, item) {
        const key = `o:${inboxId}:${pad(item.createdAt)}:${item.id}`;
        await this.kv.put(key, JSON.stringify(item), { expirationTtl: TTL_SEC });
        await this.markRequest(item.requestId);
    }

    async list(inboxId, sinceTs = 0) {
        const out = [];
        let cursor;
        do {
            const res = await this.kv.list({ prefix: `o:${inboxId}:`, cursor });
            for (const k of res.keys) {
                const raw = await this.kv.get(k.name);
                if (!raw) continue;
                const item = JSON.parse(raw);
                if (item.createdAt > sinceTs) out.push(item);
            }
            cursor = res.list_complete ? null : res.cursor;
        } while (cursor);
        out.sort((a, b) => a.createdAt - b.createdAt);
        return out;
    }

    async ack(inboxId, ids = []) {
        // 没在 key 里直接存 id→key 映射，故用 list 找匹配再删（量小，可接受）
        let n = 0;
        const idSet = new Set(ids);
        let cursor;
        do {
            const res = await this.kv.list({ prefix: `o:${inboxId}:`, cursor });
            for (const k of res.keys) {
                const id = k.name.split(':').pop();
                if (idSet.has(id)) {
                    await this.kv.delete(k.name);
                    n++;
                }
            }
            cursor = res.list_complete ? null : res.cursor;
        } while (cursor);
        return n;
    }

    sweep() { /* KV TTL 自动清理，无需手动 */ }
}
