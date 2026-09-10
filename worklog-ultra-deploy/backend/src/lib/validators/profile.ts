import { z } from "zod";

const optionalNumberField = (minimum: number, maximum: number, minimumMessage?: string) =>
  z.preprocess(
    (value) => {
      if (value === "" || value === null || typeof value === "undefined") {
        return undefined;
      }
      return value;
    },
    z.coerce.number().min(minimum, minimumMessage).max(maximum).optional(),
  );

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, "Name is required."),
  designation: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  location: z.string().trim().max(120).optional().or(z.literal("")),
  avatarUrl: z.string().trim().max(255).optional().or(z.literal("")),
  expectedDailyHours: optionalNumberField(1, 24, "Expected daily hours must be at least 1."),
  monthlySalary: optionalNumberField(0, 999999999),
  departmentId: z.string().uuid().nullable().optional().or(z.literal("")),
});
