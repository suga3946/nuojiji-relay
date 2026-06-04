// id / 幂等辅助。

// 服务端生成的 message id —— 与 requestId 关联，手机端用它做幂等 putMessage + 替换占位。
export function makeMessageId(requestId) {
    return `relay_${requestId}`;
}

export function nowMs() {
    return Date.now();
}
