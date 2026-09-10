import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { isMailConfigured, sendWorkspaceEmail } from "@/lib/auth/mail";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { getWorkspaceMessages } from "@/lib/worklog";

export const runtime = "nodejs";

const sendMessageSchema = z.object({
  recipientId: z.string().uuid("Choose a valid teammate."),
  subject: z.string().trim().max(120).optional().or(z.literal("")),
  body: z.string().trim().min(1, "Message is required.").max(5000, "Message is too long."),
});

const ALLOWED_ATTACHMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/plain",
  "application/zip",
]);

const MAX_ATTACHMENT_SIZE = 8 * 1024 * 1024;

export async function GET() {
  const user = await requireUser();
  const { contacts, inbox } = await getWorkspaceMessages(user.id);

  return apiSuccess({
    contacts: contacts ?? [],
    inbox: inbox ?? [],
  });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  const formData = await request.formData();
  const parsed = sendMessageSchema.safeParse({
    recipientId: formData.get("recipientId"),
    subject: formData.get("subject"),
    body: formData.get("body"),
  });

  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid message payload.");
  }

  if (parsed.data.recipientId === user.id) {
    return apiError("Send the message to another account.");
  }

  const recipient = await db.user.findUnique({
    where: { id: parsed.data.recipientId },
    select: { id: true, email: true, name: true },
  });

  if (!recipient) {
    return apiError("Recipient account was not found.", 404);
  }

  const attachments = formData
    .getAll("attachments")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const attachmentPayload: Array<{
    fileName: string;
    fileUrl: string;
    fileType: string;
    fileSize: number;
  }> = [];

  for (const file of attachments) {
    if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
      return apiError(`Attachment type not allowed: ${file.name}`);
    }

    if (file.size > MAX_ATTACHMENT_SIZE) {
      return apiError(`Attachment too large: ${file.name}. Limit is 8MB.`);
    }

    const extension = path.extname(file.name || "").toLowerCase() || `.${file.type.split("/")[1] ?? "bin"}`;
    const uploadsDir = path.join(process.cwd(), "public", "uploads", "messages");
    const fileName = `${randomUUID()}${extension}`;
    const destination = path.join(uploadsDir, fileName);
    const buffer = Buffer.from(await file.arrayBuffer());

    await mkdir(uploadsDir, { recursive: true });
    await writeFile(destination, buffer);

    attachmentPayload.push({
      fileName: file.name,
      fileUrl: `/uploads/messages/${fileName}`,
      fileType: file.type,
      fileSize: file.size,
    });
  }

  const createdMessage = await db.workspaceMessage.create({
    data: {
      senderId: user.id,
      recipientId: parsed.data.recipientId,
      subject: parsed.data.subject || null,
      body: parsed.data.body,
      attachments: attachmentPayload.length
        ? {
            create: attachmentPayload,
          }
        : undefined,
    },
    select: {
      id: true,
      subject: true,
      body: true,
      readAt: true,
      createdAt: true,
      senderId: true,
      recipientId: true,
      sender: {
        select: {
          name: true,
          role: true,
          avatarUrl: true,
        },
      },
      recipient: {
        select: {
          name: true,
          role: true,
          avatarUrl: true,
        },
      },
      attachments: {
        select: {
          id: true,
          fileName: true,
          fileUrl: true,
          fileType: true,
          fileSize: true,
        },
      },
    },
  });

  if (isMailConfigured()) {
    const safeSubject = parsed.data.subject?.trim() || "New workspace message";
    const attachmentNotice = attachmentPayload.length
      ? `<p style="margin:12px 0 0;color:#475569">Attachments: ${attachmentPayload.length} file(s)</p>`
      : "";

    await sendWorkspaceEmail({
      email: recipient.email,
      subject: `${safeSubject} - WorkLog`,
      html: `<div style="font-family:Arial,sans-serif;color:#0f1725;line-height:1.6">
        <h2 style="margin:0 0 12px">You received a new WorkLog message</h2>
        <p style="margin:0 0 12px"><strong>From:</strong> ${user.name}</p>
        <p style="margin:0 0 12px"><strong>Subject:</strong> ${safeSubject}</p>
        <div style="padding:14px 16px;border-radius:14px;background:#e2e8f0;color:#0f1725;white-space:pre-wrap">${parsed.data.body}</div>
        ${attachmentNotice}
        <p style="margin:18px 0 0">
          <a href="${process.env.APP_BASE_URL ?? "http://localhost:3000"}/dashboard/messages" style="display:inline-block;padding:12px 18px;border-radius:14px;background:#102f5c;color:#ffffff;text-decoration:none;font-weight:700">
            Open messages
          </a>
        </p>
      </div>`,
    }).catch(() => null);
  }

  return apiSuccess({
    message: attachmentPayload.length ? "Message and files sent successfully." : "Message sent successfully.",
    sentMessage: {
      ...createdMessage,
      attachments: createdMessage.attachments ?? [],
    },
  });
}
