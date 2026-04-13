export const SYSTEM_HANDLED_SKILL_IDS = new Set<string>([
  'blingbling-little-eye',
  'ima-note',
]);

export function isSystemHandledSkillId(skillId: string | null | undefined): boolean {
  return SYSTEM_HANDLED_SKILL_IDS.has(String(skillId || '').trim());
}

export function partitionSkillIdsByHandling(skillIds?: string[] | null): {
  systemHandled: string[];
  promptHandled: string[];
} {
  const normalized = Array.from(new Set(
    (skillIds ?? [])
      .map((skillId) => String(skillId || '').trim())
      .filter(Boolean),
  ));

  return {
    systemHandled: normalized.filter((skillId) => isSystemHandledSkillId(skillId)),
    promptHandled: normalized.filter((skillId) => !isSystemHandledSkillId(skillId)),
  };
}
