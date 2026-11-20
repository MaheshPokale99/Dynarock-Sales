"use client";

import DOMPurify from "dompurify";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const QUOTE_SELECTORS = ".gmail_quote, .ds-quote, blockquote[type=cite], #appendonsend, .moz-cite-prefix";

const frameDoc = (body: string, hideQuotes: boolean) => `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data: cid:; style-src 'unsafe-inline'; font-src https: data:">
<base target="_blank">
<style>
html,body{margin:0;padding:0;height:auto!important;background:#fff;color:#1f1f1f;font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;overflow-wrap:anywhere}
html{overflow-x:auto}
#mail-root{display:flow-root;padding:2px}
#mail-root *{max-width:100%!important;min-width:0!important;min-height:0!important;box-sizing:border-box}
#mail-root [style*="height"]:not(img){height:auto!important}
img{height:auto!important}
td,th{word-break:break-word}
a{color:#0b57d0}
blockquote{margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex}
pre{white-space:pre-wrap}
${hideQuotes ? `${QUOTE_SELECTORS}{display:none!important}` : ""}
</style></head><body><div id="mail-root">${body}</div></body></html>`;

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
            const root = frame.contentDocument?.getElementById("mail-root");
            if (!root) return;
            const fit = () => setHeight(Math.ceil(root.getBoundingClientRect().height) + 2);
            fit();
            observer?.disconnect();
            observer = new ResizeObserver(fit);
            observer.observe(root);
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
