"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function UserStatusToggle({
  userId,
  userName,
  isActive,
}: {
  userId: string;
  userName: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggleStatus() {
    setLoading(true);
    const response = await fetch(`/api/dashboard/users/${userId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    const raw = await response.text();
    const result = raw ? JSON.parse(raw) : { message: "User status update failed." };
    setLoading(false);

    if (!response.ok) {
      toast.error(result.message);
      return;
    }

    toast.success(result.message || `${userName} updated successfully.`);
    router.refresh();
  }

  return (
    <Button disabled={loading} onClick={toggleStatus} size="sm" type="button" variant={isActive ? "outline" : "secondary"}>
      {loading ? "Updating..." : isActive ? "Deactivate" : "Reactivate"}
    </Button>
  );
}
