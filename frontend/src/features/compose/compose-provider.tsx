"use client";

import { Maximize2, Minimize2, Minus, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ComposeForm, type ComposeInit } from "./compose-form";

interface ComposeWindow {
    key: number;
    init: ComposeInit;
    title: string;
    minimized: boolean;
    maximized: boolean;
}

interface ComposeApi {
    open: (init?: Partial<ComposeInit>) => void;
}

const ComposeContext = createContext<ComposeApi | null>(null);
const MAX_WINDOWS = 3;
let nextKey = 1;

export function useCompose() {
    const ctx = useContext(ComposeContext);
    if (!ctx) throw new Error("useCompose must be used inside ComposeProvider");
    return ctx;
}

// Gmail-style compose windows docked at the bottom right, available on every page.
export function ComposeProvider({ children }: { children: React.ReactNode }) {
    const [windows, setWindows] = useState<ComposeWindow[]>([]);

    const open = useCallback((init: Partial<ComposeInit> = {}) => {
        setWindows((list) => {
            if (init.draftId && list.some((w) => w.init.draftId === init.draftId)) return list;
            const win: ComposeWindow = {
                key: nextKey++,
                init: { mode: "new", ...init },
                title: init.subject || "New message",
                minimized: false,
                maximized: false,
            };
            const others = list.map((w) => ({ ...w, minimized: true, maximized: false }));
            return [...others, win].slice(-MAX_WINDOWS);
        });
    }, []);

    const patchWindow = (key: number, patch: Partial<ComposeWindow>) =>
        setWindows((list) => list.map((w) => (w.key === key ? { ...w, ...patch } : w)));
    const close = (key: number) => setWindows((list) => list.filter((w) => w.key !== key));

    const api = useMemo(() => ({ open }), [open]);
    const maximized = windows.find((w) => w.maximized);

    return (
        <ComposeContext.Provider value={api}>
            {children}
            {maximized && (
                <div
                    className="fixed inset-0 z-40 bg-black/40"
                    onClick={() => patchWindow(maximized.key, { maximized: false })}
                />
            )}
            <div className="pointer-events-none fixed right-0 bottom-0 z-50 flex items-end gap-3 px-4 max-sm:inset-x-0 max-sm:px-0">
                {windows.map((w) => (
                    <section
                        key={w.key}
                        aria-label={w.title}
                        className={cn(
                            "pointer-events-auto flex flex-col overflow-hidden rounded-t-xl border bg-background shadow-2xl",
                            w.minimized
                                ? "w-72 max-sm:hidden"
                                : w.maximized
                                  ? "fixed inset-x-4 top-[5vh] bottom-[5vh] mx-auto max-w-4xl rounded-xl"
                                  : "h-[min(600px,85vh)] w-[min(560px,calc(100vw-2rem))] max-sm:fixed max-sm:inset-0 max-sm:h-auto max-sm:w-auto max-sm:rounded-none",
                        )}
                    >
                        <header
                            className="flex h-10 shrink-0 cursor-pointer items-center gap-1 bg-muted px-3"
                            onClick={() => patchWindow(w.key, { minimized: !w.minimized, maximized: false })}
                        >
                            <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{w.title}</h3>
                            <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label={w.minimized ? "Expand" : "Minimize"}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    patchWindow(w.key, { minimized: !w.minimized, maximized: false });
                                }}
                            >
                                <Minus aria-hidden />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon-xs"
                                className="max-sm:hidden"
                                aria-label={w.maximized ? "Exit full screen" : "Full screen"}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    patchWindow(w.key, { maximized: !w.maximized, minimized: false });
                                }}
                            >
                                {w.maximized ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label="Close (keeps the draft)"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    close(w.key);
                                }}
                            >
                                <X aria-hidden />
                            </Button>
                        </header>
                        <div className={cn("flex min-h-0 flex-1 flex-col", w.minimized && "hidden")}>
                            <ComposeForm
                                init={w.init}
                                variant="window"
                                onDone={() => close(w.key)}
                                onSubjectChange={(s) => {
                                    const title = s.trim() || "New message";
                                    if (title !== w.title) patchWindow(w.key, { title });
                                }}
                            />
                        </div>
                    </section>
                ))}
            </div>
        </ComposeContext.Provider>
    );
}
