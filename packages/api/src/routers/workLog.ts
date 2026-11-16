import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { dbClient } from "@kan/db/client";
import * as boardRepo from "@kan/db/repository/board.repo";
import * as permissionRepo from "@kan/db/repository/permission.repo";
import * as workLogRepo from "@kan/db/repository/workLog.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";

import {
  workLogListItemSchema,
  workLogMutationResponseSchema,
} from "../schemas";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { createAvatarUrlResolver } from "../utils/avatarUrls";

const MAX_CONTENT_LENGTH = 5000;
const MAX_RANGE_DAYS = 62;
const MAX_DURATION_MINUTES = 24 * 60;

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), {
    message: "Invalid date",
  });

const contentSchema = z.string().trim().min(1).max(MAX_CONTENT_LENGTH);
const durationSchema = z
  .number()
  .int()
  .min(1)
  .max(MAX_DURATION_MINUTES)
  .nullable();

const requireUserId = (userId: string | undefined) => {
  if (!userId)
    throw new TRPCError({
      message: `User not authenticated`,
      code: "UNAUTHORIZED",
    });
  return userId;
};

/** Returns the caller's active membership, or throws FORBIDDEN. */
const getCurrentMember = async (
  db: dbClient,
  userId: string,
  workspaceId: number,
) => {
  const member = await permissionRepo.getMemberWithRole(
    db,
    userId,
    workspaceId,
  );

  if (!member)
    throw new TRPCError({
      message: `You do not have access to this workspace`,
      code: "FORBIDDEN",
    });

  return member;
};

const getWorkspaceOrThrow = async (db: dbClient, workspacePublicId: string) => {
  const workspace = await workspaceRepo.getByPublicId(db, workspacePublicId);

  if (!workspace)
    throw new TRPCError({
      message: `Workspace with public ID ${workspacePublicId} not found`,
      code: "NOT_FOUND",
    });

  return workspace;
};

/** Resolves an optional board public ID to an internal ID in the same workspace. */
const resolveBoardId = async (
  db: dbClient,
  boardPublicId: string | null | undefined,
  workspaceId: number,
) => {
  if (boardPublicId === undefined) return undefined;
  if (boardPublicId === null) return null;

  const board = await boardRepo.getWorkspaceAndBoardIdByBoardPublicId(
    db,
    boardPublicId,
  );

  if (!board || board.workspaceId !== workspaceId)
    throw new TRPCError({
      message: `Board with public ID ${boardPublicId} not found`,
      code: "NOT_FOUND",
    });

  return board.id;
};

/** Loads a work log the caller may modify: their own, or any if they are an admin. */
const getEditableWorkLog = async (
  db: dbClient,
  userId: string,
  workLogPublicId: string,
) => {
  const workLog = await workLogRepo.getByPublicId(db, workLogPublicId);

  if (!workLog)
    throw new TRPCError({
      message: `Work log with public ID ${workLogPublicId} not found`,
      code: "NOT_FOUND",
    });

  const member = await getCurrentMember(db, userId, workLog.workspaceId);

  if (workLog.memberId !== member.id && member.role !== "admin")
    throw new TRPCError({
      message: `You can only change your own work logs`,
      code: "FORBIDDEN",
    });

  return workLog;
};

