/**
 * Direct API calls as a person (api.md). Used to set up data quickly and to prove access
 * rules. Each call returns the status and parsed body so tests can assert on both.
 */
import { expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";

export interface ApiResult<T = unknown> {
  status: number;
  body: T;
  text: string;
}

export async function call<T = unknown>(
  api: APIRequestContext,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  data?: unknown,
  headers?: Record<string, string>,
): Promise<ApiResult<T>> {
  // A keep-alive socket the server has just closed can reset once; one retry is enough.
  let response;
  for (let attempt = 1; ; attempt += 1) {
    try {
      response = await api.fetch(path, {
        method,
        ...(data === undefined ? {} : { data }),
        ...(headers ? { headers } : {}),
        failOnStatusCode: false,
      });
      break;
    } catch (error) {
      if (attempt >= 2 || !String(error).includes("ECONNRESET")) throw error;
    }
  }
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status(), body: body as T, text };
}

/** Like `call` but asserts the request succeeded (2xx) and returns the body. */
export async function ok<T = unknown>(
  api: APIRequestContext,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  data?: unknown,
): Promise<T> {
  const result = await call<T>(api, method, path, data);
  expect(
    result.status,
    `${method} ${path} should succeed: ${result.text.slice(0, 200)}`,
  ).toBeLessThan(300);
  return result.body;
}

export interface TaskView {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed";
  projectId: string | null;
  dueDate: string | null;
  dueTime: string | null;
  priority: "low" | "normal" | "high";
  recurrence: { paused: boolean; adjustSuggested: boolean; consecutiveSkips: number } | null;
}

/** Creates a task as the person. Each call gets a fresh client request id. */
export function createTask(
  api: APIRequestContext,
  fields: Record<string, unknown>,
): Promise<TaskView> {
  return ok<TaskView>(api, "POST", "/api/tasks", {
    clientRequestId: randomUUID(),
    ...fields,
  });
}

export function createProject(
  api: APIRequestContext,
  name: string,
): Promise<{ id: string; name: string }> {
  return ok(api, "POST", "/api/projects", { name, clientRequestId: randomUUID() });
}

export function createEntry(
  api: APIRequestContext,
  fields: Record<string, unknown>,
): Promise<{ id: string; kind: string; body: string | null; taskId: string | null }> {
  return ok(api, "POST", "/api/entries", { clientRequestId: randomUUID(), ...fields });
}

export function todayIso(timeZone = "Europe/Paris"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addDaysIso(days: number, timeZone = "Europe/Paris"): string {
  const base = new Date(`${todayIso(timeZone)}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}
