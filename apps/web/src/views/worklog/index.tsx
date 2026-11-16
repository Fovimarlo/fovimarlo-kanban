import Link from "next/link";
import { plural, t } from "@lingui/core/macro";
import { addDays, format, isToday, startOfWeek } from "date-fns";
import { useMemo, useState } from "react";
import {
  HiChevronLeft,
  HiChevronRight,
  HiOutlineClock,
  HiOutlinePencil,
  HiOutlineTrash,
} from "react-icons/hi2";
import { twMerge } from "tailwind-merge";

import { authClient } from "@kan/auth/client";

import type { WorkLogFormValues } from "./components/WorkLogEntryForm";
import type { RouterOutputs } from "~/utils/api";
import Avatar from "~/components/Avatar";
import Button from "~/components/Button";
import { PageHead } from "~/components/PageHead";
import { useLocalisation } from "~/hooks/useLocalisation";
import { usePopup } from "~/providers/popup";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";
import { formatMemberDisplayName, getAvatarUrl } from "~/utils/helpers";
import { WorkLogEntryForm } from "./components/WorkLogEntryForm";
import { formatDuration, fromDateKey, toDateKey } from "./utils";

type WorkLogEntry = RouterOutputs["workLog"]["list"][number];
type RangeMode = "day" | "week";

interface MemberGroup {
  memberPublicId: string;
  name: string;
  email: string;
  image: string | null;
  entries: WorkLogEntry[];
  totalMinutes: number;
}

const selectClassName =
  "block rounded-md border-0 bg-white/5 py-1.5 pl-3 pr-8 text-sm text-neutral-900 shadow-sm ring-1 ring-inset ring-light-600 focus:ring-2 focus:ring-inset focus:ring-light-700 dark:text-dark-1000 dark:ring-dark-700 dark:focus:ring-dark-700";

