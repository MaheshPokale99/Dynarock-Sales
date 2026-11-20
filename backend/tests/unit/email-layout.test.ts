import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEMO_BUTTON_MARKER, renderEmail } from "../../src/modules/mail/email-layout.js";

const brand = { logoUrl: null, brandColor: "#06294f", demoUrl: "https://dynarock.in/demo" };

describe("renderEmail", () => {
    it("wraps the body with the wordmark and footer", () => {
        const html = renderEmail("<p>Hello</p>", brand);
        assert.match(html, /data-layout="dynarock"/);
        assert.match(html, /<p>Hello<\/p>/);
        assert.match(html, />Dynarock</);
        assert.match(html, /dynarock\.in<\/a>/);
    });

    it("turns the demo marker into one button", () => {
        const html = renderEmail(`<p>Hi</p><p>${DEMO_BUTTON_MARKER}</p><p>${DEMO_BUTTON_MARKER}</p>`, brand);
        assert.equal(html.match(/Book a demo<\/a>/g)?.length, 1);
        assert.match(html, /href="https:\/\/dynarock\.in\/demo"/);
        assert.doesNotMatch(html, /\[\[BOOK_DEMO\]\]/);
    });

    it("drops the marker when no demo link is set, and never wraps twice", () => {
        const once = renderEmail(`<p>${DEMO_BUTTON_MARKER}</p>`, { ...brand, demoUrl: null });
        assert.doesNotMatch(once, /BOOK_DEMO|Book a demo/);
        assert.equal(renderEmail(once, brand), once);
    });

    it("uses the logo image when one is set", () => {
        assert.match(
            renderEmail("<p>x</p>", { ...brand, logoUrl: "https://cdn.example/logo.png" }),
            /<img src="https:\/\/cdn\.example\/logo\.png"/,
        );
    });
});
