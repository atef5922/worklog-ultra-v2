import { formatDateInDhaka } from "@/lib/utils";
import { TaskCommentsButton } from "@/components/dashboard/task-comments";
import {personalOrScopedTasks, type AccessActor} from '@/lib/auth/policy';
import {db} from '@/lib/db';
import {taskActivityDisplay} from '@/lib/management/task-activity-display';
import {readChecklist} from '@/lib/management/task-insights';
import {getReadableTaskDescription} from '@/lib/report-summary';
import {projectTaskTimers} from '@/lib/task-timer-projection';
import {formatDateTimeInDhaka, formatMinutes} from '@/lib/utils';
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  Clock3,
  PencilLine,
  RotateCcw,
  StickyNote,
} from 'lucide-react';
import {notFound} from 'next/navigation';
import styles from './task-activity-log.module.css';

export async function TaskRecord({actor, taskId}: {actor: AccessActor; taskId: string}) {
  const stored = await db.dailyTask.findFirst({
    where: {
      id: taskId,
      ...personalOrScopedTasks(actor, ['tasks.view', 'history.view']),
    },
    include: {
      timerStates: true,
      user: {select: {name: true}},
      department: {select: {name: true}},
      assigner: {select: {name: true}},
      updates: {orderBy: {reportDate: 'asc'}},
      activityEvents: {
        include: {actor: {select: {name: true}}},
        orderBy: {createdAt: 'asc'},
      },
      timelineEntries: {orderBy: {createdAt: 'asc'}},
    },
  });

  if (!stored) notFound();
  const canComment = stored.userId === actor.id || Boolean(await db.dailyTask.findFirst({
    where: { id: taskId, ...personalOrScopedTasks(actor, "tasks.view") },
    select: { id: true },
  }));

  const userIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const activityActorIds = [
    ...new Set(stored.timelineEntries.map((entry) => entry.actorId).filter((id) => userIdPattern.test(id))),
  ];
  const activityActors = activityActorIds.length
    ? await db.user.findMany({
        where: {id: {in: activityActorIds}},
        select: {id: true, name: true},
      })
    : [];
  const activityActorNames = new Map(activityActors.map((user) => [user.id, user.name]));
  const task = projectTaskTimers(stored);
  const fmt = (date: Date | null) => (date ? formatDateTimeInDhaka(date) : 'Not set');
  const card = styles.card;
  const checklist = readChecklist(task.checklist);
  const activityEntries = [...task.timelineEntries].reverse();
  const activityIcons = {
    timer: Clock3,
    change: PencilLine,
    complete: CheckCircle2,
    reopen: RotateCcw,
    note: StickyNote,
  };

  const renderTimeline = (entries: typeof activityEntries) =>
    entries.map((entry) => {
      const display = taskActivityDisplay(entry.eventType, entry.snapshot);
      const Icon = activityIcons[display.tone];

      return (
        <article className={styles.event} data-task-activity-event key={entry.id}>
          <span className={styles.icon}>
            <Icon aria-hidden="true" size={15} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="text-sm font-semibold">{display.title}</h3>
              <time
                className="text-xs text-[var(--muted-foreground)]"
                dateTime={entry.createdAt.toISOString()}
              >
                {fmt(entry.createdAt)}
              </time>
            </div>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Recorded by {activityActorNames.get(entry.actorId) ?? 'System'}
            </p>
            <p className="mt-2 text-sm">{entry.note || display.description}</p>
            {display.facts.length ? (
              <dl className={styles.facts}>
                {display.facts.map((fact) => (
                  <div className={styles.fact} key={fact.label + fact.value}>
                    <dt className="inline font-medium">{fact.label}: </dt>
                    <dd className="inline text-[var(--muted-foreground)]">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </article>
      );
    });

  return (
    <div className={styles.page} data-fit-viewport>
      <section className={card + ' ' + styles.summaryCard}>
        <p className="text-xs font-medium uppercase tracking-wide text-indigo-500">Task record</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">{task.taskTitle}</h1>{canComment && <TaskCommentsButton taskId={task.id} taskTitle={task.taskTitle} />}</div>
        <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--muted-foreground)]">
          {getReadableTaskDescription(task.taskDescription)}
        </p>
        <dl className={styles.metadataGrid}>
          {[
            ['Owner', task.user.name],
            ['Department', task.department.name],
            ['Assigned by', task.assigner?.name ?? 'Self'],
            ['Project', task.projectName ?? 'Not set'],
            ['Client', task.clientName ?? 'Not set'],
            ['Deadline', fmt(task.dueAt)],
            ['Estimated time', task.estimatedMinutes ? formatMinutes(task.estimatedMinutes) : 'Not set'],
            ['Priority', task.priority],
            ['Planned date', formatDateInDhaka(task.planDate)],
            ['Created', fmt(task.createdAt)],
            ['Current status', task.updates.at(-1)?.status ?? 'pending'],
            ['Tracked time', formatMinutes(task.updates.reduce((sum, update) => sum + update.trackedMinutes, 0))],
            ['Task ID', task.id],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-[var(--muted-foreground)]">{label}</dt>
              <dd className="mt-1 break-all">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={card + ' ' + styles.checklistCard}>
        <h2 className="font-semibold">Checklist / subtasks</h2>
        <div className={styles.cardBodyScroll}>
        {checklist.length ? (
          checklist.map((item) => (
            <p className="mt-2 text-sm" key={item.id}>
              <span className="mr-2 text-[var(--muted-foreground)]">{item.done ? 'Completed' : 'Open'}</span>
              {item.title}
            </p>
          ))
        ) : (
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">No checklist added.</p>
        )}
        </div>
      </section>

      <section className={card + ' ' + styles.recordsCard}>
        <h2 className="font-semibold">Daily work records</h2>
        <div className={styles.tableScroll}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {['Date', 'Status', 'Start', 'End / pause', 'Time', 'Note'].map((heading) => (
                  <th className="p-2" key={heading}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {task.updates.map((update) => (
                <tr className="border-t border-[var(--panel-border)]" key={update.id}>
                  <td className="p-2">{formatDateInDhaka(update.reportDate)}</td>
                  <td className="p-2">{update.status === 'done' ? 'Completed (100%)' : update.status}</td>
                  <td className="p-2">{fmt(update.actualStart)}</td>
                  <td className="p-2">{fmt(update.actualEnd)}</td>
                  <td className="p-2">{formatMinutes(update.trackedMinutes)}</td>
                  <td className="min-w-48 whitespace-pre-wrap p-2">{update.note ?? 'No note'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card + ' ' + styles.historyCard}>
        <h2 className="font-semibold">Completion and reopen history</h2>
        <div className={styles.historyList}>
        {task.activityEvents.map((event) => (
          <article className="mt-3 border-l-2 border-indigo-400 py-1 pl-4" key={event.id}>
            <p className="text-sm font-semibold">
              {event.eventType === 'completed' ? 'Completed' : 'Reopened'} / Cycle {event.cycle}
            </p>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              {fmt(event.createdAt)} / {event.actor?.name ?? 'System'} / {formatMinutes(event.trackedMinutes)}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm">
              {event.reason ?? event.note ?? 'No additional note'}
            </p>
          </article>
        ))}
        {!task.activityEvents.length ? (
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">
            No recorded completion events. Older task evidence remains in daily records above.
          </p>
        ) : null}
        </div>
      </section>

      <details className={card + ' ' + styles.activityLog} data-task-activity-log>
        <summary>
          <span className={styles.icon}><Activity aria-hidden="true" size={16} /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Task activity log</span>
            <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">
              {activityEntries.length
                ? activityEntries.length + ' recorded event' + (activityEntries.length === 1 ? '' : 's') + ' / Latest first'
                : 'No activity recorded yet'}
            </span>
          </span>
          <ChevronDown aria-hidden="true" className={styles.chevron} size={18} />
        </summary>
        {activityEntries.length ? (
          <div className={styles.eventList}>
            <p className="pb-1 pt-2 text-xs text-[var(--muted-foreground)]">
              Readable work history is shown here. Internal IDs and system versions remain securely stored but hidden.
            </p>
            {renderTimeline(activityEntries.slice(0, 5))}
            {activityEntries.length > 5 ? (
              <details className="border-t border-[var(--panel-border)] pt-3">
                <summary className="cursor-pointer text-sm font-medium text-indigo-600">
                  View {activityEntries.length - 5} older event{activityEntries.length - 5 === 1 ? '' : 's'}
                </summary>
                <div className="mt-2">{renderTimeline(activityEntries.slice(5))}</div>
              </details>
            ) : null}
          </div>
        ) : null}
      </details>
    </div>
  );
}
