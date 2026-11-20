"use client";

import { Trash2 } from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function ConfirmDelete({
    name,
    what,
    description,
    onConfirm,
}: {
    name: string;
    what: string;
    description?: string;
    onConfirm: () => void;
}) {
    return (
        <AlertDialog>
            <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Delete ${name}`} />}>
                <Trash2 aria-hidden />
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        Delete {what} “{name}”?
                    </AlertDialogTitle>
                    <AlertDialogDescription>{description ?? "This can't be undone."}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Keep it</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={onConfirm}>
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
