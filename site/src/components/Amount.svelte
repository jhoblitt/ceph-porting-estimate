<!--
  A figure as the page quotes it (two significant figures for money and
  tokens), with the model's unrounded output on hover. The estimate is rough,
  so the short form is what a reader should quote; the long one is labelled
  "model output" because its digits are arithmetic, not precision. Where the
  figure is part of a chart's text equivalent, `spellExact` also gives screen
  readers the model output, which `title` alone does not.
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
  /** A count of lines is exact; money and tokens are the model's output. */
  const title = $derived(kind === 'count' ? exact : `Model output: ${exact}`);
</script>

<data {value} {title}>{short}</data>{#if spellExact}<span class="visually-hidden">
    ({kind === 'count' ? exact : `model output ${exact}`})</span
  >{/if}

<style>
  data {
    font-variant-numeric: inherit;
    white-space: nowrap;
  }
</style>
