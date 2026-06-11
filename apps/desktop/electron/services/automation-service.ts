import { computeNextFire, isValidCron } from "@peach-pi/automation-core";
import type { Automation, AutomationRun } from "@peach-pi/shared-types";
import type { AppDb } from "../persistence/db.ts";
import { AutomationRepo } from "../persistence/repositories.ts";
import type { ThreadService } from "./thread-service.ts";

const TICK_MS = 30_000;

/**
 * Scheduled-prompt engine. Persisted `nextFireAt` drives firing: each tick
 * fires due automations once (missed windows collapse into one fire — e.g.
 * app was closed overnight) and reschedules from `now`.
 */
export class AutomationService {
  private repo: AutomationRepo;
  private threadService: ThreadService;
  private onChanged: () => void;
  private timer: NodeJS.Timeout | null = null;

  constructor(db: AppDb, threadService: ThreadService, onChanged: () => void) {
    this.repo = new AutomationRepo(db);
    this.threadService = threadService;
    this.onChanged = onChanged;
  }

  start(): void {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  create(fields: { name: string; cron: string; projectId: string | null; prompt: string }): Automation {
    if (!isValidCron(fields.cron)) throw new Error(`Invalid cron expression: ${fields.cron}`);
    const automation = this.repo.insert({
      ...fields,
      nextFireAt: computeNextFire(fields.cron, new Date()),
    });
    this.onChanged();
    return automation;
  }

  setEnabled(id: string, enabled: boolean): void {
    const automation = this.repo.get(id);
    if (!automation) return;
    this.repo.setEnabled(id, enabled, enabled ? computeNextFire(automation.cron, new Date()) : null);
    this.onChanged();
  }

  delete(id: string): void {
    this.repo.delete(id);
    this.onChanged();
  }

  runs(id: string): AutomationRun[] {
    return this.repo.runs(id);
  }

  previewNext(cron: string): string | null {
    return computeNextFire(cron, new Date());
  }

  async runNow(id: string): Promise<void> {
    const automation = this.repo.get(id);
    if (automation) await this.fire(automation, false);
  }

  private async tick(): Promise<void> {
    for (const automation of this.repo.due(new Date().toISOString())) {
      await this.fire(automation, true);
    }
  }

  private async fire(automation: Automation, reschedule: boolean): Promise<void> {
    const firedAt = new Date().toISOString();
    if (reschedule) {
      // Reschedule first so a crash mid-fire can't cause a fire loop.
      this.repo.markFired(automation.id, firedAt, computeNextFire(automation.cron, new Date()));
    } else {
      this.repo.markFired(automation.id, firedAt, automation.nextFireAt ?? null);
    }
    let threadId: string | null = null;
    try {
      const thread = automation.projectId
        ? await this.threadService.createThread(automation.projectId)
        : await this.threadService.createChat();
      threadId = thread.id;
      await this.threadService.prompt(thread.id, automation.prompt);
      this.threadService.setTitle(thread.id, `⏰ ${automation.name}`);
    } catch (err) {
      console.error(`automation ${automation.name} failed:`, err);
    }
    this.repo.recordRun(automation.id, threadId, firedAt);
    this.onChanged();
  }
}
