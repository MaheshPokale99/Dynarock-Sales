"use client";

import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { isEmail } from "@/lib/mail-format";
import { cn } from "@/lib/utils";

function useDebounced<T>(value: T, ms: number) {
    const [v, setV] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setV(value), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return v;
}

const splitAddresses = (text: string) =>
    text
        .split(/[,;\s]+/)
        .map((s) =>
            s
                .replace(/^.*<|>$/g, "")
                .trim()
                .toLowerCase(),
        )
        .filter(Boolean);

export function RecipientInput({
    label,
    value,
    onChange,
    autoFocus,
    trailing,
}: {
    label: string;
    value: string[];
    onChange: (next: string[]) => void;
    autoFocus?: boolean;
    trailing?: React.ReactNode;
}) {
    const id = useId();
    const [text, setText] = useState("");
    const [active, setActive] = useState(0);
    const [focused, setFocused] = useState(false);
    const q = useDebounced(text.trim(), 200);
    const suggestions = useQuery({
        queryKey: ["recipients", q],
        queryFn: () => api.recipients(q),
        enabled: q.length >= 2,
        staleTime: 60_000,
    });
    const options = (suggestions.data ?? []).filter((s) => !value.includes(s.email));
    const showList = focused && text.trim().length >= 2 && options.length > 0;

    const add = (emails: string[]) => {
        const next = [...value];
        for (const e of emails) if (!next.includes(e)) next.push(e);
        onChange(next);
        setText("");
        setActive(0);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (showList && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setActive((i) => (i + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
        } else if (e.key === "Enter" || e.key === "," || e.key === ";" || (e.key === "Tab" && text.trim())) {
            if (!text.trim() && e.key === "Enter") return;
            e.preventDefault();
            const picked = showList ? options[active] : undefined;
            add(picked ? [picked.email] : splitAddresses(text));
        } else if (e.key === "Backspace" && !text && value.length > 0) {
            onChange(value.slice(0, -1));
        } else if (e.key === "Escape") {
            setText("");
        }
    };

    return (
        <div className="relative flex items-start gap-2 border-b px-3 py-1.5">
            <label htmlFor={id} className="mt-1 w-8 shrink-0 text-sm text-muted-foreground">
                {label}
            </label>
            <div className="flex min-h-7 flex-1 flex-wrap items-center gap-1">
                {value.map((email) => (
                    <Badge
                        key={email}
                        variant={isEmail(email) ? "secondary" : "destructive"}
                        className="h-6 gap-1 pr-1 font-normal"
                        title={isEmail(email) ? email : `${email} doesn't look like an email address`}
                    >
                        {email}
                        <button
                            type="button"
                            className="rounded-full p-0.5 hover:bg-foreground/10"
                            onClick={() => onChange(value.filter((v) => v !== email))}
                            aria-label={`Remove ${email}`}
                        >
                            <X className="size-3" aria-hidden />
                        </button>
                    </Badge>
                ))}
                <input
                    id={id}
                    className="min-w-32 flex-1 bg-transparent py-1 text-sm outline-none"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={onKeyDown}
                    onFocus={() => setFocused(true)}
                    onBlur={() => {
                        setFocused(false);
                        if (text.trim()) add(splitAddresses(text));
                    }}
                    onPaste={(e) => {
                        const pasted = e.clipboardData.getData("text");
                        if (/[,;\s]/.test(pasted.trim())) {
                            e.preventDefault();
                            add(splitAddresses(pasted));
                        }
                    }}
                    autoFocus={autoFocus}
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={showList}
                    aria-controls={`${id}-list`}
                />
            </div>
            {trailing}
            {showList && (
                <ul
                    id={`${id}-list`}
                    role="listbox"
                    className="absolute top-full left-12 z-50 mt-1 w-72 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
                >
                    {options.map((o, i) => (
                        <li
                            key={o.email}
                            role="option"
                            aria-selected={i === active}
                            className={cn("cursor-default rounded-md px-2 py-1.5 text-sm", i === active && "bg-accent")}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                add([o.email]);
                            }}
                            onMouseEnter={() => setActive(i)}
                        >
                            <div className="truncate font-medium">{o.name || o.email}</div>
                            {o.name && <div className="truncate text-xs text-muted-foreground">{o.email}</div>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
