"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

export function PasswordInput(props: Omit<React.ComponentProps<"input">, "type">) {
    const [visible, setVisible] = useState(false);
    return (
        <InputGroup>
            <InputGroupInput {...props} type={visible ? "text" : "password"} />
            <InputGroupAddon align="inline-end">
                <InputGroupButton
                    size="icon-xs"
                    aria-label={visible ? "Hide password" : "Show password"}
                    aria-pressed={visible}
                    onClick={() => setVisible((v) => !v)}
                >
                    {visible ? <EyeOff /> : <Eye />}
                </InputGroupButton>
            </InputGroupAddon>
        </InputGroup>
    );
}
