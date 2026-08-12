<script lang="ts">
	import { domain } from '$lib/cctp/domains';
	import { cn } from '$lib/utils';

	type Props = { id: number; class?: string };
	let { id, class: className }: Props = $props();

	const d = $derived(domain(id));
</script>

<span
	class={cn(
		'bg-secondary text-secondary-foreground inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap',
		className
	)}
	title={`${d.name} — CCTP domain ${d.id}`}
>
	{d.name}
</span>
