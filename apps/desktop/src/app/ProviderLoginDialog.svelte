<script lang="ts">
  import { onMount } from "svelte";
  import type { AuthLoginEvent } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import X from "@lucide/svelte/icons/x";
  import ExternalLink from "@lucide/svelte/icons/external-link";

  let { providerName, onClose }: { providerName: string; onClose: () => void } = $props();

  // The latest non-interactive status line (progress / opened-browser note).
  let status = $state("Starting…");
  let authUrl = $state<string | null>(null);
  let instructions = $state<string | null>(null);
  let deviceCode = $state<{ userCode: string; verificationUri: string } | null>(null);
  let error = $state<string | null>(null);
  let done = $state(false);
  // The active interactive request pi is waiting on (prompt/select/manual code).
  let request = $state<Extract<AuthLoginEvent, { requestId: string }> | null>(null);
  let answer = $state("");

  function handle(e: AuthLoginEvent) {
    switch (e.kind) {
      case "progress":
        status = e.message;
        break;
      case "auth":
        authUrl = e.url;
        instructions = e.instructions ?? null;
        status = "Opened your browser to sign in…";
        break;
      case "deviceCode":
        deviceCode = { userCode: e.userCode, verificationUri: e.verificationUri };
        status = "Enter the code in your browser to continue…";
        break;
      case "prompt":
      case "select":
      case "manualCode":
        answer = "";
        request = e;
        break;
      case "done":
        done = true;
        status = "Signed in.";
        request = null;
        setTimeout(onClose, 900);
        break;
      case "error":
        error = e.message;
        request = null;
        break;
    }
  }

  onMount(() => api.on("event:authLoginEvent", handle));

  function respond(value: string | undefined) {
    if (!request) return;
    void api.invoke("auth:respondLogin", request.requestId, value);
    request = null;
    answer = "";
    status = "Working…";
  }

  function submitText() {
    if (!request) return;
    const allowEmpty = request.kind === "prompt" && request.allowEmpty;
    if (!answer.trim() && !allowEmpty) return;
    respond(answer);
  }

  function cancel() {
    void api.invoke("auth:cancelOAuthLogin");
    onClose();
  }
</script>

<!-- eslint-disable-next-line -->
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" data-testid="provider-login-dialog">
  <div class="w-[26rem] overflow-hidden rounded-lg border border-border-strong bg-surface shadow-xl">
    <div class="flex items-center gap-2 border-b border-border-strong px-3 py-2">
      <span class="text-xs font-semibold text-fg">Sign in to {providerName}</span>
      <button
        class="ml-auto rounded p-1 text-fainter hover:bg-bg hover:text-fg"
        onclick={cancel}
        title="Cancel"
        aria-label="Cancel"
      ><X size={13} /></button>
    </div>

    <div class="flex flex-col gap-3 px-4 py-3.5">
      {#if error}
        <p class="rounded border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-400" data-testid="provider-login-error">
          {error}
        </p>
        <button class="self-end rounded-md bg-surface-2 px-3 py-1 text-xs text-fg hover:bg-surface-3" onclick={onClose}>Close</button>
      {:else if done}
        <p class="text-xs text-emerald-400">{status}</p>
      {:else if request}
        {#if request.kind === "select"}
          <p class="text-xs text-fg">{request.message}</p>
          <div class="flex flex-col gap-1.5">
            {#each request.options as opt (opt.id)}
              <button
                class="rounded-md border border-border-strong bg-surface-2 px-3 py-1.5 text-left text-xs text-fg hover:bg-surface-3"
                onclick={() => respond(opt.id)}
                data-testid="provider-login-option"
              >{opt.label}</button>
            {/each}
          </div>
        {:else}
          <p class="text-xs text-fg">
            {request.kind === "manualCode" ? "Paste the code from your browser:" : request.message}
          </p>
          <form class="flex gap-2" onsubmit={(e) => { e.preventDefault(); submitText(); }}>
            <input
              class="flex-1 rounded-md border border-border-strong bg-bg px-2 py-1 font-mono text-xs text-fg outline-none focus:border-border-focus"
              placeholder={request.kind === "prompt" ? (request.placeholder ?? "") : ""}
              bind:value={answer}
              data-testid="provider-login-input"
            />
            <button
              type="submit"
              class="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-fg disabled:opacity-50"
              data-testid="provider-login-submit"
            >Continue</button>
          </form>
        {/if}
      {:else}
        <p class="text-xs text-faint" data-testid="provider-login-status">{status}</p>
        {#if authUrl}
          {#if instructions}<p class="text-[11px] text-fainter">{instructions}</p>{/if}
          <p class="flex items-center gap-1.5 text-[11px] text-fainter">
            <ExternalLink size={12} /> Browser didn't open? Copy this link:
          </p>
          <code class="break-all rounded bg-bg px-2 py-1 text-[10px] text-fainter">{authUrl}</code>
        {/if}
        {#if deviceCode}
          <div class="rounded-md border border-border-strong bg-bg px-3 py-2 text-center">
            <p class="font-mono text-lg tracking-widest text-fg">{deviceCode.userCode}</p>
            <p class="mt-1 text-[10px] text-fainter">at {deviceCode.verificationUri}</p>
          </div>
        {/if}
      {/if}
    </div>
  </div>
</div>
