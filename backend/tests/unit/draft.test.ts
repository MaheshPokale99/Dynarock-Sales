import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkDraft, textToEmailHtml } from "../../src/modules/ai/draft.js";

describe("checkDraft", () => {
    it("accepts figures and links found in the sources", () => {
        const sources = ["Fees module costs ₹2,40,000 per year", "Docs at https://partner.example/guide"];
        assert.deepEqual(
            checkDraft("It is 240000 a year. See https://partner.example/guide and dynarock.in", sources),
            [],
        );
    });

    it("flags made-up figures without matching parts of other numbers", () => {
        const warnings = checkDraft("Save 30% now", ["Founded 2030", "Room 130"]);
        assert.equal(warnings.length, 1);
        assert.match(warnings[0]!, /30%/);
    });

    it("allows any dynarock.in link and flags others", () => {
        const warnings = checkDraft("See https://www.dynarock.in/demo or www.other.example", []);
        assert.equal(warnings.length, 1);
        assert.match(warnings[0]!, /www\.other\.example/);
    });
});

describe("textToEmailHtml", () => {
    it("escapes HTML and builds paragraphs and lists", () => {
        assert.equal(
            textToEmailHtml("Hi <b>Ravi</b>,\nthanks.\n\n- One\n- Two"),
            "<p>Hi &lt;b&gt;Ravi&lt;/b&gt;,<br>thanks.</p><ul><li>One</li><li>Two</li></ul>",
        );
    });
});
