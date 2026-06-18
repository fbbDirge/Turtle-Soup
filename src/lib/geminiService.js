/**
 * AI Service for Turtle Soup Game (OpenAI Compatible)
 * 
 * This module encapsulates the AI API integration for the AI Game Master.
 * Refactored to use OpenAI-compatible API endpoint.
 */

import { getSystemPrompt, buildGamePrompt, PUZZLE_GENERATOR_PROMPT, buildPuzzleGeneratorPrompt } from "./gamePrompt";

// Configuration
const ENV_AI_CONFIG = {
    apiKey: "",
    apiUrl: "/api/chat/completions",
    model: import.meta.env.VITE_GEMINI_MODEL || "gemini-3-flash-preview"
};
const AI_CONFIG_STORAGE_KEY = "turtle-soup.aiConfig";
const AI_CONFIG_SESSION_KEY = "turtle-soup.aiConfig.session";
const DEFAULT_AI_CHANNEL_ID = "default";

function normalizeChatCompletionsUrl(apiUrl) {
    const cleanUrl = String(apiUrl || "").trim().replace(/\/+$/, "");
    if (!cleanUrl) return ENV_AI_CONFIG.apiUrl;
    if (cleanUrl.startsWith("/")) return cleanUrl;
    if (cleanUrl.endsWith("/chat/completions")) return cleanUrl;
    return `${cleanUrl}/chat/completions`;
}

function normalizeModelName(model) {
    const cleanModel = String(model || "").trim();
    if (cleanModel === "mimo-v2-flash") return "mimo-v2.5";
    return cleanModel;
}

function isReasoningModelConfig(apiUrl, model) {
    const url = String(apiUrl || "").toLowerCase();
    const modelName = String(model || "").toLowerCase();
    return url.includes("minimaxi.com") || modelName.includes("minimax") || modelName.includes("mimo");
}

const createDefaultAIChannel = () => ({
    id: DEFAULT_AI_CHANNEL_ID,
    name: "默认渠道",
    ...ENV_AI_CONFIG
});

const createDefaultAIConfigState = () => ({
    activeChannelId: DEFAULT_AI_CHANNEL_ID,
    channels: [createDefaultAIChannel()]
});

const normalizeAIChannel = (channel, fallback = createDefaultAIChannel()) => {
    const id = String(channel?.id || fallback.id || DEFAULT_AI_CHANNEL_ID).trim() || DEFAULT_AI_CHANNEL_ID;
    return {
        id,
        name: String(channel?.name || fallback.name || "AI 渠道").trim() || "AI 渠道",
        apiKey: String(channel?.apiKey ?? fallback.apiKey ?? "").trim(),
        apiUrl: String(channel?.apiUrl || fallback.apiUrl || ENV_AI_CONFIG.apiUrl).trim() || ENV_AI_CONFIG.apiUrl,
        model: normalizeModelName(channel?.model || fallback.model || ENV_AI_CONFIG.model)
    };
};

const normalizeAIConfigState = (rawState) => {
    if (!rawState || typeof rawState !== "object") return createDefaultAIConfigState();

    // Backward compatibility: previous versions stored one flat config object.
    if (!Array.isArray(rawState.channels)) {
        const channel = normalizeAIChannel({
            id: DEFAULT_AI_CHANNEL_ID,
            name: rawState.name || "默认渠道",
            apiKey: rawState.apiKey,
            apiUrl: rawState.apiUrl,
            model: rawState.model
        });
        return {
            activeChannelId: channel.id,
            channels: [channel]
        };
    }

    const seen = new Set();
    const channels = rawState.channels
        .map((channel, index) => normalizeAIChannel(channel, {
            ...createDefaultAIChannel(),
            id: index === 0 ? DEFAULT_AI_CHANNEL_ID : `channel-${index + 1}`,
            name: `渠道 ${index + 1}`
        }))
        .filter((channel) => {
            if (seen.has(channel.id)) return false;
            seen.add(channel.id);
            return true;
        });

    if (channels.length === 0) channels.push(createDefaultAIChannel());

    const activeChannelId = channels.some((channel) => channel.id === rawState.activeChannelId)
        ? rawState.activeChannelId
        : channels[0].id;

    return {
        activeChannelId,
        channels
    };
};

