import { apiClient } from './apiClient';

const TRIAL_ACCESS_STORAGE_KEY = 'uclaw.trial_access.verified_day.v1';

export interface TrialAccessStatusPayload {
  enabled: boolean;
  currentDay: string;
  timezone?: string;
}

export interface TrialAccessVerifyPayload {
  success: boolean;
  enabled: boolean;
  currentDay: string;
}

export function getStoredVerifiedDay(): string {
  try {
    return String(window.localStorage.getItem(TRIAL_ACCESS_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function markTrialAccessVerified(day: string): void {
  try {
    window.localStorage.setItem(TRIAL_ACCESS_STORAGE_KEY, day);
  } catch {
    // ignore
  }
}

export function clearStoredTrialAccess(): void {
  try {
    window.localStorage.removeItem(TRIAL_ACCESS_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function isTrialAccessVerifiedForDay(day: string): boolean {
  return getStoredVerifiedDay() === String(day || '').trim();
}

export async function fetchTrialAccessStatus(): Promise<{ success: boolean; data?: TrialAccessStatusPayload; error?: string }> {
  return apiClient.get<TrialAccessStatusPayload>('/app/trialAccess/status');
}

export async function verifyTrialAccessCode(code: string): Promise<{ success: boolean; data?: TrialAccessVerifyPayload; error?: string }> {
  return apiClient.post<TrialAccessVerifyPayload>('/app/trialAccess/verify', { code });
}
