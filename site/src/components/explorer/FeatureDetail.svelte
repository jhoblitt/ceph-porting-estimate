<!--
  One feature, or one dependency's work: what it is and why it is classed
  as it is, where its code lives, and how its size becomes tokens and
  dollars. A feature that is not ported says why it costs nothing.
-->
<script lang="ts">
  import { CATEGORY_META, categoryParts, shares } from '../../lib/categories';
  import { difficultyText, inputText, paramOrigin } from '../../lib/chain';
  import { factorChain } from '../../lib/explorer';
  import { countExact, percent, usd, usdExact } from '../../lib/format';
  import {
    DIFFICULTY_LABELS,
    KIND_LABELS,
    SCOPE_LABELS,
    STRATEGY_LABELS,
    STRATEGY_MEANINGS,
    difficultyMeaning,
  } from '../../lib/labels';
  import type { FeatureEstimate, ParamInfo, Params } from '../../lib/model';
  import { type Dependency, type Feature, type Report, TARGET_LABELS, type Target } from '../../lib/report';
  import Amount from '../Amount.svelte';
  import SegmentedBar from '../SegmentedBar.svelte';
  import FactorChain from './FactorChain.svelte';
  import FeatureSource from './FeatureSource.svelte';

  interface Props {
    report: Report;
    params: Params;
    /** Every param's baseline and scenario value, to say who moved a factor. */
    paramInfo: ParamInfo[];
    /** The reader's overrides. */
    overrides: Record<string, number>;
    target: Target;
    estimate: FeatureEstimate;
    /** The taxonomy's entry, or for dependency work the dependency. */
    source: { feature: Feature } | { dependency: Dependency };
    componentName: string;
    modelName: string;
    /** The feature's share of the headline. */
    share: number;
    headingId: string;
  }

  let {
    report,
    params,
    paramInfo,
    overrides,
    target,
    estimate: f,
    source,
    componentName,
    modelName,
    share,
    headingId,
  }: Props = $props();

  const feature = $derived('feature' in source ? source.feature : null);
  const dep = $derived('dependency' in source ? source.dependency : null);
  const plan = $derived(dep ? dep.targets[target] : null);
  const ported = $derived(f.scope !== 'not-ported');
  const chain = $derived(factorChain(f, params));
  const difficulty = $derived(DIFFICULTY_LABELS[f.difficulty]);
  const origin = (path: string) => paramOrigin(path, paramInfo, overrides);
  const cls = $derived(f.featureKind === 'config' ? 'config' : f.difficulty);
  const difficultyWords = $derived(difficultyText(report, cls, f.factors.difficulty, origin(`difficulty.${cls}`)));
  const dollarShares = $derived(shares(f.usdByCategory));
  const parts = $derived(
    categoryParts(dollarShares, (c) => ({
      text: usd(f.usdByCategory[c.key]),
      title: `${c.label}: ${usdExact(f.usdByCategory[c.key])} (${percent(dollarShares[c.key])})`,
    })),
  );
  const scopeNote: Record<string, string> = {
    headline: 'Part of the headline figure.',
    shown: 'Costed, but kept out of the headline and shown separately.',
    'not-ported': 'A port would reuse or replace this rather than rewrite it.',
  };
</script>

