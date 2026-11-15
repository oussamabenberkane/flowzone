"use client";

/**
 * Projects: a flat set of named areas (Work, Home). The list, and a single project with its open
 * tasks. Deleting a project keeps its tasks and notes; they simply lose the project name.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { messageFor } from "@/ui/api/client";
import {
  createProject,
  createTask,
  deleteProject,
  getProject,
  listProjects,
  listTasks,
  updateProject,
} from "@/ui/api/resources";
import { invalidate, useQuery } from "@/ui/data/query";
import { Button, EmptyState, LoadingLine, Notice, ScreenTitle, TextField } from "@/ui/primitives";
import { useToast } from "@/ui/toast";
import { TaskRow } from "@/ui/tasks/task-row";
import { refreshTaskViews } from "@/ui/tasks/task-actions";
import { useToday } from "@/ui/today/today-data";

export function ProjectsScreen() {
  const toast = useToast();
  const projects = useQuery("projects", listProjects);
  const [name, setName] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function add(event: FormEvent) {
    event.preventDefault();
    const value = name.trim();
    if (!value) return;
    setBusy(true);
    setProblem(null);
    try {
      await createProject({ name: value, clientRequestId: requestId });
      setName("");
      setRequestId(crypto.randomUUID());
      await invalidate("projects");
      toast.show(`Added ${value}`);
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  const list = projects.data?.projects ?? [];

  return (
    <>
      <ScreenTitle title="Projects" detail="Areas of your life, kept flat and simple." />

      <form
        onSubmit={add}
        className="fz-row"
        style={{ alignItems: "flex-end", marginBottom: "var(--space-6)" }}
      >
        <TextField
          label="New project"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          placeholder="For example, Home"
          data-testid="project-name-input"
        />
        <Button
          type="submit"
          variant="line"
          disabled={busy || !name.trim()}
          data-testid="project-add"
        >
          Add project
        </Button>
      </form>
      {problem ? <Notice role="alert">{problem}</Notice> : null}

      {projects.status === "loading" && !projects.data ? (
        <LoadingLine label="Getting your projects…" />
      ) : null}
      {projects.status === "ready" && list.length === 0 ? (
        <EmptyState title="No projects yet.">
          Projects are optional. Add one when a few tasks belong together.
        </EmptyState>
      ) : null}

      {list.length > 0 ? (
        <ul className="fz-list" data-testid="project-list">
          {list.map((project) => (
            <li key={project.id}>
              <Link href={`/projects/${project.id}`} className="fz-link-row">
                <span style={{ fontWeight: 600 }}>{project.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

export function ProjectScreen({ id }: { id: string }) {
  const project = useQuery(`project:${id}`, () => getProject(id));

  if (!project.data) {
    if (project.status === "error") {
      return (
        <EmptyState
          title="We couldn't find that project."
          action={
            <Link href="/projects" className="fz-button fz-button--small">
              Back to projects
            </Link>
          }
        >
          {messageFor(project.error)}
        </EmptyState>
      );
    }
    return <LoadingLine label="Opening the project…" />;
  }

  return <ProjectBody id={id} name={project.data.name} />;
}

function ProjectBody({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const toast = useToast();
  const today = useToday();
  const tasks = useQuery(`tasks:project:${id}`, () =>
    listTasks({ projectId: id, status: "open", limit: 200 }),
  );
  const [title, setTitle] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function addTask(event: FormEvent) {
    event.preventDefault();
    const value = title.trim();
    if (!value) return;
    setProblem(null);
    try {
      await createTask({ title: value, projectId: id, clientRequestId: requestId });
      setTitle("");
      setRequestId(crypto.randomUUID());
      await refreshTaskViews();
    } catch (error) {
      setProblem(messageFor(error));
    }
  }

  async function rename(event: FormEvent) {
    event.preventDefault();
    const value = newName.trim();
    if (!value || value === name) {
      setRenaming(false);
      return;
    }
    try {
      await updateProject(id, { name: value });
      await invalidate("projects", `project:${id}`);
      setRenaming(false);
      toast.show("Renamed.");
    } catch (error) {
      setProblem(messageFor(error));
    }
  }

  async function remove() {
    try {
      await deleteProject(id);
      await invalidate("projects", "inbox", "tasks", "notes", "today");
      toast.show(`Removed ${name}. Its tasks are still here.`);
      router.push("/projects");
    } catch (error) {
      setProblem(messageFor(error));
    }
  }

  const list = tasks.data?.tasks ?? [];

  return (
    <>
      <ScreenTitle
        title={name}
        detail={
          list.length === 0 && tasks.status === "ready" ? "Nothing open here yet." : undefined
        }
        actions={
          <Button variant="line" small onClick={() => setRenaming((value) => !value)}>
            {renaming ? "Cancel" : "Rename"}
          </Button>
        }
      />

      {renaming ? (
        <form
          onSubmit={rename}
          className="fz-row"
          style={{ alignItems: "flex-end", marginBottom: "var(--space-5)" }}
        >
          <TextField
            label="Project name"
            value={newName}
            maxLength={80}
            onChange={(event) => setNewName(event.target.value)}
          />
          <Button type="submit" disabled={!newName.trim()}>
            Save name
          </Button>
        </form>
      ) : null}

      <form
        onSubmit={addTask}
        className="fz-row"
        style={{ alignItems: "flex-end", marginBottom: "var(--space-5)" }}
      >
        <TextField
          label={`Add a task to ${name}`}
          value={title}
          maxLength={500}
          onChange={(event) => setTitle(event.target.value)}
          data-testid="project-task-input"
        />
        <Button type="submit" variant="line" disabled={!title.trim()}>
          Add task
        </Button>
      </form>
      {problem ? <Notice role="alert">{problem}</Notice> : null}

      {tasks.status === "loading" && !tasks.data ? <LoadingLine /> : null}
      {list.length > 0 ? (
        <ul className="fz-list" data-testid="project-tasks">
          {list.map((task) => (
            <TaskRow key={task.id} task={task} today={today} testId="project-task" />
          ))}
        </ul>
      ) : null}

      <section className="fz-section" aria-label="Remove this project">
        {confirmDelete ? (
          <div className="fz-stack">
            <p>
              Remove the project “{name}”? Its tasks and notes stay. They just lose the project
              name.
            </p>
            <div className="fz-row">
              <Button onClick={() => void remove()} data-testid="project-delete-confirm">
                Yes, remove the project
              </Button>
              <Button variant="quiet" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="quiet"
            onClick={() => setConfirmDelete(true)}
            data-testid="project-delete"
          >
            Remove this project
          </Button>
        )}
      </section>
    </>
  );
}
