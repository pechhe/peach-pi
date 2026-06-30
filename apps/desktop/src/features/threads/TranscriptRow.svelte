<script lang="ts">
  import type { Thread, TranscriptItem } from "@peach-pi/shared-types";
  import { collectAgents } from "../../lib/subagent/journey.svelte";
  import type { FleetAgent } from "../../lib/subagent/fleet";
  import type { TurnMap } from "../../lib/transcript/turns";
  import { isSteerMessage, type Row } from "./lib/group-prep-runs";
  import ReasoningGroup from "./ReasoningGroup.svelte";
  import ToolRow from "./ToolRow.svelte";
  import UserMessage from "./UserMessage.svelte";
  import AssistantMessage from "./AssistantMessage.svelte";
  import SubagentRow from "./SubagentRow.svelte";
  import CompactionCard from "./CompactionCard.svelte";
  import RetryCard from "./RetryCard.svelte";

  let {
    row,
    currentMatchId,
    thread,
    connLogos,
    turnMap,
    agentTimeline,
    fleet,
    onRewind,
    onFork,
    onOpenCompaction,
  }: {
    row: Row;
    currentMatchId: string | null;
    thread: Thread;
    connLogos: Map<string, string | null>;
    turnMap: TurnMap;
    agentTimeline: ReturnType<typeof collectAgents>;
    fleet: Map<string, FleetAgent>;
    onRewind: (entryId: string) => void;
    onFork: (entryId: string) => void;
    onOpenCompaction: (item: Extract<TranscriptItem, { kind: "compaction" }>) => void;
  } = $props();
</script>

{#if row.type === "group"}
  <ReasoningGroup row={row} {currentMatchId} isRunning={thread.status === "running"} />
{:else}
  {@const item = row.item}
  {#if item.kind === "user"}
    <UserMessage {item} {currentMatchId} threadId={thread.id} {connLogos} />
  {:else if item.kind === "assistant" && !isSteerMessage(item)}
    <AssistantMessage {item} {currentMatchId} {thread} {turnMap} {onRewind} {onFork} />
  {:else if item.kind === "tool"}
    <ToolRow {item} {currentMatchId} />
  {:else if item.kind === "subagent"}
    <SubagentRow {item} {currentMatchId} {agentTimeline} {fleet} />
  {:else if item.kind === "compaction"}
    <CompactionCard {item} {currentMatchId} onOpen={onOpenCompaction} />
  {:else if item.kind === "retry"}
    <RetryCard {item} {currentMatchId} />
  {:else if isSteerMessage(item)}
    <!-- steer messages already surfaced in SubagentCard journey — skip -->
  {:else}
    <p
      class="item-enter text-center text-xs text-faint italic"
      data-item-id={item.id}
      class:thread-find-hit={item.id === currentMatchId}
    >{item.text}</p>
  {/if}
{/if}
