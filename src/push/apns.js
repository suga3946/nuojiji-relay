// APNs（iOS 套壳）—— Phase 2 实做。Phase 1 为 stub：iOS 套壳靠轮询兜底。
//
// 实做时需要：Apple Push 证书 / Token-based auth (.p8 key, keyId, teamId, bundleId)，
// 经 https://api.push.apple.com 发 background/alert 推送。iOS 端需 APNs entitlement
// + 注册 device token 上报到 /api/push/subscribe (channel:'apns')。

export async function sendApns(_env, _subscription, _payload) {
    return { ok: false, gone: false, reason: 'apns-not-implemented (Phase 2)' };
}
