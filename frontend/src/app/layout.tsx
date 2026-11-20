import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
    title: { default: "Dynarock Sales", template: "%s · Dynarock Sales" },
    description: "The Dynarock sales team's shared inbox, AI follow-ups and growth dashboard.",
    robots: { index: false, follow: false },
};

export const viewport: Viewport = {
    themeColor: "#06294F",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
    return (
        <html lang="en" suppressHydrationWarning className="h-full antialiased">
            <body className="min-h-full bg-background font-sans text-foreground">
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
