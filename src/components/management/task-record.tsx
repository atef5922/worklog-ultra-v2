import { formatDateInDhaka } from "@/lib/utils";
import { TaskCommentsButton } from "@/components/dashboard/task-comments";
import {personalOrScopedTasks, type AccessActor} from '@/lib/auth/policy';
import {db} from '@/lib/db';
import {taskActivityDisplay} from '@/lib/management/task-activity-display';
import {readChecklist} from '@/lib/management/task-insights';
import {getReadableTaskDescription} from '@/lib/report-summary';
import {projectTaskTimers} from '@/lib/task-timer-projection';
import {formatDateTimeInDhaka, toDateOnly} from '@/lib/utils';
import {
  Activity,
  CalendarDays,
  Circle,
  Flag,
  History,
  ListChecks,
  CheckCircle2,
  ChevronDown,
  Clock3,
  PencilLine,
  RotateCcw,
  StickyNote,
} from 'lucide-react';
import {notFound} from 'next/navigation';
import styles from './task-activity-log.module.css';

function formatDuration(minutes: number) {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  return hours ? [hours + ' hr', remainder ? remainder + ' min' : ''].filter(Boolean).join(' ') : total + ' min';
}

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

  const statusLabel = (status: string) => status === 'done' ? 'Completed' : status === 'in_progress' ? 'In progress' : 'Pending';
  // Keep the query chronological for current status; display history newest first.
  const dailyRecords = [...task.updates].reverse();
  const completionEvents = [...task.activityEvents].reverse();
  const currentStatus = task.updates.at(-1)?.status ?? 'pending';
  const trackedTime = formatDuration(task.updates.reduce((sum, update) => sum + update.trackedMinutes, 0));
  const completedItems = checklist.filter((item) => item.done).length;
  const timeOnly = (date: Date) => new Intl.DateTimeFormat('en-US', {timeZone: 'Asia/Dhaka', hour: 'numeric', minute: '2-digit', hour12: true}).format(date);
  const renderTime = (date: Date | null, workday: Date) => date ? (
    <time dateTime={date.toISOString()} title={fmt(date)} aria-label={fmt(date)} className={styles.timestamp}>
      <span>{timeOnly(date)}</span>
      {toDateOnly(date) !== toDateOnly(workday) && <small>{formatDateInDhaka(date)}</small>}
    </time>
  ) : <span className={styles.muted}>Not set</span>;

  return (
    <div className={styles.page} data-fit-viewport data-task-record>
      <section className={card + ' ' + styles.summaryCard} aria-labelledby="task-title">
        <div className={styles.summaryTop}>
          <div className={styles.taskIntro}>
            <h1 id="task-title" className={styles.title}>{task.taskTitle}</h1>
            <p className={styles.description}>{getReadableTaskDescription(task.taskDescription) || 'No description added.'}</p>
            <div className={styles.badges}>
              <span className={styles.status} data-status={currentStatus}><span />{statusLabel(currentStatus)}</span>
              <span className={styles.priority} data-priority={task.priority}><Flag size={12} aria-hidden="true" />{task.priority} priority</span>
              <span className={styles.planned}><CalendarDays size={15} aria-hidden="true" /><span>Planned date</span><time dateTime={toDateOnly(task.planDate)}>{formatDateInDhaka(task.planDate)}</time></span>
            </div>
          </div>
          <div className={styles.summaryAside}>
            {canComment && <TaskCommentsButton taskId={task.id} taskTitle={task.taskTitle} />}
            <div className={styles.trackedTime}>
              <span>Tracked</span>
              <strong>{trackedTime}</strong>
              {!!task.estimatedMinutes && <small>Est. {formatDuration(task.estimatedMinutes)}</small>}
            </div>
          </div>
        </div>
        <dl className={styles.metadataGrid}>
          {[
            ['Owner', task.user.name],
            ['Department', task.department.name],
            ['Assigned by', task.assigner?.name ?? 'Self'],
            ['Project', task.projectName || 'Not set'],
            ['Client', task.clientName || 'Not set'],
            ['Deadline', fmt(task.dueAt)],
            ['Created', fmt(task.createdAt)],
            ['Task ID', task.id],
          ].map(([label, value]) => (
            <div key={label} className={label === 'Task ID' ? styles.taskId : undefined}>
              <dt>{label}</dt><dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={card + ' ' + styles.recordsCard} aria-labelledby="daily-records-title">
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeading}><span className={styles.icon}><CalendarDays size={16} aria-hidden="true" /></span><h2 id="daily-records-title">Daily work records</h2></div>
          <span className={styles.count}>{task.updates.length} {task.updates.length === 1 ? 'record' : 'records'}<span className={styles.orderHint}> · Latest first</span></span>
        </div>
        <div className={styles.tableScroll} role="region" aria-label="Daily work records" tabIndex={0}>
          <table className={styles.table}>
            <thead><tr>{['Workday', 'Status', 'Start', 'End / pause', 'Tracked', 'Note'].map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr></thead>
            <tbody>
              {dailyRecords.map((update) => (
                <tr key={update.id}>
                  <td><time className={styles.workday} dateTime={update.reportDate.toISOString()}>{formatDateInDhaka(update.reportDate)}</time></td>
                  <td><span className={styles.status} data-status={update.status}><span />{statusLabel(update.status)}</span></td>
                  <td>{renderTime(update.actualStart, update.reportDate)}</td>
                  <td>{renderTime(update.actualEnd, update.reportDate)}</td>
                  <td><span className={styles.duration}>{formatDuration(update.trackedMinutes)}</span></td>
                  <td className={styles.note}>{update.note || <span className={styles.muted}>No note</span>}</td>
                </tr>
              ))}
              {!task.updates.length && <tr><td colSpan={6}><div className={styles.emptyState}><Clock3 size={22} aria-hidden="true" /><p>No daily work records yet.</p></div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className={styles.sideRail}>
        <section className={card + ' ' + styles.historyCard} aria-labelledby="completion-history-title">
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeading}><span className={styles.icon}><History size={16} aria-hidden="true" /></span><h2 id="completion-history-title">Completion history</h2></div>
            <span className={styles.count}>{task.activityEvents.length} {task.activityEvents.length === 1 ? 'event' : 'events'}<span className={styles.orderHint}> · Latest first</span></span>
          </div>
          <div className={styles.historyList} role="region" aria-label="Completion and reopen history" tabIndex={0}>
            {completionEvents.map((event) => (
              <article className={styles.cycleEvent} data-completed={event.eventType === 'completed'} key={event.id}>
                <span className={styles.cycleIcon}>{event.eventType === 'completed' ? <CheckCircle2 size={15} aria-hidden="true" /> : <RotateCcw size={15} aria-hidden="true" />}</span>
                <div className={styles.cycleContent}>
                  <div className={styles.cycleTitle}><h3>{event.eventType === 'completed' ? 'Completed' : 'Reopened'}</h3><span>Cycle {event.cycle}</span></div>
                  <time dateTime={event.createdAt.toISOString()}>{fmt(event.createdAt)}</time>
                  <div className={styles.cycleMeta}><span>{event.actor?.name ?? 'System'}</span><span title="Tracked time at this event">{formatDuration(event.trackedMinutes)}</span></div>
                  {(event.reason || event.note) && <p className={styles.cycleNote}>{event.reason || event.note}</p>}
                </div>
              </article>
            ))}
            {!task.activityEvents.length && <div className={styles.emptyState}><History size={22} aria-hidden="true" /><p>No completion events yet.</p><small>Earlier work is available in daily records.</small></div>}
          </div>
        </section>

        <section className={card + ' ' + styles.checklistCard} data-empty={!checklist.length} aria-labelledby="checklist-title">
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeading}><span className={styles.icon}><ListChecks size={16} aria-hidden="true" /></span><h2 id="checklist-title">Checklist / subtasks</h2></div>
            <span className={styles.count}>{checklist.length ? `${completedItems} / ${checklist.length}` : "No items"}</span>
          </div>
          {checklist.length > 0 && <div className={styles.cardBodyScroll} role="region" aria-label="Checklist items" tabIndex={0}>
            {checklist.map((item) => (
              <div className={styles.checklistItem} data-done={item.done} key={item.id}>
                {item.done ? <CheckCircle2 size={16} aria-label="Completed" /> : <Circle size={16} aria-label="Open" />}<span>{item.title}</span>
              </div>
            ))}
          </div>}
        </section>
      </div>

      <details className={card + ' ' + styles.activityLog} data-task-activity-log>
        <summary>
          <span className={styles.icon}><Activity aria-hidden="true" size={16} /></span>
          <span className={styles.activityLabel}><strong>Task activity log</strong><span>{activityEntries.length ? activityEntries.length + ' recorded event' + (activityEntries.length === 1 ? '' : 's') + ' · Latest first' : 'No activity recorded yet'}</span></span>
          <ChevronDown aria-hidden="true" className={styles.chevron} size={18} />
        </summary>
        {activityEntries.length > 0 && (
          <div className={styles.eventList}>
            {renderTimeline(activityEntries.slice(0, 5))}
            {activityEntries.length > 5 && <details className={styles.olderEvents}><summary>View {activityEntries.length - 5} older event{activityEntries.length - 5 === 1 ? '' : 's'}</summary><div>{renderTimeline(activityEntries.slice(5))}</div></details>}
          </div>
        )}
      </details>
    </div>
  );
}
