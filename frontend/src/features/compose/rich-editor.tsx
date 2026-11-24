"use client";

import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
    Bold,
    Italic,
    Link2,
    List,
    ListOrdered,
    Quote,
    RemoveFormatting,
    Strikethrough,
    Underline,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

function LinkButton({ editor }: { editor: Editor }) {
    const [open, setOpen] = useState(false);
    const [url, setUrl] = useState("");
    const selection = useRef<{ from: number; to: number } | null>(null);

    const rememberSelection = () => {
        const { from, to } = editor.state.selection;
        selection.current = { from, to };
    };

    const apply = () => {
        const href = url.trim();
        const saved = selection.current;
        if (saved) {
            const chain = editor.chain().focus();
            if (!href) {
                chain.setTextSelection(saved).extendMarkRange("link").unsetLink().run();
            } else {
                const position = saved.to;
                const target = /^(https?:|mailto:)/i.test(href) ? href : `https://${href}`;
                const docSize = editor.state.doc.content.size;
                const before = position > 0 ? editor.state.doc.textBetween(position - 1, position, " ", " ") : "";
                const after = position < docSize ? editor.state.doc.textBetween(position, position + 1, " ", " ") : "";
                const addLeadingSpace = Boolean(before && !/\s/.test(before));
                const addTrailingSpace = !after || (!/\s/.test(after) && !/^[.,!?;:)}\]]/.test(after));
                const content = [
                    ...(addLeadingSpace ? [{ type: "text" as const, text: " " }] : []),
                    { type: "text" as const, text: href, marks: [{ type: "link" as const, attrs: { href: target } }] },
                    ...(addTrailingSpace ? [{ type: "text" as const, text: " " }] : []),
                ];

                // Insert the URL as its own linked text after the saved selection/caret.
                // This keeps existing selected text unchanged.
                chain.setTextSelection(position).insertContent(content).run();
            }
        }
        selection.current = null;
        setOpen(false);
    };

    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next) {
                    rememberSelection();
                    setUrl("");
                }
            }}
        >
            <PopoverTrigger
                render={
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Insert link"
                        onPointerDown={rememberSelection}
                    />
                }
            >
                <Link2 aria-hidden />
            </PopoverTrigger>
            <PopoverContent className="w-72" align="start">
                <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        apply();
                    }}
                >
                    <Input
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://dynarock.in"
                        autoFocus
                    />
                    <Button type="submit" size="sm">
                        {url ? "Apply" : "Remove"}
                    </Button>
                </form>
            </PopoverContent>
        </Popover>
    );
}

function Toolbar({ editor }: { editor: Editor }) {
    const state = useEditorState({
        editor,
        selector: ({ editor: e }) => ({
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            underline: e.isActive("underline"),
            strike: e.isActive("strike"),
            bullet: e.isActive("bulletList"),
            ordered: e.isActive("orderedList"),
            quote: e.isActive("blockquote"),
        }),
    });
    const items = [
        { key: "bold", icon: Bold, label: "Bold", run: () => editor.chain().focus().toggleBold().run() },
        { key: "italic", icon: Italic, label: "Italic", run: () => editor.chain().focus().toggleItalic().run() },
        {
            key: "underline",
            icon: Underline,
            label: "Underline",
            run: () => editor.chain().focus().toggleUnderline().run(),
        },
        {
            key: "strike",
            icon: Strikethrough,
            label: "Strikethrough",
            run: () => editor.chain().focus().toggleStrike().run(),
        },
        {
            key: "bullet",
            icon: List,
            label: "Bulleted list",
            run: () => editor.chain().focus().toggleBulletList().run(),
        },
        {
            key: "ordered",
            icon: ListOrdered,
            label: "Numbered list",
            run: () => editor.chain().focus().toggleOrderedList().run(),
        },
        { key: "quote", icon: Quote, label: "Quote", run: () => editor.chain().focus().toggleBlockquote().run() },
    ] as const;

    return (
        <div className="flex flex-wrap items-center gap-0.5" role="toolbar" aria-label="Formatting">
            {items.map(({ key, icon: Icon, label, run }, i) => (
                <span key={key} className="contents">
                    {i === 4 && (
                        <Separator
                            orientation="vertical"
                            className="mx-1 data-vertical:h-4 data-vertical:self-center"
                        />
                    )}
                    <Toggle size="sm" pressed={state[key]} onPressedChange={run} aria-label={label}>
                        <Icon aria-hidden />
                    </Toggle>
                </span>
            ))}
            <Separator orientation="vertical" className="mx-1 data-vertical:h-4 data-vertical:self-center" />
            <LinkButton editor={editor} />
            <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Clear formatting"
                onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
            >
                <RemoveFormatting aria-hidden />
            </Button>
        </div>
    );
}

export function RichEditor({
    initialHtml,
    onChange,
    placeholder = "Write your email…",
    className,
    autoFocus,
    onEditor,
}: {
    initialHtml: string;
    onChange: (html: string) => void;
    placeholder?: string;
    className?: string;
    autoFocus?: boolean;
    // Gives the parent the editor, e.g. to put AI text into it.
    onEditor?: (editor: Editor) => void;
}) {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({ link: { openOnClick: false, autolink: true, defaultProtocol: "https" } }),
            Placeholder.configure({ placeholder }),
        ],
        content: initialHtml,
        immediatelyRender: false,
        autofocus: autoFocus ? "start" : false,
        editorProps: {
            attributes: {
                class: "email-editor min-h-40 px-3 py-2 text-sm outline-none",
                "aria-label": "Email body",
            },
        },
        onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    });

    useEffect(() => {
        if (editor) onEditor?.(editor);
    }, [editor, onEditor]);

    if (!editor) return <div className={cn("min-h-40", className)} />;

    return (
        <div className={cn("flex min-h-0 flex-col", className)}>
            <div className="min-h-0 flex-1 overflow-y-auto" onClick={() => editor.chain().focus().run()}>
                <EditorContent editor={editor} />
            </div>
            <div className="border-t px-2 py-1">
                <Toolbar editor={editor} />
            </div>
        </div>
    );
}
