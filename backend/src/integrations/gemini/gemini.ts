import { setTimeout as sleep } from "node:timers/promises";
import { GoogleGenAI } from "@google/genai";

export interface AiRequest {
    system: string;
    prompt: string;
    // JSON Schema the answer must follow.
    schema: unknown;
    temperature: number;
}

export interface AiResponse {
    text: string;
    inputTokens: number;
    outputTokens: number;
}

export interface AiModel {
    readonly enabled: boolean;
    readonly model: string;
    generate(request: AiRequest): Promise<AiResponse>;
}

const MAX_ATTEMPTS = 3;
const retryable = (e: unknown) => {
    const status = (e as { status?: number }).status ?? 0;
    return status === 429 || status >= 500;
};

export function createGeminiModel(config: { apiKey: string; model: string; enabled: boolean }): AiModel {
    const client = config.enabled ? new GoogleGenAI({ apiKey: config.apiKey }) : null;
    return {
        enabled: config.enabled,
        model: config.model,
        async generate({ system, prompt, schema, temperature }) {
            if (!client) throw new Error("GEMINI_API_KEY is not set");
            for (let attempt = 1; ; attempt++) {
                try {
                    const res = await client.models.generateContent({
                        model: config.model,
                        contents: [{ role: "user", parts: [{ text: prompt }] }],
                        config: {
                            systemInstruction: system,
                            temperature,
                            responseMimeType: "application/json",
                            responseJsonSchema: schema,
                        },
                    });
                    return {
                        text: res.text ?? "",
                        inputTokens: res.usageMetadata?.promptTokenCount ?? 0,
                        outputTokens: res.usageMetadata?.candidatesTokenCount ?? 0,
                    };
                } catch (error) {
                    if (attempt >= MAX_ATTEMPTS || !retryable(error)) throw error;
                    await sleep(800 * 2 ** attempt);
                }
            }
        },
    };
}
