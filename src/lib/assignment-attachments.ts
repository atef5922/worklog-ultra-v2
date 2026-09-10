export const ASSIGNMENT_ATTACHMENTS_MARKER = "[assignment-attachments]";

export type AssignmentAttachment = {
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
};

function cleanText(value?: string | null) {
  return (value ?? "").trim();
}

export function stripAssignmentAttachmentMeta(value?: string | null) {
  if (!value) {
    return "";
  }

  const markerIndex = value.indexOf(ASSIGNMENT_ATTACHMENTS_MARKER);
  if (markerIndex === -1) {
    return value.trim();
  }

  return value.slice(0, markerIndex).trim();
}

export function embedAssignmentAttachmentMeta(
  value: string,
  attachments: AssignmentAttachment[],
) {
  const cleanValue = stripAssignmentAttachmentMeta(value);
  const cleanAttachments = (attachments ?? []).filter((item) => item.fileName && item.fileUrl);

  if (!cleanAttachments.length) {
    return cleanValue;
  }

  return [
    cleanValue,
    ASSIGNMENT_ATTACHMENTS_MARKER,
    JSON.stringify(cleanAttachments),
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function extractAssignmentAttachmentMeta(value?: string | null) {
  const text = stripAssignmentAttachmentMeta(value);

  if (!value || !value.includes(ASSIGNMENT_ATTACHMENTS_MARKER)) {
    return {
      text,
      attachments: [] as AssignmentAttachment[],
    };
  }

  const markerIndex = value.indexOf(ASSIGNMENT_ATTACHMENTS_MARKER);
  const rawAttachmentBlock = value
    .slice(markerIndex + ASSIGNMENT_ATTACHMENTS_MARKER.length)
    .trim();

  try {
    const parsed = JSON.parse(rawAttachmentBlock) as AssignmentAttachment[];
    return {
      text,
      attachments: Array.isArray(parsed)
        ? parsed.filter((item) => item?.fileName && item?.fileUrl)
        : [],
    };
  } catch {
    return {
      text,
      attachments: [] as AssignmentAttachment[],
    };
  }
}
