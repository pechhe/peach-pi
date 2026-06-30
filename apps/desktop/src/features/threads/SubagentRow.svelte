<script lang="ts">
  import type { TranscriptItem } from "@peach-pi/shared-types";
  import { collectAgents } from "../../lib/subagent/journey.svelte";
  import type { FleetAgent } from "../../lib/subagent/fleet";
  import SubagentCard from "../../app/SubagentCard.svelte";

  let {
    item,
    currentMatchId,
    agentTimeline,
    fleet,
  }: {
    item: Extract<TranscriptItem, { kind: "subagent" }>;
    currentMatchId: string | null;
    agentTimeline: ReturnType<typeof collectAgents>;
    fleet: Map<string, FleetAgent>;
  } = $props();
</script>

{#each agentTimeline.primaryNamesByCall.get(item.id) ?? [] as name (name)}
  {@const entity = agentTimeline.entities.get(name)}
  {#if entity}
    <div class="item-enter" data-item-id={item.id} class:thread-find-hit={item.id === currentMatchId}>
      <SubagentCard {entity} live={fleet.get(name)} />
    </div>
  {/if}
{/each}