const readStorageConfigState = (storage) => {
    try {
        if (typeof window === "undefined" || !storage) return null;
        const key = storage === window.sessionStorage ? AI_CONFIG_SESSION_KEY : AI_CONFIG_STORAGE_KEY;
        const raw = storage.getItem(key);
        return raw ? normalizeAIConfigState(JSON.parse(raw)) : null;
    } catch {
        return null;
    }
};

const mergeAIConfigStates = (...states) => {
    const channelMap = new Map();
    let activeChannelId = DEFAULT_AI_CHANNEL_ID;

    states
        .filter(Boolean)
        .map(normalizeAIConfigState)
        .forEach((state) => {
            activeChannelId = state.activeChannelId || activeChannelId;
            state.channels.forEach((channel) => {
                const previous = channelMap.get(channel.id) || {};
                channelMap.set(channel.id, normalizeAIChannel({
                    ...previous,
                    ...channel,
                    apiKey: channel.apiKey || previous.apiKey || ""
                }));
            });
        });

    const channels = Array.from(channelMap.values());
    if (channels.length === 0) channels.push(createDefaultAIChannel());
    if (!channels.some((channel) => channel.id === activeChannelId)) activeChannelId = channels[0].id;

    return {
        activeChannelId,
        channels
    };
};

export function getAIConfigState() {
    const defaults = createDefaultAIConfigState();
    const persisted = readStorageConfigState(typeof window !== "undefined" ? window.localStorage : null);
    const session = readStorageConfigState(typeof window !== "undefined" ? window.sessionStorage : null);
    return mergeAIConfigStates(defaults, persisted, session);
}

export function getAIConfig() {
    const state = getAIConfigState();
    return state.channels.find((channel) => channel.id === state.activeChannelId) || state.channels[0] || createDefaultAIChannel();
}

export function saveAIConfigState(configState, { persistKey = false } = {}) {
    if (typeof window === "undefined") return;

    const currentState = getAIConfigState();
    const currentChannelsById = new Map(currentState.channels.map((channel) => [channel.id, channel]));
    const nextState = normalizeAIConfigState(configState);

    const channelsWithKeys = nextState.channels.map((channel) => {
        const currentChannel = currentChannelsById.get(channel.id);
        return normalizeAIChannel({
            ...channel,
            apiKey: channel.apiKey || currentChannel?.apiKey || ""
        });
    });

    const localState = {
        activeChannelId: nextState.activeChannelId,
        channels: channelsWithKeys.map((channel) => {
            const localChannel = {
                id: channel.id,
                name: channel.name,
                apiUrl: channel.apiUrl,
                model: channel.model
            };
            if (persistKey && channel.apiKey) localChannel.apiKey = channel.apiKey;
            return localChannel;
        })
    };

    if (persistKey) {
        window.sessionStorage.removeItem(AI_CONFIG_SESSION_KEY);
    } else {
        window.sessionStorage.setItem(AI_CONFIG_SESSION_KEY, JSON.stringify({
            activeChannelId: nextState.activeChannelId,
            channels: channelsWithKeys
        }));
    }

    window.localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(localState));
}

export function saveAIConfig(config, { persistKey = false } = {}) {
    const state = getAIConfigState();
    const channels = state.channels.map((channel) => (
        channel.id === state.activeChannelId
            ? normalizeAIChannel({ ...channel, ...config })
            : channel
    ));
    saveAIConfigState({ ...state, channels }, { persistKey });
}

export function resetAIConfig() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(AI_CONFIG_STORAGE_KEY);
    window.sessionStorage.removeItem(AI_CONFIG_SESSION_KEY);
}

