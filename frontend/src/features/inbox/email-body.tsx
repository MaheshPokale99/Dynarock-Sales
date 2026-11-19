"use client";

import DOMPurify from "dompurify";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const QUOTE_SELECTORS = ".gmail_quote, .ds-quote, blockquote[type=cite], #appendonsend, .moz-cite-prefix";

const frameDoc = (body: string, hideQuotes: boolean) => `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data: cid:; style-src 'unsafe-inline'; font-src https: data:">
<base target="_blank">
<style>
html,body{margin:0;padding:0;background:#fff;color:#1f1f1f;font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;overflow-wrap:anywhere}
body{padding:2px}
img{max-width:100%;height:auto}
table{max-width:100%}
a{color:#0b57d0}
blockquote{margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex}
pre{white-space:pre-wrap}
${hideQuotes ? `${QUOTE_SELECTORS}{display:none!important}` : ""}
</style></head><body>${body}</body></html>`;

// Renders untrusted email HTML: sanitised, in a sandboxed iframe that can't run scripts.
export function EmailBody({ html }: { html: string }) {
    const ref = useRef<HTMLIFrameElement>(null);
    const [height, setHeight] = useState(60);
    const [showQuotes, setShowQuotes] = useState(false);

    const { clean, hasQuotes } = useMemo(() => {
        const sanitized = DOMPurify.sanitize(html, {
            FORBID_TAGS: ["style", "form", "input", "button"],
            WHOLE_DOCUMENT: false,
        });
        const probe = document.createElement("div");
        probe.innerHTML = sanitized;
        return { clean: sanitized, hasQuotes: Boolean(probe.querySelector(QUOTE_SELECTORS)) };
    }, [html]);

    useEffect(() => {
        const frame = ref.current;
        if (!frame) return;
        let observer: ResizeObserver | undefined;
        const measure = () => {
            const body = frame.contentDocument?.body;
            if (!body) return;
            setHeight(Math.ceil(body.scrollHeight) + 4);
            observer?.disconnect();
            observer = new ResizeObserver(() => setHeight(Math.ceil(body.scrollHeight) + 4));
            observer.observe(body);
        };
        frame.addEventListener("load", measure);
        return () => {
            frame.removeEventListener("load", measure);
            observer?.disconnect();
        };
    }, []);

    return (
        <div>
            <iframe
                ref={ref}
                title="Email content"
                sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                srcDoc={frameDoc(clean, hasQuotes && !showQuotes)}
                className="w-full rounded-md bg-white"
                style={{ height }}
            />
            {hasQuotes && (
                <Button
                    variant="ghost"
                    size="xs"
                    className="mt-1 text-muted-foreground"
                    onClick={() => setShowQuotes((v) => !v)}
                >
                    {showQuotes ? "Hide quoted text" : "··· Show quoted text"}
                </Button>
            )}
        </div>
    );
}
