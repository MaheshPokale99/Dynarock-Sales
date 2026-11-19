import { BrandMark } from "@/components/common/brand";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthLayout({
    title,
    description,
    children,
}: {
    title: string;
    description?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-4">
            <div className="flex items-center gap-2">
                <BrandMark />
                <span className="font-heading text-lg font-semibold tracking-tight">Dynarock Sales</span>
            </div>
            <Card className="w-full max-w-sm">
                <CardHeader>
                    <CardTitle className="text-xl">{title}</CardTitle>
                    {description && <CardDescription>{description}</CardDescription>}
                </CardHeader>
                <CardContent>{children}</CardContent>
            </Card>
            <p className="text-xs text-muted-foreground">Internal tool for the Dynarock sales team</p>
        </main>
    );
}
