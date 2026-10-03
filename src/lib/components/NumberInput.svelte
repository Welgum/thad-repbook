<script lang="ts">
	let {
		label,
		value = $bindable(''),
		step = 1,
		min = 0,
		max = 2000,
		integer = false,
		required = false
	}: {
		label: string;
		value?: string;
		step?: number;
		min?: number;
		max?: number;
		integer?: boolean;
		required?: boolean;
	} = $props();
	function adjust(n: number) {
		const parsed = Number(value.replace(',', '.'));
		value = String(
			Math.min(
				max,
				Math.max(min, Math.round(((Number.isFinite(parsed) ? parsed : 0) + n) * 1000) / 1000)
			)
		);
	}
</script>

<label class="number-label"
	><span>{label}{required ? ' *' : ''}</span><span class="number-input"
		><button
			type="button"
			class="flat"
			aria-label={`Decrease ${label}`}
			onclick={() => adjust(-step)}>−</button
		><input
			{required}
			bind:value
			inputmode={integer ? 'numeric' : 'decimal'}
			aria-label={label}
			autocomplete="off"
		/><button
			type="button"
			class="flat"
			aria-label={`Increase ${label}`}
			onclick={() => adjust(step)}>+</button
		></span
	></label
>
