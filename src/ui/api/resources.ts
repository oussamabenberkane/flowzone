/**
 * Typed calls for every endpoint the core screens use. One function per row of the endpoint
 * table in docs/contracts/api.md (section 4). Shapes come from src/shared (the same types the
 * server produces); request inputs are the Zod input types, so the compiler checks the calls.
 */
import type { z } from "zod";
import type {
  createEntrySchema,
  createTaskSchema,
  planBody,
  quickAddBody,
  updateEntrySchema,
  updateProjectSchema,
  updateSettingsSchema,
  updateTaskSchema,
} from "@/shared/api-schemas";
import type {
  DayPlanView,
  EnergyLevel,
  EntryKind,
  EntryView,
  FreshLookView,
  ProjectView,
  QuickAddView,
  SettingsView,
  SuggestionsView,
  TaskDetailView,
  TaskPage,
  TaskView,
  TodayView,
} from "@/shared/views";
import type { RecurrenceRule } from "@/shared/recurrence";
import { api } from "./client";

export type CreateTaskInput = z.input<typeof createTaskSchema>;
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;
export type CreateEntryInput = z.input<typeof createEntrySchema>;
export type UpdateEntryInput = z.input<typeof updateEntrySchema>;
export type UpdateProjectInput = z.input<typeof updateProjectSchema>;
export type UpdateSettingsInput = z.input<typeof updateSettingsSchema>;
export type QuickAddInput = z.input<typeof quickAddBody>;
export type PlanInput = z.input<typeof planBody>;
export type { RecurrenceRule, EnergyLevel, EntryKind };

/* ----- Projects ----- */
export const listProjects = () => api.get<{ projects: ProjectView[] }>("/api/projects");
export const getProject = (id: string) => api.get<ProjectView>(`/api/projects/${id}`);
export const createProject = (body: { name: string; clientRequestId?: string }) =>
  api.post<ProjectView>("/api/projects", body);
export const updateProject = (id: string, body: UpdateProjectInput) =>
  api.patch<ProjectView>(`/api/projects/${id}`, body);
export const deleteProject = (id: string) => api.delete(`/api/projects/${id}`);

/* ----- Tasks ----- */
export const listInbox = (offset = 0) => api.get<TaskPage>("/api/inbox", { limit: 50, offset });
export const listTasks = (query: {
  projectId?: string | "none";
  parentTaskId?: string;
  status?: "open" | "completed" | "all";
  limit?: number;
}) => api.get<TaskPage>("/api/tasks", query);
export const getTask = (id: string) => api.get<TaskDetailView>(`/api/tasks/${id}`);
export const createTask = (body: CreateTaskInput) => api.post<TaskView>("/api/tasks", body);
export const updateTask = (id: string, body: UpdateTaskInput) =>
  api.patch<TaskView>(`/api/tasks/${id}`, body);
export const deleteTask = (id: string) => api.delete(`/api/tasks/${id}`);
export const completeTask = (id: string, occurrenceDate?: string | null) =>
  api.post<TaskView>(`/api/tasks/${id}/complete`, occurrenceDate ? { occurrenceDate } : {});
export const skipTask = (id: string, occurrenceDate: string) =>
  api.post<TaskView>(`/api/tasks/${id}/skip`, { occurrenceDate });
export const dropTask = (id: string) => api.post<void>(`/api/tasks/${id}/drop`);
export const snoozeTask = (id: string, until?: string) =>
  api.post<TaskView>(`/api/tasks/${id}/snooze`, until ? { until } : {});
export const rescheduleTask = (id: string, body: { dueDate: string | null; dueTime?: string }) =>
  api.post<TaskView>(`/api/tasks/${id}/reschedule`, body);
export const breakDownTask = (id: string, steps: { title: string; clientRequestId?: string }[]) =>
  api.post<TaskDetailView>(`/api/tasks/${id}/breakdown`, { steps });

/* ----- Today, plans, fresh look ----- */
export const getToday = () => api.get<TodayView>("/api/today");
export const getSuggestions = (energy?: EnergyLevel) =>
  api.get<SuggestionsView>("/api/today/suggestions", { energy });
export const getPlan = (date: string) => api.get<DayPlanView>(`/api/plans/${date}`);
export const putPlan = (date: string, body: PlanInput) =>
  api.put<DayPlanView>(`/api/plans/${date}`, body);
export const getFreshLook = (limit = 20) => api.get<FreshLookView>("/api/fresh-look", { limit });

/* ----- Quick add ----- */
export const parseQuickAdd = (body: QuickAddInput) =>
  api.post<QuickAddView>("/api/quick-add/parse", body);

/* ----- Entries (notes and journal) ----- */
export const listEntries = (query: {
  kind?: EntryKind;
  taskId?: string;
  projectId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}) =>
  api.get<{ entries: EntryView[]; limit: number; offset: number; hasMore: boolean }>(
    "/api/entries",
    query,
  );
export const getEntry = (id: string) => api.get<EntryView>(`/api/entries/${id}`);
export const createEntry = (body: CreateEntryInput) => api.post<EntryView>("/api/entries", body);
export const updateEntry = (id: string, body: UpdateEntryInput) =>
  api.patch<EntryView>(`/api/entries/${id}`, body);
export const deleteEntry = (id: string) => api.delete(`/api/entries/${id}`);

/* ----- Settings ----- */
export const getSettings = () => api.get<SettingsView>("/api/settings");
export const updateSettings = (body: UpdateSettingsInput) =>
  api.patch<SettingsView>("/api/settings", body);