export const workLogRouter = createTRPCRouter({
  list: protectedProcedure
    .meta({
      openapi: {
        summary: "List work logs",
        method: "GET",
        path: "/workspaces/{workspacePublicId}/work-logs",
        description:
          "Lists daily work log entries within a date range (inclusive). Admins see all members; other members only see their own entries.",
        tags: ["Work logs"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        dateFrom: dateSchema,
        dateTo: dateSchema,
        memberPublicId: z.string().min(12).optional(),
      }),
    )
    .output(z.array(workLogListItemSchema))
    .query(async ({ ctx, input }) => {
      const userId = requireUserId(ctx.user?.id);
      const workspace = await getWorkspaceOrThrow(
        ctx.db,
        input.workspacePublicId,
      );
      const currentMember = await getCurrentMember(
        ctx.db,
        userId,
        workspace.id,
      );

      const from = Date.parse(`${input.dateFrom}T00:00:00Z`);
      const to = Date.parse(`${input.dateTo}T00:00:00Z`);
      if (to < from || (to - from) / 86_400_000 > MAX_RANGE_DAYS)
        throw new TRPCError({
          message: `Date range must be between 0 and ${MAX_RANGE_DAYS} days`,
          code: "BAD_REQUEST",
        });

      // Only admins can see other members' logs; everyone else sees their own.
      const isAdmin = currentMember.role === "admin";
      let memberId: number | undefined = isAdmin ? undefined : currentMember.id;
      if (
        input.memberPublicId &&
        input.memberPublicId !== currentMember.publicId
      ) {
        if (!isAdmin)
          throw new TRPCError({
            message: `Only admins can view other members' work logs`,
            code: "FORBIDDEN",
          });
        const member = await workspaceRepo.getMemberByPublicId(
          ctx.db,
          input.memberPublicId,
          workspace.id,
        );
        if (!member)
          throw new TRPCError({
            message: `Member with public ID ${input.memberPublicId} not found`,
            code: "NOT_FOUND",
          });
        memberId = member.id;
      }

      const entries = await workLogRepo.getAllByWorkspaceAndDateRange(ctx.db, {
        workspaceId: workspace.id,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        memberId,
      });

      const resolveAvatarUrl = createAvatarUrlResolver();

      return Promise.all(
        entries.map(async ({ memberId: entryMemberId, ...entry }) => ({
          ...entry,
          canEdit:
            entryMemberId === currentMember.id ||
            currentMember.role === "admin",
          member: {
            ...entry.member,
            user: entry.member.user
              ? {
                  ...entry.member.user,
                  image: entry.member.user.image
                    ? await resolveAvatarUrl(entry.member.user.image)
                    : null,
                }
              : null,
          },
        })),
      );
    }),
  create: protectedProcedure
    .meta({
      openapi: {
        summary: "Create a work log",
        method: "POST",
        path: "/work-logs",
        description: "Adds a daily work log entry for the current user",
        tags: ["Work logs"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        date: dateSchema,
        content: contentSchema,
        durationMinutes: durationSchema.optional(),
        boardPublicId: z.string().min(12).nullable().optional(),
      }),
    )
    .output(workLogMutationResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx.user?.id);
      const workspace = await getWorkspaceOrThrow(
        ctx.db,
        input.workspacePublicId,
      );
      const member = await getCurrentMember(ctx.db, userId, workspace.id);
      const boardId = await resolveBoardId(
        ctx.db,
        input.boardPublicId,
        workspace.id,
      );

      const result = await workLogRepo.create(ctx.db, {
        workspaceId: workspace.id,
        memberId: member.id,
        boardId: boardId ?? null,
        date: input.date,
        content: input.content,
        durationMinutes: input.durationMinutes ?? null,
        createdBy: userId,
      });

      if (!result)
        throw new TRPCError({
          message: `Failed to create work log`,
          code: "INTERNAL_SERVER_ERROR",
        });

      return result;
    }),
  update: protectedProcedure
    .meta({
      openapi: {
        summary: "Update a work log",
        method: "PUT",
        path: "/work-logs/{workLogPublicId}",
        description: "Updates a work log entry (own entries, or any as admin)",
        tags: ["Work logs"],
        protect: true,
      },
    })
    .input(
      z.object({
        workLogPublicId: z.string().min(12),
        date: dateSchema.optional(),
        content: contentSchema.optional(),
        durationMinutes: durationSchema.optional(),
        boardPublicId: z.string().min(12).nullable().optional(),
      }),
    )
    .output(workLogMutationResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx.user?.id);
      const workLog = await getEditableWorkLog(
        ctx.db,
        userId,
        input.workLogPublicId,
      );
      const boardId = await resolveBoardId(
        ctx.db,
        input.boardPublicId,
        workLog.workspaceId,
      );

      const result = await workLogRepo.update(ctx.db, workLog.id, {
        date: input.date,
        content: input.content,
        durationMinutes: input.durationMinutes,
        boardId,
      });

      if (!result)
        throw new TRPCError({
          message: `Failed to update work log`,
          code: "INTERNAL_SERVER_ERROR",
        });

      return result;
    }),
  delete: protectedProcedure
    .meta({
      openapi: {
        summary: "Delete a work log",
        method: "DELETE",
        path: "/work-logs/{workLogPublicId}",
        description: "Deletes a work log entry (own entries, or any as admin)",
        tags: ["Work logs"],
        protect: true,
      },
    })
    .input(z.object({ workLogPublicId: z.string().min(12) }))
    .output(workLogMutationResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = requireUserId(ctx.user?.id);
      const workLog = await getEditableWorkLog(
        ctx.db,
        userId,
        input.workLogPublicId,
      );

      const result = await workLogRepo.softDelete(ctx.db, {
        workLogId: workLog.id,
        deletedBy: userId,
      });

      if (!result)
        throw new TRPCError({
          message: `Failed to delete work log`,
          code: "INTERNAL_SERVER_ERROR",
        });

      return result;
    }),
});
