"use client";

import { Building2, ImagePlus, MapPin, Phone, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Department = { id: string; name: string };

export function ProfileSettingsForm({
  user,
  departments,
}: {
  user: {
    name: string;
    email: string;
    role: string;
    displayRole: string;
    designation: string | null;
    phone: string | null;
    location: string | null;
    avatarUrl: string | null;
    monthlySalary: number | null;
    expectedDailyHours: number | null;
    departmentId: string | null;
  };
  departments: Department[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [departmentId, setDepartmentId] = useState(user.departmentId ?? "__none__");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const avatarPreview = useMemo(() => (avatarFile ? URL.createObjectURL(avatarFile) : avatarUrl), [avatarFile, avatarUrl]);

  useEffect(() => {
    if (!avatarFile || !avatarPreview.startsWith("blob:")) {
      return;
    }

    return () => URL.revokeObjectURL(avatarPreview);
  }, [avatarFile, avatarPreview]);

  async function onSubmit(formData: FormData) {
    setLoading(true);
    let nextAvatarUrl = avatarUrl;

    if (avatarFile) {
      const uploadData = new FormData();
      uploadData.append("avatar", avatarFile);

      const uploadResponse = await fetch("/api/account/avatar", {
        method: "POST",
        body: uploadData,
      });

      const uploadRaw = await uploadResponse.text();
      const uploadResult = uploadRaw ? JSON.parse(uploadRaw) : { message: "Photo upload failed." };

      if (!uploadResponse.ok) {
        setLoading(false);
        toast.error(uploadResult.message);
        return;
      }

      nextAvatarUrl = uploadResult.avatarUrl;
      setAvatarUrl(uploadResult.user?.avatarUrl ?? uploadResult.avatarUrl);
      setAvatarFile(null);
    }

    const payload = {
      name: String(formData.get("name") ?? ""),
      designation: String(formData.get("designation") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      location: String(formData.get("location") ?? ""),
      avatarUrl: nextAvatarUrl,
      monthlySalary: undefined,
      expectedDailyHours: undefined,
      departmentId: departmentId === "__none__" ? null : departmentId,
    };

    const response = await fetch("/api/account/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const raw = await response.text();
    const result = raw ? JSON.parse(raw) : { message: "Profile update failed." };
    setLoading(false);

    if (!response.ok) {
      toast.error(result.message);
      return;
    }

    setAvatarUrl(result.user?.avatarUrl ?? nextAvatarUrl);
    setAvatarFile(null);
    toast.success(result.message);
    router.refresh();
  }

  return (
    <form action={onSubmit} className="space-y-5">
      <div className="flex flex-col gap-4 rounded-3xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-18 w-18">
            {avatarPreview ? <AvatarImage alt={user.name} src={avatarPreview} /> : null}
            <AvatarFallback>{user.name.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold text-white">Profile Photo</p>
            <p className="text-sm text-[var(--muted-foreground)]">Upload a direct image file instead of pasting a URL.</p>
          </div>
        </div>
        <div className="w-full max-w-sm">
          <Label>Upload Photo</Label>
          <div className="relative">
            <ImagePlus className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="pl-10 file:mr-3 file:rounded-md file:border-0 file:bg-[var(--ring)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
              onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)}
              type="file"
            />
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>Full Name</Label>
          <div className="relative">
            <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input className="pl-10" defaultValue={user.name} name="name" placeholder="Your full name" />
          </div>
        </div>
        <div>
          <Label>Email</Label>
          <Input defaultValue={user.email} disabled />
        </div>
        <div>
          <Label>Designation</Label>
          <Input defaultValue={user.designation ?? ""} name="designation" placeholder="Role or job title" />
        </div>
        <div>
          <Label>Role</Label>
          <Input defaultValue={user.displayRole} disabled />
        </div>
        <div>
          <Label>Phone</Label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input className="pl-10" defaultValue={user.phone ?? ""} name="phone" placeholder="Phone number" />
          </div>
        </div>
        <div>
          <Label>Location</Label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input className="pl-10" defaultValue={user.location ?? ""} name="location" placeholder="Office location" />
          </div>
        </div>
      </div>
      <div>
        <Label>Department</Label>
        <Select value={departmentId} onValueChange={setDepartmentId}>
          <SelectTrigger>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[var(--muted-foreground)]" />
              <SelectValue placeholder="Choose department" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">No department</SelectItem>
            {departments.map((department) => (
              <SelectItem key={department.id} value={department.id}>
                {department.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
        <div>
          <p className="font-semibold text-white">Enterprise profile controls</p>
          <p className="text-sm text-[var(--muted-foreground)]">
            Keep your identity, image, and department information current for the entire workspace. Salary setup stays inside Team panel for Team Head and Admin only.
          </p>
        </div>
        <Button disabled={loading} type="submit">
          {loading ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
