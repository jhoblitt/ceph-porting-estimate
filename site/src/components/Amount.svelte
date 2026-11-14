<!--
  A figure to three significant figures, with the exact value on hover. The
  estimate is rough, so the short form is what a reader should quote. Where
  the figure is part of a chart's text equivalent, `spellExact` also gives
  screen readers the exact value, which `title` alone does not.
-->
<script lang="ts">
  import { count, countExact, tokens, usd, usdExact } from '../lib/format';

  interface Props {
    value: number;
    kind: 'usd' | 'tokens' | 'count';
    /** Appended to the exact value, e.g. "lines"; tokens say "tokens" on their own. */
    unit?: string;
    spellExact?: boolean;
  }

  let { value, kind, unit, spellExact = false }: Props = $props();

  const short = $derived(kind === 'usd' ? usd(value) : kind === 'tokens' ? tokens(value) : count(value));
  const exact = $derived.by(() => {
    if (kind === 'usd') return usdExact(value);
    const suffix = unit ?? (kind === 'tokens' ? 'tokens' : '');
    return suffix ? `${countExact(value)} ${suffix}` : countExact(value);
  });
</script>

<data {value} title={exact}>{short}</data>{#if spellExact}<span class="visually-hidden"> (exactly {exact})</span>{/if}

<style>
  data {
    font-variant-numeric: inherit;
    white-space: nowrap;
  }
</style>
