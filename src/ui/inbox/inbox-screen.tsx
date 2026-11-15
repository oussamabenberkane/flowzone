"use client";

/**
 * The Inbox: open tasks that have no project yet. Capture happens from the top bar (quick add),
 * so this screen only has to show what is waiting and let the person work through it.
 */
import { useState } from "react";
import type { TaskPage, TaskView } from "@/shared/views";
import { api, messageFor } from "@/ui/api/client";
import { listInbox } from "@/ui/api/resources";
import { useQuery } from "@/ui/data/query";
import { useQuickAdd } from "@/ui/shell/quick-add";
import { Button, EmptyState, LoadingLine, Notice, ScreenTitle } from "@/ui/primitives";
import { TaskRow } from "@/ui/tasks/task-row";
import { useToday } from "@/ui/today/today-data";

const PAGE = 50;

/** Pages after the first, tied to the first page they were loaded after. A refresh drops them. */
interface MorePages {
  basedOn: unknown;
  tasks: TaskView[];
  hasMore: boolean;
}

export function InboxScreen() {
  const today = useToday();
  const quickAdd = useQuickAdd();
  const first = useQuery("inbox", () => listInbox(0));
  const [more, setMore] = useState<MorePages | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const extraTasks = more && more.basedOn === first.data ? more.tasks : [];
  const tasks = [...(first.data?.tasks ?? []), ...extraTasks];
  const hasMore =
    more && more.basedOn === first.data ? more.hasMore : (first.data?.hasMore ?? false);

  async function loadMore() {
    setLoadingMore(true);
    setProblem(null);
    try {
      const page = await api.get<TaskPage>("/api/inbox", { limit: PAGE, offset: tasks.length });
      setMore({
        basedOn: first.data,
        tasks: [...extraTasks, ...page.tasks],
        hasMore: page.hasMore,
      });
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <ScreenTitle
        title="Inbox"
        detail={
          tasks.length === 0 && first.status === "ready"
            ? undefined
            : "Everything not yet in a project."
        }
        actions={
          <Button variant="line" small onClick={() => quickAdd.open()}>
            Capture something
          </Button>
        }
      />

      {first.status === "loading" && !first.data ? (
        <LoadingLine label="Opening your Inbox…" />
      ) : null}
      {first.status === "error" ? <Notice role="alert">{messageFor(first.error)}</Notice> : null}

      {first.status === "ready" && tasks.length === 0 ? (
        <EmptyState title="Nothing in your Inbox.">
          New tasks land here unless you give them a project. Capture one whenever it comes to mind.
        </EmptyState>
      ) : null}

      {tasks.length > 0 ? (
        <ul className="fz-list" data-testid="inbox-list">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} today={today} testId="inbox-task" />
          ))}
        </ul>
      ) : null}

      {hasMore ? (
        <div style={{ marginTop: "var(--space-4)" }}>
          <Button variant="line" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Show more"}
          </Button>
        </div>
      ) : null}
      {problem ? <Notice role="alert">{problem}</Notice> : null}
    </>
  );
}
