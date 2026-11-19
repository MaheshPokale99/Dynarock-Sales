import type { AiModel, AiRequest, AiResponse } from "../../src/integrations/gemini/gemini.js";
import { CLASSIFIER_SYSTEM } from "../../src/modules/ai/prompts.js";

type Kind = "compose" | "rewrite" | "classify" | "reply";

// Scripted Gemini: answers by task type; tests override answers per kind.
export class FakeAi implements AiModel {
    enabled = true;
    model = "fake-gemini";
    calls: (AiRequest & { kind: Kind })[] = [];
    // Raw texts to return before falling back to the defaults (e.g. to test invalid JSON).
    queue: string[] = [];
    answers: Record<Kind, unknown> = {
        compose: {
            subject: "Dynarock for your campus",
            body: "Dear Dr. Rao,\n\nOne platform for admissions, fees and exams.\n\n- Free plan\n- Short demo",
        },
        rewrite: { body: "Shorter version." },
        classify: {
            intent: "question",
            confidence: 0.9,
            sentiment: "positive",
            summary: "Asks how fees work.",
            suggestedStage: null,
            meetingAt: null,
            returnDate: null,
        },
        reply: {
            body: "Thanks for asking. Our fees module keeps a ledger per student.\n\nCould we show you in a 20-minute demo?",
            rationale: "Answers the fee question and proposes a demo.",
        },
    };

    private kindOf(req: AiRequest): Kind {
        if (req.system === CLASSIFIER_SYSTEM) return "classify";
        if (req.prompt.includes("TASK: Rewrite")) return "rewrite";
        if (req.prompt.includes("reply to the client's latest email")) return "reply";
        return "compose";
    }

    generate(req: AiRequest): Promise<AiResponse> {
        const kind = this.kindOf(req);
        this.calls.push({ ...req, kind });
        const text = this.queue.shift() ?? JSON.stringify(this.answers[kind]);
        return Promise.resolve({ text, inputTokens: 100, outputTokens: 50 });
    }

    last(kind: Kind) {
        return this.calls.filter((c) => c.kind === kind).at(-1);
    }
}