export default function WorkLogView() {
  const { workspace } = useWorkspace();
  // Admins see everyone's logs; other members only see their own (enforced by the API too)
  const isAdmin = workspace.role === "admin";
  const { dateLocale } = useLocalisation();
  const { showPopup } = usePopup();
  const { data: session } = authClient.useSession();
  const utils = api.useUtils();

  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [mode, setMode] = useState<RangeMode>("day");
  const [memberFilter, setMemberFilter] = useState("");
  const [editingPublicId, setEditingPublicId] = useState<string | null>(null);
  const [confirmDeletePublicId, setConfirmDeletePublicId] = useState<
    string | null
  >(null);

  const enabled = !!workspace.publicId && workspace.publicId.length >= 12;
  const date = fromDateKey(selectedDate);

  const range = useMemo(() => {
    if (mode === "day") return { from: selectedDate, to: selectedDate };
    const start = startOfWeek(fromDateKey(selectedDate), {
      weekStartsOn: workspace.weekStartDay,
    });
    return { from: toDateKey(start), to: toDateKey(addDays(start, 6)) };
  }, [mode, selectedDate, workspace.weekStartDay]);

  const listInput = {
    workspacePublicId: workspace.publicId,
    dateFrom: range.from,
    dateTo: range.to,
    memberPublicId: memberFilter || undefined,
  };

  const { data: entries, isLoading } = api.workLog.list.useQuery(listInput, {
    enabled,
  });
  const { data: workspaceData } = api.workspace.byId.useQuery(
    { workspacePublicId: workspace.publicId },
    { enabled },
  );
  const { data: boards } = api.board.all.useQuery(
    { workspacePublicId: workspace.publicId, type: "regular" },
    { enabled },
  );

  const onError = () =>
    showPopup({
      header: t`Something went wrong`,
      message: t`Please try again later, or contact customer support.`,
      icon: "error",
    });
  const refresh = () => utils.workLog.list.invalidate();

  const createWorkLog = api.workLog.create.useMutation({
    onSuccess: refresh,
    onError,
  });
  const updateWorkLog = api.workLog.update.useMutation({
    onSuccess: async () => {
      setEditingPublicId(null);
      await refresh();
    },
    onError,
  });
  const deleteWorkLog = api.workLog.delete.useMutation({
    onSuccess: async () => {
      setConfirmDeletePublicId(null);
      await refresh();
    },
    onError,
  });

  const activeMembers = useMemo(
    () =>
      (workspaceData?.members ?? []).filter(
        (member) => member.status === "active",
      ),
    [workspaceData],
  );
  const currentMemberPublicId = activeMembers.find(
    (member) => member.user?.id && member.user.id === session?.user.id,
  )?.publicId;

  const groups = useMemo(() => {
    const byMember = new Map<string, MemberGroup>();
    for (const entry of entries ?? []) {
      const group = byMember.get(entry.member.publicId) ?? {
        memberPublicId: entry.member.publicId,
        name: formatMemberDisplayName(
          entry.member.user?.name ?? null,
          entry.member.user?.email ?? entry.member.email,
        ),
        email: entry.member.user?.email ?? entry.member.email,
        image: entry.member.user?.image ?? null,
        entries: [],
        totalMinutes: 0,
      };
      group.entries.push(entry);
      group.totalMinutes += entry.durationMinutes ?? 0;
      byMember.set(entry.member.publicId, group);
    }
    // Current user first, then alphabetically
    return [...byMember.values()].sort((a, b) => {
      if (a.memberPublicId === currentMemberPublicId) return -1;
      if (b.memberPublicId === currentMemberPublicId) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [entries, currentMemberPublicId]);

  const membersWithoutEntries = useMemo(() => {
    if (!isAdmin || memberFilter || !entries) return [];
    const logged = new Set(entries.map((entry) => entry.member.publicId));
    return activeMembers.filter((member) => !logged.has(member.publicId));
  }, [activeMembers, entries, memberFilter, isAdmin]);

  const totalMinutes = groups.reduce((sum, g) => sum + g.totalMinutes, 0);

  const shiftDate = (direction: 1 | -1) =>
    setSelectedDate(
      toDateKey(addDays(date, direction * (mode === "week" ? 7 : 1))),
    );

  const rangeLabel =
    mode === "day"
      ? format(date, "EEEE, d MMMM yyyy", { locale: dateLocale })
      : `${format(fromDateKey(range.from), "d MMM", { locale: dateLocale })} – ${format(fromDateKey(range.to), "d MMM yyyy", { locale: dateLocale })}`;

  const handleCreate = (values: WorkLogFormValues) =>
    createWorkLog.mutateAsync({
      workspacePublicId: workspace.publicId,
      date: selectedDate,
      ...values,
    });

  const renderEntry = (entry: WorkLogEntry) => {
    if (editingPublicId === entry.publicId) {
      return (
        <li key={entry.publicId} className="px-4 py-3">
          <WorkLogEntryForm
            boards={boards ?? []}
            initialValues={{
              content: entry.content,
              durationMinutes: entry.durationMinutes,
              boardPublicId: entry.board?.publicId ?? null,
            }}
            isSubmitting={updateWorkLog.isPending}
            submitLabel={t`Save`}
            autoFocus
            onCancel={() => setEditingPublicId(null)}
            onSubmit={(values) =>
              updateWorkLog.mutateAsync({
                workLogPublicId: entry.publicId,
                ...values,
              })
            }
          />
        </li>
      );
    }

    return (
      <li
        key={entry.publicId}
        className="group flex items-start gap-3 bg-light-50 px-4 py-3 dark:bg-dark-50"
      >
        <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm text-light-1000 dark:text-dark-1000">
          {entry.content}
        </p>
        <div className="flex flex-shrink-0 items-center gap-2">
          {entry.board && (
            <Link
              href={`/boards/${entry.board.publicId}`}
              className="hidden max-w-[10rem] truncate rounded-full bg-light-200 px-2 py-0.5 text-xs text-light-1000 hover:underline dark:bg-dark-200 dark:text-dark-1000 sm:inline"
            >
              {entry.board.name}
            </Link>
          )}
          {entry.durationMinutes != null && (
            <span className="flex items-center gap-1 text-xs text-light-900 dark:text-dark-900">
              <HiOutlineClock className="h-4 w-4" />
              {formatDuration(entry.durationMinutes)}
            </span>
          )}
          {entry.canEdit &&
            (confirmDeletePublicId === entry.publicId ? (
              <div className="flex items-center gap-1">
                <Button
                  size="xs"
                  variant="danger"
                  isLoading={deleteWorkLog.isPending}
                  onClick={() =>
                    deleteWorkLog.mutate({ workLogPublicId: entry.publicId })
                  }
                >
                  {t`Delete`}
                </Button>
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => setConfirmDeletePublicId(null)}
                >
                  {t`Cancel`}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => setEditingPublicId(entry.publicId)}
                  className="rounded p-1 text-light-900 hover:bg-light-200 dark:text-dark-900 dark:hover:bg-dark-200"
                  aria-label={t`Edit entry`}
                >
                  <HiOutlinePencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeletePublicId(entry.publicId)}
                  className="rounded p-1 text-light-900 hover:bg-light-200 dark:text-dark-900 dark:hover:bg-dark-200"
                  aria-label={t`Delete entry`}
                >
                  <HiOutlineTrash className="h-4 w-4" />
                </button>
              </div>
            ))}
        </div>
      </li>
    );
  };

  const renderEntries = (groupEntries: WorkLogEntry[]) => {
    if (mode === "day") {
      return (
        <ul className="flex flex-col divide-y divide-light-300 overflow-hidden rounded-lg border border-light-300 dark:divide-dark-300 dark:border-dark-300">
          {groupEntries.map(renderEntry)}
        </ul>
      );
    }

    const byDate = new Map<string, WorkLogEntry[]>();
    for (const entry of groupEntries) {
      byDate.set(entry.date, [...(byDate.get(entry.date) ?? []), entry]);
    }
    return (
      <div className="flex flex-col gap-3">
        {[...byDate].map(([day, dayEntries]) => (
          <div key={day}>
            <p className="mb-1 text-xs font-medium text-light-900 dark:text-dark-900">
              {format(fromDateKey(day), "EEEE, d MMM", { locale: dateLocale })}
            </p>
            <ul className="flex flex-col divide-y divide-light-300 overflow-hidden rounded-lg border border-light-300 dark:divide-dark-300 dark:border-dark-300">
              {dayEntries.map(renderEntry)}
            </ul>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <PageHead title={t`Daily log | ${workspace.name}`} />
      <div className="m-auto h-full max-w-[1100px] p-8 px-5 md:px-28 md:py-12">
        <div className="mb-6 flex w-full flex-wrap items-center justify-between gap-3">
          <h1 className="font-bold tracking-tight text-neutral-900 dark:text-dark-1000 sm:text-[1.2rem]">
            {t`Daily log`}
          </h1>
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-md ring-1 ring-inset ring-light-600 dark:ring-dark-700">
              {(["day", "week"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  aria-pressed={mode === value}
                  className={twMerge(
                    "px-3 py-1.5 text-xs font-medium text-light-900 dark:text-dark-900",
                    mode === value &&
                      "bg-light-200 text-light-1000 dark:bg-dark-200 dark:text-dark-1000",
                  )}
                >
                  {value === "day" ? t`Day` : t`Week`}
                </button>
              ))}
            </div>
            {isAdmin && (
              <select
                value={memberFilter}
                onChange={(e) => setMemberFilter(e.target.value)}
                aria-label={t`Filter by person`}
                className={selectClassName}
              >
                <option value="">{t`Everyone`}</option>
                {activeMembers.map((member) => (
                  <option key={member.publicId} value={member.publicId}>
                    {formatMemberDisplayName(
                      member.user?.name ?? null,
                      member.user?.email ?? member.email ?? null,
                    )}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="mb-8 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => shiftDate(-1)}
            className="rounded-md p-1.5 text-light-900 hover:bg-light-200 dark:text-dark-900 dark:hover:bg-dark-200"
            aria-label={mode === "day" ? t`Previous day` : t`Previous week`}
          >
            <HiChevronLeft className="h-5 w-5" />
          </button>
          <span className="min-w-[14rem] text-center text-sm font-semibold capitalize text-light-1000 dark:text-dark-1000">
            {rangeLabel}
          </span>
          <button
            type="button"
            onClick={() => shiftDate(1)}
            className="rounded-md p-1.5 text-light-900 hover:bg-light-200 dark:text-dark-900 dark:hover:bg-dark-200"
            aria-label={mode === "day" ? t`Next day` : t`Next week`}
          >
            <HiChevronRight className="h-5 w-5" />
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
            aria-label={t`Pick a date`}
            className={selectClassName}
          />
          {!isToday(date) && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSelectedDate(toDateKey(new Date()))}
            >
              {t`Today`}
            </Button>
          )}
          {totalMinutes > 0 && (
            <span className="ml-auto flex items-center gap-1 text-sm text-light-900 dark:text-dark-900">
              <HiOutlineClock className="h-4 w-4" />
              {t`Total: ${formatDuration(totalMinutes)}`}
            </span>
          )}
        </div>

        <section className="mb-10 rounded-lg border border-light-300 bg-light-50 p-4 dark:border-dark-300 dark:bg-dark-50">
          <h2 className="mb-3 text-sm font-semibold text-light-1000 dark:text-dark-1000">
            {t`Add to my log for ${format(date, "d MMMM", { locale: dateLocale })}`}
          </h2>
          <WorkLogEntryForm
            boards={boards ?? []}
            isSubmitting={createWorkLog.isPending}
            submitLabel={t`Add entry`}
            onSubmit={handleCreate}
          />
          <p className="mt-2 text-xs text-light-800 dark:text-dark-800">
            {t`Tip: press Cmd/Ctrl + Enter to save.`}
          </p>
        </section>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-lg bg-light-200 dark:bg-dark-200"
              />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <p className="text-sm text-light-900 dark:text-dark-900">
            {mode === "day"
              ? t`Nothing has been logged for this day yet.`
              : t`Nothing has been logged for this week yet.`}
          </p>
        ) : (
          <div className="flex flex-col gap-8">
            {groups.map((group) => (
              <section key={group.memberPublicId}>
                <div className="mb-2 flex items-center gap-2">
                  <Avatar
                    size="sm"
                    name={group.name}
                    email={group.email}
                    imageUrl={
                      group.image ? getAvatarUrl(group.image) : undefined
                    }
                  />
                  <span className="text-sm font-semibold text-light-1000 dark:text-dark-1000">
                    {group.name}
                    {group.memberPublicId === currentMemberPublicId &&
                      ` (${t`you`})`}
                  </span>
                  <span className="text-xs text-light-900 dark:text-dark-900">
                    {plural(group.entries.length, {
                      one: "# entry",
                      other: "# entries",
                    })}
                    {group.totalMinutes > 0 &&
                      ` · ${formatDuration(group.totalMinutes)}`}
                  </span>
                </div>
                {renderEntries(group.entries)}
              </section>
            ))}
          </div>
        )}

        {!isLoading && membersWithoutEntries.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-light-900 dark:text-dark-900">
              {t`No entries yet`}
            </h2>
            <div className="flex flex-wrap gap-2">
              {membersWithoutEntries.map((member) => {
                const name = formatMemberDisplayName(
                  member.user?.name ?? null,
                  member.user?.email ?? member.email ?? null,
                );
                return (
                  <button
                    key={member.publicId}
                    type="button"
                    onClick={() => setMemberFilter(member.publicId)}
                    className="flex items-center gap-2 rounded-full border border-light-300 py-1 pl-1 pr-3 text-xs text-light-1000 hover:bg-light-200 dark:border-dark-300 dark:text-dark-1000 dark:hover:bg-dark-200"
                  >
                    <Avatar
                      size="xs"
                      name={name}
                      email={member.user?.email ?? member.email ?? ""}
                      imageUrl={
                        member.user?.image
                          ? getAvatarUrl(member.user.image)
                          : undefined
                      }
                    />
                    {name}
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
