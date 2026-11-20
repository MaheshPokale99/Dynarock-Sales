"use client";

import { ArrowLeft, Globe, MapPin, Users } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/common/page-header";
import { StageBadge } from "@/components/common/stage-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrganization, useUpdateOrganization } from "@/hooks/use-contacts";
import { errorMessage, type Organization } from "@/lib/api";
import { CONTACT_ROLE_LABELS, ORG_TYPE_LABELS } from "@/lib/labels";
import { ContactDialog } from "../contacts/contact-dialog";
import { ConversationList } from "../contacts/conversation-list";
import { OrganizationFields, useOrganizationForm } from "./organization-form";

export function OrganizationDetailPage() {
    const { id } = useParams<{ id: string }>();
    const query = useOrganization(id);

    if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
    if (query.isPending) return <PageSkeleton />;
    const { organization: org, contacts, threads } = query.data;

    return (
        <div className="space-y-6">
            <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link href="/organizations" />}
                className="-ml-2"
            >
                <ArrowLeft data-icon="inline-start" />
                Colleges
            </Button>
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <h1 className="font-heading text-xl font-semibold tracking-tight wrap-anywhere sm:text-2xl">
                        {org.name}
                    </h1>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <Badge variant="outline">{ORG_TYPE_LABELS[org.type]}</Badge>
                        {(org.city || org.state) && (
                            <span className="inline-flex items-center gap-1.5">
                                <MapPin className="size-3.5" aria-hidden />
                                {[org.city, org.state].filter(Boolean).join(", ")}
                            </span>
                        )}
                        {org.domain && (
                            <span className="inline-flex items-center gap-1.5">
                                <Globe className="size-3.5" aria-hidden />@{org.domain}
                            </span>
                        )}
                        {org.studentCount !== null && <span>{org.studentCount.toLocaleString("en-IN")} students</span>}
                    </div>
                </div>
                <ContactDialog organizationId={org.id} />
            </div>

            <Tabs defaultValue="people">
                <TabsList>
                    <TabsTrigger value="people">People ({contacts.length})</TabsTrigger>
                    <TabsTrigger value="conversations">Conversations ({threads.length})</TabsTrigger>
                    <TabsTrigger value="details">Details</TabsTrigger>
                </TabsList>
                <TabsContent value="people" className="pt-4">
                    {contacts.length === 0 ? (
                        <EmptyState
                            icon={Users}
                            title="No people yet"
                            description="Add the principal, IT head or anyone else you talk to here."
                        />
                    ) : (
                        <ul className="divide-y rounded-xl border">
                            {contacts.map((c) => (
                                <li key={c.id}>
                                    <Link
                                        href={`/contacts/${c.id}`}
                                        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-medium">{c.name || c.email}</div>
                                            <div className="truncate text-xs text-muted-foreground">
                                                {[
                                                    c.designation ||
                                                        (c.role !== "other" ? CONTACT_ROLE_LABELS[c.role] : ""),
                                                    c.email,
                                                ]
                                                    .filter(Boolean)
                                                    .join(" · ")}
                                            </div>
                                        </div>
                                        <StageBadge stage={c.stage} />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </TabsContent>
                <TabsContent value="conversations" className="pt-4">
                    <ConversationList threads={threads} emptyText="Emails with people at this college show up here." />
                </TabsContent>
                <TabsContent value="details" className="pt-4">
                    <DetailsCard key={org.updatedAt} org={org} />
                </TabsContent>
            </Tabs>
        </div>
    );
}

function DetailsCard({ org }: { org: Organization }) {
    const state = useOrganizationForm(org);
    const update = useUpdateOrganization();
    return (
        <Card className="max-w-3xl">
            <form
                className="contents"
                onSubmit={(e) => {
                    e.preventDefault();
                    update.mutate(
                        { id: org.id, ...state.value() },
                        {
                            onSuccess: () => toast.success("College saved"),
                            onError: (err) => toast.error(errorMessage(err)),
                        },
                    );
                }}
            >
                <CardHeader>
                    <CardTitle>Details</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    <OrganizationFields state={state} full />
                </CardContent>
                <CardFooter className="justify-end pt-6">
                    <Button type="submit" disabled={update.isPending || !state.form.name.trim()}>
                        {update.isPending && <Spinner data-icon="inline-start" />}
                        Save
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
}