function extractJsonObject(text) {
    const clean = String(text || "")
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

    try {
        return JSON.parse(clean);
    } catch {
        // Continue with object extraction below.
    }

    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < clean.length; i += 1) {
        const char = clean[i];

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === "\\") {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
            continue;
        }

        if (char === "{") {
            if (depth === 0) start = i;
            depth += 1;
        } else if (char === "}") {
            depth -= 1;
            if (depth === 0 && start !== -1) {
                return JSON.parse(clean.slice(start, i + 1));
            }
        }
    }

    throw new Error("AI 返回格式不是合法 JSON，请重试或换一个模型。");
}

function parseAIJson(rawText, contextLabel) {
    try {
        return extractJsonObject(rawText);
    } catch (error) {
        const preview = String(rawText || "").slice(0, 300);
        console.error(`[AIService] Failed to parse ${contextLabel} JSON:`, preview);
        throw error;
    }
}

function normalizePuzzle(puzzle) {
    if (!puzzle || typeof puzzle !== "object") {
        throw new Error("AI 返回的谜题为空。");
    }

    const normalized = {
        title: puzzle.title,
        soup_surface: puzzle.soup_surface || puzzle.content || puzzle.surface,
        soup_base: puzzle.soup_base || puzzle.truth || puzzle.base,
        tags: puzzle.tags || {}
    };

    normalized.tags = {
        genre: normalized.tags.genre || "本格",
        has_death: Boolean(normalized.tags.has_death),
        difficulty: normalized.tags.difficulty || "中"
    };

    if (!normalized.title || !normalized.soup_surface || !normalized.soup_base) {
        throw new Error("AI 返回的谜题缺少标题、汤面或汤底，请重试。");
    }

    return normalized;
}

/**
 * Calls the AI API (OpenAI Compatible)
 */
