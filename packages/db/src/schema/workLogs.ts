import { relations } from "drizzle-orm";
import {
  bigint,
  bigserial,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { boards } from "./boards";
import { users } from "./users";
import { workspaceMembers, workspaces } from "./workspaces";

/**
 * Daily work log entries: what a workspace member worked on, on a given day.
 */
export const workLogs = pgTable(
  "work_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: varchar("publicId", { length: 12 }).notNull().unique(),
    workspaceId: bigint("workspaceId", { mode: "number" })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    memberId: bigint("memberId", { mode: "number" })
      .notNull()
      .references(() => workspaceMembers.id, { onDelete: "cascade" }),
    // Optional brand / board the work was done for
    boardId: bigint("boardId", { mode: "number" }).references(() => boards.id, {
      onDelete: "set null",
    }),
    // Calendar day of the work, stored without timezone ("YYYY-MM-DD")
    date: date("date", { mode: "string" }).notNull(),
    content: text("content").notNull(),
    durationMinutes: integer("durationMinutes"),
    createdBy: uuid("createdBy").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
    deletedAt: timestamp("deletedAt"),
    deletedBy: uuid("deletedBy").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("work_log_workspace_date_idx").on(table.workspaceId, table.date),
    index("work_log_member_date_idx").on(table.memberId, table.date),
  ],
).enableRLS();

export const workLogsRelations = relations(workLogs, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workLogs.workspaceId],
    references: [workspaces.id],
    relationName: "workLogWorkspace",
  }),
  member: one(workspaceMembers, {
    fields: [workLogs.memberId],
    references: [workspaceMembers.id],
    relationName: "workLogMember",
  }),
  board: one(boards, {
    fields: [workLogs.boardId],
    references: [boards.id],
    relationName: "workLogBoard",
  }),
}));