<article class="detail" aria-labelledby={headingId}>
  <p class="kicker">{dep ? 'Dependency work' : 'Feature'} in {componentName}</p>
  <h3 id={headingId} tabindex="-1">{f.name}</h3>
  {#if feature}<p class="description">{feature.description}</p>{/if}
  {#if dep}<p class="description">Ceph uses it for: {dep.used_for}</p>{/if}

  <div class="columns">
    <div class="facts">
      <dl>
        {#if feature}
          <div>
            <dt>Scope</dt>
            <dd><strong>{SCOPE_LABELS[f.scope]}</strong>{f.scope === 'headline' ? '' : `. ${scopeNote[f.scope]}`}</dd>
          </div>
          <div>
            <dt>Kind</dt>
            <dd><strong>{KIND_LABELS[f.featureKind]}</strong></dd>
          </div>
        {/if}
        {#if plan}
          <div>
            <dt>Plan for {TARGET_LABELS[target]}</dt>
            <dd>
              <strong>{STRATEGY_LABELS[plan.strategy]}</strong>{plan.package ? `, ${plan.package}` : ''}: {STRATEGY_MEANINGS[plan.strategy]}.
              <span class="note">{plan.note}</span>
            </dd>
          </div>
        {/if}
        <div>
          <dt>Difficulty</dt>
          <dd>
            <strong>{difficulty}</strong>{#if f.featureKind === 'config' && f.difficulty !== 'config'}, weighed as
              configuration{/if}, {difficultyWords.factor}. {difficultyMeaning(report, cls)}.
            {#if difficultyWords.detail}<span class="note">{difficultyWords.detail}</span>{/if}
          </dd>
        </div>
      </dl>
      {#if feature?.why}
        <h4>Why it is classed this way</h4>
        <p class="why">{feature.why}</p>
      {/if}

      <div class="source">
      {#if feature}
        <FeatureSource ceph={report.ceph} langs={feature.langs} globs={feature.globs} pathsTitle="Paths" />
      {:else if dep}
        <FeatureSource
          ceph={report.ceph}
          langs={{}}
          globs={dep.submodules.map((s) => `${s}/`)}
          pathsTitle="Vendored submodules"
        />
      {/if}
      </div>
    </div>

    <div class="cost">
      {#if ported}
        <p class="total">
          <span class="figure"><Amount value={f.usd} kind="usd" spellExact /></span>
          <span class="of">{percent(share)} of the headline, for <Amount value={f.sloc.code} kind="count" unit="lines" />
            {dep ? 'lines of work' : 'code lines'}</span>
        </p>
        <h4>Dollars by token category</h4>
        <SegmentedBar label="{f.name}: cost by token category" {parts} size="thin" />
        <div class="scroll">
        <table class="cats">
          <caption>Model output, not measurements, printed in full.</caption>
          <thead>
            <tr><th scope="col">Category</th><th scope="col">Tokens</th><th scope="col">Cost</th></tr>
          </thead>
          <tbody>
            {#each CATEGORY_META as c (c.key)}
              <tr>
                <th scope="row"><span class="swatch" style:background="var(--series-{c.series})" aria-hidden="true"></span>{c.label}</th>
                <td>{countExact(f.tokens[c.key])}</td>
                <td>{usdExact(f.usdByCategory[c.key])}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        </div>
        <h4>From size to output tokens</h4>
        <FactorChain steps={chain} difficulty={difficulty.toLowerCase()} difficultyNote={difficultyWords.step} />
        <p class="note">{inputText(report, params, modelName, origin)}</p>
      {:else}
        <div class="free">
          <p class="figure">$0</p>
          <p>
            <strong>Not ported.</strong>
            {scopeNote['not-ported']} Its <Amount value={f.sloc.code} kind="count" unit="lines" /> code lines are counted but
            carry no tokens and no cost.{#if feature?.why}{' '}{feature.why}{/if}
          </p>
        </div>
      {/if}
    </div>
  </div>
</article>

<style>
  .detail {
    padding: var(--space-5);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--page);
  }

  .kicker {
    margin: 0 0 var(--space-1);
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  h3 {
    margin: 0 0 var(--space-2);
    scroll-margin-top: var(--space-5);
    scroll-margin-bottom: 40vh;
  }

  h3:focus {
    outline: none;
  }

  h4 {
    margin: var(--space-5) 0 var(--space-2);
    font-size: var(--text-sm);
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .description {
    color: var(--text-muted);
  }

  .columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--space-6);
    margin-top: var(--space-4);
  }

  dl {
    display: grid;
    gap: var(--space-3);
    margin: 0;
  }

  dt {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-muted);
  }

  dd {
    margin: 0;
  }

  .why {
    margin: 0;
  }

  .note {
    display: block;
    margin-top: var(--space-2);
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .total {
    display: flex;
    flex-direction: column;
    margin: 0;
  }

  .figure {
    margin: 0;
    font-size: var(--text-2xl);
    font-weight: 700;
    line-height: 1.1;
  }

  .of {
    color: var(--text-muted);
  }

  .source {
    margin-top: var(--space-5);
  }

  .scroll {
    overflow-x: auto;
  }

  .cats {
    width: 100%;
    margin-top: var(--space-3);
    border-collapse: collapse;
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  .cats caption {
    caption-side: bottom;
    padding-top: var(--space-1);
    text-align: start;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  .cats th,
  .cats td {
    padding: var(--space-1) var(--space-2);
    text-align: end;
    border-bottom: 1px solid var(--grid);
    white-space: nowrap;
  }

  .cats thead th {
    font-weight: 600;
    color: var(--text-muted);
  }

  .cats th:first-child {
    text-align: start;
  }

  .cats tbody th {
    font-weight: 400;
  }

  .swatch {
    display: inline-block;
    width: 10px;
    height: 10px;
    margin-inline-end: var(--space-2);
    border-radius: 2px;
  }

  .free {
    padding: var(--space-4);
    border-radius: var(--radius);
    background: var(--hatch-not-ported);
  }

  .free p {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    background: var(--page);
    border-radius: var(--radius-sm);
  }

  .free p + p {
    margin-top: var(--space-2);
  }

  @media (max-width: 899px) {
    .columns {
      grid-template-columns: minmax(0, 1fr);
    }

    /* One column: the answer before the reasons. */
    .cost {
      order: -1;
    }
  }

  @media (max-width: 719px) {
    .detail {
      padding: var(--space-4) var(--space-3);
    }
  }
</style>
