import { Badge } from "@/components/ui/badge";
import { UserStatusToggle } from "@/components/admin/user-status-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { roleUiTitle } from "@/lib/auth/roles";
import { requireAdminOrManager } from "@/lib/auth/server";
import { getAdminOverview } from "@/lib/worklog";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const actor = await requireAdminOrManager();
  const { users } = await getAdminOverview();

  return (
    <Card>
      <CardHeader><CardTitle>Users & Roles</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <THead><TR><TH>Name</TH><TH>Email</TH><TH>Role</TH><TH>Department</TH><TH>Status</TH><TH>Action</TH></TR></THead>
          <TBody>
            {users.map((user) => (
              <TR key={user.id}>
                <TD>{user.name}</TD>
                <TD>{user.email}</TD>
                <TD><Badge>{roleUiTitle(user.role)}</Badge></TD>
                <TD>{user.department?.name ?? "Executive"}</TD>
                <TD>
                  <Badge variant={user.isActive ? "success" : "secondary"}>
                    {user.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TD>
                <TD>
                  {user.id === actor.id || (actor.role === "manager" && user.role === "manager") ? null : (
                    <UserStatusToggle isActive={user.isActive} userId={user.id} userName={user.name} />
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}
