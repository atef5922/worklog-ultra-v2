// Isolated UI fixture: no credentials, sessions, or production API writes.
import React from "react";
import { createRoot } from "react-dom/client";
import { Sidebar, MobileSidebar } from "../../src/components/dashboard/sidebar";
import type { DashboardSidebarUser } from "../../src/lib/contracts/user";

const params = new URLSearchParams(location.search);
const user: DashboardSidebarUser = {
  id: "sidebar-fixture", name: "Sidebar Test", role: (params.get("role") || "super_admin") as DashboardSidebarUser["role"],
  designation: null, avatarUrl: null, managementEnabled: params.get("management") !== "false",
  permissions: [
    {permissionKey:"reports.view",isGranted:true},{permissionKey:"audit_logs.view",isGranted:true},
    ...(params.get("attendance")==="true"?[
      {permissionKey:"employees.view",isGranted:true},{permissionKey:"attendance.view",isGranted:true},
    ]:[]),
  ],
};

createRoot(document.getElementById("root")!).render(
  <div style={{display:"flex",height:"100dvh",overflow:"hidden"}}>
    <Sidebar user={user} />
    <main style={{flex:1,minWidth:0,padding:"24px",background:"var(--background)"}}>
      <MobileSidebar user={user} />
      <h1>Sidebar layout verification</h1>
      <p>Isolated component fixture — no employee data.</p>
    </main>
  </div>,
);
