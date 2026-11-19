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
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

function LinkButton({ editor }: { editor: Editor }) {
    const [open, setOpen] = useState(false);
    const [url, setUrl] = useState("");

    const apply = () => {
        const href = url.trim();
        const chain = editor.chain().focus().extendMarkRange("link");
        if (!href) chain.unsetLink().run();
        else chain.setLink({ href: /^(https?:|mailto:)/i.test(href) ? href : `https://${href}` }).run();
        setOpen(false);
    };

    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next) setUrl((editor.getAttributes("link").href as string | undefined) ?? "");
            }}
        >
            <PopoverTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Insert link" />}>
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
}: {
    initialHtml: string;
    onChange: (html: string) => void;
    placeholder?: string;
    className?: string;
    autoFocus?: boolean;
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
