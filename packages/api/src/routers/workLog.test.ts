import { beforeEach, describe, expect, it, vi } from "vitest";

import * as boardRepo from "@kan/db/repository/board.repo";
import * as permissionRepo from "@kan/db/repository/permission.repo";
import * as workLogRepo from "@kan/db/repository/workLog.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";

import { workLogRouter } from "./workLog";

vi.mock("@kan/db/repository/workLog.repo", () => ({
  create: vi.fn(),
  getAllByWorkspaceAndDateRange: vi.fn(),
  getByPublicId: vi.fn(),
  softDelete: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@kan/db/repository/workspace.repo", () => ({
  getByPublicId: vi.fn(),
  getMemberByPublicId: vi.fn(),
}));
vi.mock("@kan/db/repository/permission.repo", () => ({
  getMemberWithRole: vi.fn(),
}));
vi.mock("@kan/db/repository/board.repo", () => ({
  getWorkspaceAndBoardIdByBoardPublicId: vi.fn(),
}));

const workspacePublicId = "workspace-123";
const workLogPublicId = "worklog-1234";
const boardPublicId = "board-123456";

const caller = workLogRouter.createCaller({
  user: { id: "user-123", name: "Test User", email: "test@example.com" },
  db: {},
} as never);

const mockMember = (id: number, role: "admin" | "member" = "member") =>
  vi.mocked(permissionRepo.getMemberWithRole).mockResolvedValue({
    id,
    publicId: `member-${id}`.padEnd(12, "0"),
    role,
    roleId: null,
  });

const entry = (memberId: number) => ({
  publicId: `entry-${memberId}`.padEnd(12, "0"),
  memberId,
  date: "2026-11-16",
  content: "Worked on the launch",
  durationMinutes: 90,
  createdAt: new Date(),
  updatedAt: null,
  member: {
    publicId: `member-${memberId}`.padEnd(12, "0"),
    email: "a@example.com",
    user: null,
  },
  board: null,
});

describe("workLog router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(workspaceRepo.getByPublicId).mockResolvedValue({
      id: 1,
      publicId: workspacePublicId,
      name: "Workspace",
      plan: "free",
      slug: "workspace",
      deletedAt: null,
      createdBy: "user-123",
    });
  });

  it("rejects users who are not members of the workspace", async () => {
    vi.mocked(permissionRepo.getMemberWithRole).mockResolvedValue(undefined);

    await expect(
      caller.list({
        workspacePublicId,
        dateFrom: "2026-11-16",
        dateTo: "2026-11-16",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(workLogRepo.getAllByWorkspaceAndDateRange).not.toHaveBeenCalled();
  });

  it("rejects date ranges that are reversed or too long", async () => {
    mockMember(5);

    await expect(
      caller.list({
        workspacePublicId,
        dateFrom: "2026-11-16",
        dateTo: "2026-11-15",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.list({
        workspacePublicId,
        dateFrom: "2026-01-01",
        dateTo: "2026-12-31",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("marks only the caller's own entries as editable", async () => {
    mockMember(5);
    vi.mocked(workLogRepo.getAllByWorkspaceAndDateRange).mockResolvedValue([
      entry(5),
      entry(6),
    ]);

    const result = await caller.list({
      workspacePublicId,
      dateFrom: "2026-11-16",
      dateTo: "2026-11-16",
    });

    expect(result.map((item) => item.canEdit)).toEqual([true, false]);
    expect(result[0]).not.toHaveProperty("memberId");
  });

  it("lets admins edit every entry", async () => {
    mockMember(5, "admin");
    vi.mocked(workLogRepo.getAllByWorkspaceAndDateRange).mockResolvedValue([
      entry(6),
    ]);

    const result = await caller.list({
      workspacePublicId,
      dateFrom: "2026-11-16",
      dateTo: "2026-11-16",
    });

    expect(result[0]?.canEdit).toBe(true);
  });

  it("creates an entry for the caller's membership", async () => {
    mockMember(5);
    vi.mocked(workLogRepo.create).mockResolvedValue({
      publicId: workLogPublicId,
    });

    await caller.create({
      workspacePublicId,
      date: "2026-11-16",
      content: "  Prepared the campaign brief  ",
      durationMinutes: 60,
    });

    expect(workLogRepo.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workspaceId: 1,
        memberId: 5,
        boardId: null,
        content: "Prepared the campaign brief",
        durationMinutes: 60,
        createdBy: "user-123",
      }),
    );
  });

  it("rejects a board from another workspace", async () => {
    mockMember(5);
    vi.mocked(
      boardRepo.getWorkspaceAndBoardIdByBoardPublicId,
    ).mockResolvedValue({
      id: 9,
      workspaceId: 2,
      createdBy: null,
      backgroundImageKey: null,
    });

    await expect(
      caller.create({
        workspacePublicId,
        date: "2026-11-16",
        content: "Logo revisions",
        boardPublicId,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(workLogRepo.create).not.toHaveBeenCalled();
  });

  it("forbids members from deleting someone else's entry", async () => {
    vi.mocked(workLogRepo.getByPublicId).mockResolvedValue({
      id: 3,
      workspaceId: 1,
      memberId: 6,
    });
    mockMember(5);

    await expect(caller.delete({ workLogPublicId })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(workLogRepo.softDelete).not.toHaveBeenCalled();
  });

  it("allows members to update their own entry", async () => {
    vi.mocked(workLogRepo.getByPublicId).mockResolvedValue({
      id: 3,
      workspaceId: 1,
      memberId: 5,
    });
    mockMember(5);
    vi.mocked(workLogRepo.update).mockResolvedValue({
      publicId: workLogPublicId,
    });

    await caller.update({
      workLogPublicId,
      content: "Updated",
      durationMinutes: null,
    });

    expect(workLogRepo.update).toHaveBeenCalledWith(expect.anything(), 3, {
      date: undefined,
      content: "Updated",
      durationMinutes: null,
      boardId: undefined,
    });
  });
});
