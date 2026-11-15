"use client";

/**
 * Typed calls for the nudge endpoints (docs/contracts/nudges.md, section 4). Response shapes come
 * from src/shared/nudges.ts, which both sides may import.
 */
import type {
  AddDeviceInput,
  NudgeDeviceView,
  NudgeDevicesView,
  SetTaskControlInput,
  TaskNudgeControlView,
} from "@/shared/nudges";
import { api } from "@/ui/api/client";

export const getNudgeDevices = () => api.get<NudgeDevicesView>("/api/nudges/devices");

export const addNudgeDevice = (body: AddDeviceInput) =>
  api.post<NudgeDeviceView>("/api/nudges/devices", body);

export const removeNudgeDevice = (id: string) => api.delete(`/api/nudges/devices/${id}`);

export const sendNudgeTest = () =>
  api.post<{ delivered: number; failed: number; gone: number }>("/api/nudges/test");

export const getTaskNudgeControl = (taskId: string) =>
  api.get<TaskNudgeControlView>(`/api/nudges/tasks/${taskId}`);

export const setTaskNudgeControl = (taskId: string, body: SetTaskControlInput) =>
  api.put<TaskNudgeControlView>(`/api/nudges/tasks/${taskId}`, body);
