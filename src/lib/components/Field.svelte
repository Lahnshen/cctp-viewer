<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = { label: string; hint?: string; children: Snippet };
	let { label, hint, children }: Props = $props();
</script>

<div class="group min-w-0">
	<div class="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase" title={hint}>
		{label}
	</div>
	{@render children()}
</div>
