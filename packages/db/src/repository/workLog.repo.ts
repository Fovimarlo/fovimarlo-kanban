import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import { workLogs } from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

export const getAllByWorkspaceAndDateRange = (
  db: dbClient,
  args: {
    workspaceId: number;
    dateFrom: string;
    dateTo: string;
    memberId?: number;
  },
) => {
  return db.query.workLogs.findMany({
    columns: {
      publicId: true,
      memberId: true,
      date: true,
      content: true,
      durationMinutes: true,
      createdAt: true,
      updatedAt: true,
    },
    with: {
      member: {
        columns: {
          publicId: true,
          email: true,
        },
        with: {
          user: {
            columns: {
              name: true,
              email: true,
              image: true,
            },
          },
        },
      },
      board: {
        columns: {
          publicId: true,
          name: true,
        },
      },
    },
    where: and(
      eq(workLogs.workspaceId, args.workspaceId),
      gte(workLogs.date, args.dateFrom),
      lte(workLogs.date, args.dateTo),
      isNull(workLogs.deletedAt),
      args.memberId ? eq(workLogs.memberId, args.memberId) : undefined,
    ),
    orderBy: [asc(workLogs.date), asc(workLogs.createdAt), asc(workLogs.id)],
  });
};

export const getByPublicId = (db: dbClient, workLogPublicId: string) => {
  return db.query.workLogs.findFirst({
    columns: {
      id: true,
      workspaceId: true,
      memberId: true,
    },
    where: and(
      eq(workLogs.publicId, workLogPublicId),
      isNull(workLogs.deletedAt),
    ),
  });
};

export const create = async (
  db: dbClient,
  input: {
    workspaceId: number;
    memberId: number;
    boardId: number | null;
    date: string;
    content: string;
    durationMinutes: number | null;
    createdBy: string;
  },
) => {
  const [result] = await db
    .insert(workLogs)
    .values({
      publicId: generateUID(),
      workspaceId: input.workspaceId,
      memberId: input.memberId,
      boardId: input.boardId,
      date: input.date,
      content: input.content,
      durationMinutes: input.durationMinutes,
      createdBy: input.createdBy,
    })
    .returning({ publicId: workLogs.publicId });

  return result;
};

export const update = async (
  db: dbClient,
  workLogId: number,
  input: {
    content?: string;
    durationMinutes?: number | null;
    boardId?: number | null;
    date?: string;
  },
) => {
  const [result] = await db
    .update(workLogs)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(workLogs.id, workLogId), isNull(workLogs.deletedAt)))
    .returning({ publicId: workLogs.publicId });

  return result;
};

export const softDelete = async (
  db: dbClient,
  args: { workLogId: number; deletedBy: string },
) => {
  const [result] = await db
    .update(workLogs)
    .set({ deletedAt: new Date(), deletedBy: args.deletedBy })
    .where(and(eq(workLogs.id, args.workLogId), isNull(workLogs.deletedAt)))
    .returning({ publicId: workLogs.publicId });

  return result;
};
