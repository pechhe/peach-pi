import type { ParsedSkillInvocation } from "../lib/composer/skill-message";

/**
 * Global viewer for a skill invocation chip. A user-message chip in the
 * transcript calls `skillViewer.open(parsed)`; a single dialog mounted at the
 * app root renders the skill's instructions.
 */
class SkillViewerStore {
  skill = $state<ParsedSkillInvocation | null>(null);

  open(skill: ParsedSkillInvocation): void {
    this.skill = skill;
  }

  close(): void {
    this.skill = null;
  }
}

export const skillViewer = new SkillViewerStore();
