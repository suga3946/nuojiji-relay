// 服务端 AI 调用 —— 复刻 APP 本地路径的非流式行为（含主→副 fallback、429 退避）。
// 永远 stream:false（中继不需要流式，结果整条进 outbox）。

import { getApiConfig } from './apiConfigs.js';
import { buildChatEndpoint, buildApiHeaders, buildChatRequestBody, assertSafeApiUrl } from './requestBuilder.js';

const REQUEST_TIMEOUT_MS = 180_000;

async function callOnce({ apiUrl, apiKey, model, apiType, messages, temperature, reasoningEffort, maxTokens }) {
    assertSafeApiUrl(apiUrl);
    const endpoint = buildChatEndpoint(apiUrl);
    const headers = buildApiHeaders(apiUrl, apiKey);
    const body = buildChatRequestBody({
        apiUrl, model, messages, temperature, reasoningEffort, stream: false, maxTokens,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res;
    try {
        res = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timer);
    }

    const rawText = await res.text();
    if (!res.ok) {
        const err = new Error(`AI HTTP ${res.status}: ${rawText.slice(0, 500)}`);
        err.status = res.status;
        throw err;
    }

    let data;
    try {
        data = JSON.parse(rawText);
    } catch {
        // 某些自定义端点直接返回纯文本
        data = rawText;
    }

    const config = getApiConfig(apiType);
    const content = config.extractContent(data);
    if (content == null || content === '') {
        const err = new Error('AI returned empty content');
        err.status = res.status;
        err.detail = typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300);
        throw err;
    }
    return content;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 跑一次完整生成：主 API（带 429 退避重试）→ 失败且开了副 API fallback → 副 API。
 * @returns {Promise<string>} 原始模型文本（含 tag，手机端解析）
 */
export async function runGeneration(settings, messages, maxTokens) {
    const {
        mainApiUrl, mainApiKey, mainApiModel, apiType = 'openai',
        temperature, reasoningEffort,
        autoRetryEnabled = true, maxRetries = 1, secondaryFallbackEnabled = true,
        secondaryApiUrl, secondaryApiKey, secondaryApiModel,
    } = settings || {};

    if (!mainApiUrl || !mainApiKey) throw new Error('settings.mainApiUrl / mainApiKey missing');

    const retries = autoRetryEnabled ? Math.max(0, Math.min(3, Number(maxRetries) || 0)) : 0;

    let lastErr = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        if (attempt > 0) await sleep(Math.min(1000 * 2 ** (attempt - 1), 30_000));
        try {
            return await callOnce({
                apiUrl: mainApiUrl, apiKey: mainApiKey, model: mainApiModel, apiType,
                messages, temperature, reasoningEffort, maxTokens,
            });
        } catch (e) {
            lastErr = e;
            // 只对 429 退避重试，其余错误立即跳出（避免重复扣费）
            if (e.status !== 429) break;
        }
    }

    // 主 API 失败 → 副 API fallback
    if (secondaryFallbackEnabled && secondaryApiUrl && secondaryApiKey) {
        try {
            return await callOnce({
                apiUrl: secondaryApiUrl, apiKey: secondaryApiKey, model: secondaryApiModel || mainApiModel, apiType,
                messages, temperature, reasoningEffort, maxTokens,
            });
        } catch (e) {
            lastErr = e;
        }
    }

    throw lastErr || new Error('AI generation failed');
}