async function callOpenAICompatibleAPI(messages, responseFormat = null, temperature = 0.7) {
    const { apiKey, apiUrl, model } = getAIConfig();
    const usesLocalProxy = !apiKey;

    // 推理模型（如 MiniMax-M3）会先输出大量思维链，再给最终答案。
    // 若 max_tokens 太小，思考过程会把额度耗尽，导致最终 content 为空 / 被截断。
    const isReasoningModel = isReasoningModelConfig(apiUrl, model);

    const payload = {
        model,
        messages: messages,
        temperature: temperature,
        max_tokens: isReasoningModel ? 32768 : 4096,
        stream: false
    };

    if (isReasoningModel) {
        // 让思维链单独放进 reasoning_content，保持 content 是干净 JSON
        payload.reasoning_split = true;
    }

    if (responseFormat) {
        payload.response_format = responseFormat;
    }

    // 浏览器 fetch 默认没有超时，遇到服务端慢响应/卡住会无限 pending（UI 一直"请求中"）。
    // 用 AbortController 加超时：推理模型慢，给 90s；普通快模型 30s。
    const timeoutMs = isReasoningModel ? 90000 : 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const requestUrl = usesLocalProxy ? "/api/chat/completions" : normalizeChatCompletionsUrl(apiUrl);
        const headers = {
            "Content-Type": "application/json"
        };
        if (apiKey) {
            headers.Authorization = `Bearer ${apiKey}`;
        }

        const response = await fetch(requestUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`API Error ${response.status}: ${errorData.error?.message || errorData.message || response.statusText}`);
        }

        const data = await response.json();
        const choice = data.choices?.[0];
        const content = choice?.message?.content;

        // 推理模型把额度耗在思维链上时，会出现 content 为空且 finish_reason 为 length
        if (!content || !content.trim()) {
            if (choice?.finish_reason === "length") {
                throw new Error("模型在思维链阶段就用尽了输出额度，未生成答案。请提高 max_tokens 或换一个非推理模型。");
            }
            throw new Error("模型返回了空内容。");
        }

        return content;

    } catch (error) {
        if (error.name === "AbortError") {
            const seconds = Math.round(timeoutMs / 1000);
            throw new Error(`请求超过 ${seconds} 秒未响应，已中断。模型可能太慢或服务端繁忙，请重试或换一个更快的模型。`);
        }
        console.error("[AIService] Request failed:", error);
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Calls the AI Game Master
 */
export async function callGeminiGameMaster(puzzleContent, puzzleTruth, userInput, mode, history = [], currentClues = [], currentCompleteness = 0, persona = 'TERMINAL') {
    try {
        // Construct messages
        // 1. System Prompt
        const messages = [
            { role: "system", content: getSystemPrompt(persona) }
        ];

        // 2. History (Optional: Insert history if needed for context, usually helpful)
        // Ensure history format is correct { role: "user" | "assistant", content: string }
        if (history && history.length > 0) {
            messages.push(...history);
        }

        // 3. Current User Input (wrapped with Puzzle Context and Truth via buildGamePrompt)
        // Note: buildGamePrompt encapsulates the "State" of the puzzle.
        const userPrompt = buildGamePrompt(puzzleContent, puzzleTruth, userInput, mode, history, currentClues, currentCompleteness, persona);
        messages.push({ role: "user", content: userPrompt });

        // 推理模型（MiniMax-M3 等）单次请求就要十几秒，且 token 开销很大。
        // 对它们并发 3 次既不会更快（每个都慢），还会把费用翻 3 倍，所以只发 1 次，失败再串行重试。
        const { apiUrl, model } = getAIConfig();
        const isReasoningModel = isReasoningModelConfig(apiUrl, model);
        const maxAttempts = isReasoningModel ? 2 : 1;
        let aiResponse;
        let lastError;

        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            try {
                const raw = await callOpenAICompatibleAPI(messages, { type: "json_object" }, 0.7);
                aiResponse = parseAIJson(raw, "game master");
                break;
            } catch (error) {
                lastError = error;
                console.warn(`[AIService] Attempt ${attempt + 1} failed:`, error.message);
            }
        }

        if (!aiResponse) {
            console.error("[AIService] All attempts failed:", lastError);
            throw new Error(lastError?.message || "AI 请求失败或返回非法 JSON。");
        }

        // Handle filtered responses
        if (aiResponse.is_filtered) {
            return {
                text: aiResponse.flavor_text || ">> [REJECTED] Query violates protocol.",
                type: "error",
                new_clue: null,
                score_delta: 0
            };
        }

        // Convert to internal format based on mode
        if (mode === 'SOLVE') {
            return {
                text: aiResponse.flavor_text,
                type: aiResponse.is_correct ? "success" : "error",
                new_clue: aiResponse.is_correct ? `TRUTH REVEALED: ${puzzleTruth}` : null,
                score_delta: aiResponse.score_delta,
                is_correct: aiResponse.is_correct,
                accuracy_percent: aiResponse.accuracy_percent,
                missing_elements: aiResponse.missing_elements,
                completeness_percent: aiResponse.completeness_percent
            };
        } else {
            // QUERY mode
            return {
                text: aiResponse.flavor_text,
                type: "question",
                new_clue: aiResponse.new_evidence || null,
                score_delta: aiResponse.score_delta,
                answer: aiResponse.answer,
                completeness_percent: aiResponse.completeness_percent
            };
        }

    } catch (error) {
        console.error("[AIService] Error:", error);
        return {
            text: `>> [ERR_CONNECTION] ${error.message || 'Unknown error'}`,
            type: "error",
            new_clue: null
        };
    }
}

/**
 * Generates a new Puzzle
 */
export async function generatePuzzle(options = {}) {
    try {
        const messages = [
            { role: "system", content: PUZZLE_GENERATOR_PROMPT },
            { role: "user", content: buildPuzzleGeneratorPrompt(options) }
        ];

        const rawText = await callOpenAICompatibleAPI(messages, { type: "json_object" }, 1.0);
        const puzzle = normalizePuzzle(parseAIJson(rawText, "puzzle"));

        console.log("[AIService] Generated puzzle:", puzzle);
        return puzzle;

    } catch (error) {
        console.error("[AIService] Puzzle generation error:", error);
        throw error;
    }
}

/**
 * Check if the service is properly configured
 */
export function isGeminiConfigured() {
    const { apiKey, apiUrl } = getAIConfig();
    return Boolean(apiKey || apiUrl);
}
