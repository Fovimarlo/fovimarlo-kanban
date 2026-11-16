import { z } from "zod";

// ─── workLog.list ────────────────────────────────────────────
export const workLogListItemSchema = z.object({
  publicId: z.string(),
  date: z.string(),
  content: z.string(),
  durationMinutes: z.number().nullable(),
  createdAt: z.date(),
  updatedAt: z.date().nullable(),
  // Whether the current user may edit / delete this entry
  canEdit: z.boolean(),
  member: z.object({
    publicId: z.string(),
    email: z.string(),
    user: z
      .object({
        name: z.string().nullable(),
        email: z.string(),
        image: z.string().nullable(),
      })
      .nullable(),
  }),
  board: z
    .object({
      publicId: z.string(),
      name: z.string(),
    })
    .nullable(),
});

// ─── workLog.create / update / delete ────────────────────────
export const workLogMutationResponseSchema = z.object({
  publicId: z.string(),
});
