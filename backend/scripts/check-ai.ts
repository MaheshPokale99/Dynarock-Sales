// Checks the Gemini key and model by writing and classifying one sample email. Run: npm run check:ai
import { z } from "zod";
import { loadConfig } from "../src/config/env.js";
import { createGeminiModel } from "../src/integrations/gemini/gemini.js";
import { INTENTS } from "../src/modules/ai/ai.model.js";
import { CLASSIFIER_SYSTEM, WRITER_SYSTEM } from "../src/modules/ai/prompts.js";

const config = loadConfig();
if (!config.gemini.enabled) {
    console.log("GEMINI_API_KEY is not set in backend/.env");
    process.exit(1);
}
const model = createGeminiModel(config.gemini);
const schema = (s: z.ZodType) => z.toJSONSchema(s, { target: "draft-7" });

const email = z.object({ subject: z.string(), body: z.string() });
const label = z.object({ intent: z.enum(INTENTS), summary: z.string() });

try {
    const started = Date.now();
    const written = await model.generate({
        system: WRITER_SYSTEM,
        prompt: "KNOWLEDGE:\n- [module] Fees and student ledger: configurable fee structures.\n\nTASK: Two-line intro email to a principal about the fees module.",
        schema: schema(email),
        temperature: 0.5,
    });
    console.log(`write    OK (${Date.now() - started} ms, ${written.inputTokens}+${written.outputTokens} tokens)`);
    console.log("         ", email.parse(JSON.parse(written.text)).subject);

    const classified = await model.generate({
        system: CLASSIFIER_SYSTEM,
        prompt: "<email>\nFrom: principal@college.edu.in\n\nCan you show us a demo next Tuesday at 11?\n</email>",
        schema: schema(label),
        temperature: 0,
    });
    console.log("classify OK ->", label.parse(JSON.parse(classified.text)).intent);
    console.log(`Gemini works with model ${config.gemini.model}.`);
} catch (error) {
    console.log(`Gemini call FAILED for model ${config.gemini.model}:`, String((error as Error).message).slice(0, 400));
    process.exit(1);
}
