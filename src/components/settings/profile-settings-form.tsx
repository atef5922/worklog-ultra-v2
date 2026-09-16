"use client";

import { Building2, LockKeyhole, MapPin, Phone, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProfileSettingsUser, ProfileUpdatePayload, ProfileUpdateResponse } from "@/lib/contracts/user";

export function ProfileSettingsForm({
  user,
  departmentName,
}: {
  user: ProfileSettingsUser;
  departmentName: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
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

      const uploadedAvatarUrl = uploadResult.avatarUrl ?? "";
      nextAvatarUrl = uploadedAvatarUrl;
      setAvatarUrl(uploadedAvatarUrl);
      setAvatarFile(null);
    }

    const payload: ProfileUpdatePayload = {
      name: String(formData.get("name") ?? ""),
      designation: String(formData.get("designation") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      location: String(formData.get("location") ?? ""),
      avatarUrl: nextAvatarUrl,
      monthlySalary: undefined,
      expectedDailyHours: undefined,
    };

    const response = await fetch("/api/account/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const raw = await response.text();
    const result: ProfileUpdateResponse | { message: string } = raw
      ? JSON.parse(raw)
      : { message: "Profile update failed." };
    setLoading(false);

    if (!response.ok) {
      toast.error(result.message);
      return;
    }

    const updatedAvatarUrl = "user" in result ? result.user.avatarUrl ?? nextAvatarUrl : nextAvatarUrl;
    setAvatarUrl(updatedAvatarUrl);
    setAvatarFile(null);
    toast.success(result.message);
    router.refresh();
  }

  return (
    /* The shared controls are sized for roomy forms (h-11 inputs, mb-2 labels).
       Trimming them here keeps the whole page on one screen without touching
       every other form in the app. */
    <form action={onSubmit} className="flex h-full flex-col gap-3 [&_[role=combobox]]:h-10 [&_input]:h-10 [&_label]:mb-1 [&_label]:text-[0.76rem]">
      <div className="flex shrink-0 flex-col gap-2.5 rounded-xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2.5">
          <Avatar className="h-12 w-12">
            {avatarPreview ? <AvatarImage alt={user.name} src={avatarPreview} /> : null}
            <AvatarFallback>{user.name.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-[0.85rem] font-semibold text-[var(--foreground)]">Profile Photo</p>
            <p className="text-[0.72rem] leading-4 text-[var(--muted-foreground)]">Upload a direct image file instead of pasting a URL.</p>
          </div>
        </div>
        <div className="w-full max-w-sm">
          <Label>Upload Photo</Label>
          {/* The native control already renders its own button, so the file
              picker is styled through `file:` rather than overlaying an icon
              that collides with it. */}
          <Input
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="cursor-pointer p-1 text-[0.75rem] text-[var(--muted-foreground)] file:mr-2.5 file:inline-flex file:h-full file:cursor-pointer file:items-center file:rounded-md file:border-0 file:bg-[#4f5ef7] file:px-3 file:text-[0.75rem] file:font-semibold file:text-white hover:file:bg-[#4453eb]"
            onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)}
            type="file"
          />
        </div>
      </div>
      {/* Three across on a wide screen: six fields in two columns cost three
          rows of height the page could not spare. */}
      <div className="grid shrink-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div>
          <Label>Full Name</Label>
          <div className="relative">
            <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input className="pl-10" defaultValue={user.name} name="name" placeholder="Your full name" />
          </div>
        </div>
        <div>
          <Label>Email</Label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input aria-describedby="profile-email-note" className="pl-10" defaultValue={user.email} readOnly type="email" />
          </div>
          <p id="profile-email-note" className="mt-1 text-[0.7rem] text-[var(--muted-foreground)]">
            Only authorized management can change your email.
          </p>
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
      <div className="shrink-0">
        <Label>Department</Label>
        <div className="relative">
          <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <Input aria-describedby="profile-department-note" className="pl-10" value={departmentName} readOnly />
        </div>
        <p id="profile-department-note" className="mt-1 text-[0.7rem] text-[var(--muted-foreground)]">
          Only authorized management can change your department.
        </p>
      </div>
      {/* mt-auto pins this to the bottom of the panel, so the leftover height
          sits above it as breathing room rather than below the whole card. */}
      <div className="mt-auto flex shrink-0 items-center justify-between gap-3 rounded-xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-3">
        <div className="min-w-0">
          <p className="text-[0.85rem] font-semibold text-[var(--foreground)]">Enterprise profile controls</p>
          <p className="text-[0.72rem] leading-4 text-[var(--muted-foreground)]">
            Keep your profile and image current. Email and department changes require management approval. Salary setup stays inside Team panel for Team Head and Admin only.
          </p>
        </div>
        <Button className="h-9 shrink-0" disabled={loading} type="submit">
          {loading ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
