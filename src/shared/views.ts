/**
 * The shapes the core API returns (JSON). Shared by the server (which produces them) and
 * the browser (which reads them). Pure types: no imports. Described in
 * docs/contracts/api.md; keep the two in step.
 */
import type { ConsentSwitch } from "./consent";
import type { RecurrenceRule } from "./recurrence";

export type TaskStatus = "pending" | "in_progress" | "completed";
export type TaskPriority = "low" | "normal" | "high";
export type EnergyLevel = "low" | "medium" | "high";
export type EntryKind = "note" | "journal";
export type RecurrenceOutcome = "completed" | "skipped";
export type FreshLookReason = "date_passed" | "stale";
export type SuggestionReason =
  "due_today" | "due_soon" | "in_progress" | "high_priority" | "resurfacing";

/** How a recurring task is set up and where it stands today. */
export interface RecurrenceView {
  rule: RecurrenceRule;
  /** The first day the rule applies from ("YYYY-MM-DD"). */
  startDate: string;
  paused: boolean;
  /** The occurrence that is current today or next; null while paused. */
  currentOccurrence: string | null;
  /** Consecutive occurrences passed without completion, counted back from the current one. */
  consecutiveSkips: number;
  /** True when consecutiveSkips reached the threshold: offer to adjust or pause. */
  adjustSuggested: boolean;
}

export interface TaskView {
  id: string;
  title: string;
  status: TaskStatus;
  projectId: string | null;
  parentTaskId: string | null;
  /** For a recurring task this is its current occurrence date. */
  dueDate: string | null;
  /** "HH:MM" or null. */
  dueTime: string | null;
  priority: TaskPriority;
  energy: EnergyLevel | null;
  estimateMinutes: number | null;
  recurrence: RecurrenceView | null;
  position: number;
  completedAt: string | null;
  lastActivityAt: string;
  snoozedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDetailView extends TaskView {
  subtasks: TaskView[];
}

export interface TaskPage {
  tasks: TaskView[];
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ProjectView {
  id: string;
  name: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface EntryView {
  id: string;
  kind: EntryKind;
  title: string | null;
  body: string;
  entryDate: string;
  taskId: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DayPlanView {
  date: string;
  confirmed: boolean;
  confirmedAt: string | null;
  tasks: TaskView[];
}

export interface TodayView {
  date: string;
  timeZone: string;
  plan: DayPlanView;
}

export interface SuggestionView {
  task: TaskView;
  reasons: SuggestionReason[];
}

export interface SuggestionsView {
  date: string;
  suggestions: SuggestionView[];
}

export interface FreshLookItemView {
  task: TaskView;
  reason: FreshLookReason;
}

export interface FreshLookView {
  items: FreshLookItemView[];
}

export interface ParsedField {
  field: "title" | "dueDate" | "dueTime" | "project" | "priority";
  value: string;
  /** The words in the input that produced this field. */
  text: string;
}

export interface QuickAddView {
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  /** The project name as written (null when there was no #marker). */
  projectName: string | null;
  /** The matching project of the owner, or null when none has that name. */
  projectId: string | null;
  /** null when no priority marker was given (the default is "normal"). */
  priority: TaskPriority | null;
  /** What the parser understood, so the interface can show it and let the person correct it. */
  understood: ParsedField[];
}

export interface SearchResultView {
  tasks: TaskView[];
  entries: EntryView[];
}

export interface ConsentSwitchView {
  enabled: boolean;
  /** When this switch was last changed, or null if it never was. */
  changedAt: string | null;
}

export interface SettingsView {
  timeZone: string;
  quietHours: { start: string; end: string };
  firstRunCompleted: boolean;
  consent: Record<ConsentSwitch, ConsentSwitchView>;
}

export interface AccountDeletedView {
  deleted: true;
}
