import { MessagesCenter } from "@/components/dashboard/messages-center";
import { requireUser } from "@/lib/auth/server";
import { getWorkspaceMessages } from "@/lib/worklog";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const user = await requireUser();
  const { contacts, inbox } = await getWorkspaceMessages(user.id);

  return <MessagesCenter contacts={contacts} currentUserId={user.id} messages={inbox} />;
}
