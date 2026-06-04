// Web Push (VAPID) —— 复用 APP 现有 PWA 订阅流程（pushSubscriptionManager.js）。
// 仅 Node 路径用 web-push 库；Workers 路径见下方说明。
//
// 环境变量：VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (mailto:...)
//
// 推送只是「叫醒」信号，payload 极小（title/body/charId/userId/kind），
// 真正的消息由手机收到后 GET /outbox 拉取。丢推送可容忍。

let webpushLib = null;
let configured = false;

async function ensureWebpush(env) {
    if (configured) return webpushLib;
    const pub = env?.VAPID_PUBLIC_KEY || process.env?.VAPID_PUBLIC_KEY;
    const priv = env?.VAPID_PRIVATE_KEY || process.env?.VAPID_PRIVATE_KEY;
    const subject = env?.VAPID_SUBJECT || process.env?.VAPID_SUBJECT || 'mailto:relay@example.com';
    if (!pub || !priv) return null; // 没配 VAPID → 推送禁用，只靠轮询
    try {
        const mod = await import('web-push');
        webpushLib = mod.default || mod;
        webpushLib.setVapidDetails(subject, pub, priv);
        configured = true;
        return webpushLib;
    } catch (e) {
        console.warn('[push] web-push 库不可用（Workers 环境正常）:', e?.message);
        return null;
    }
}

export function getVapidPublicKey(env) {
    return env?.VAPID_PUBLIC_KEY || (typeof process !== 'undefined' ? process.env?.VAPID_PUBLIC_KEY : '') || '';
}

/**
 * 发送一条 web push。subscription 是浏览器 PushSubscription.toJSON()。
 * 返回 { ok, gone } —— gone:true 表示订阅已失效（410/404），调用方应删除它。
 */
export async function sendWebPush(env, subscription, payload) {
    const wp = await ensureWebpush(env);
    if (!wp) return { ok: false, gone: false, reason: 'webpush-unavailable' };
    try {
        await wp.sendNotification(subscription, JSON.stringify(payload), { TTL: 60 });
        return { ok: true, gone: false };
    } catch (e) {
        const code = e?.statusCode;
        return { ok: false, gone: code === 410 || code === 404, reason: e?.message };
    }
}
