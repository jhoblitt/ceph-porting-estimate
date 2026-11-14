<!--
  A prose page: a title, a table of contents, and the page's Markdown files
  in order, with their figures filled in and their tables built from the
  data. Every heading links to itself; the section rides in the hash with
  the reader's selection (lib/prose/links.ts), so a section link is an
  ordinary navigation and Back returns to the previous section.
-->
<script lang="ts">
  import { proseFacts } from '../../lib/prose/facts';
  import { pageHref, rewriteInternalLinks } from '../../lib/prose/links';
  import { contents, renderDoc } from '../../lib/prose/page';
  import type { CompiledDoc } from '../../lib/prose/types';
  import type { Report } from '../../lib/report';
  import { type AppState, parseHash } from '../../lib/state';
  import '../../styles/prose.css';
  import ProseTable from './ProseTable.svelte';

  interface Props {
    title: string;
    lede: string;
    docs: readonly CompiledDoc[];
    report: Report;
    selection: AppState;
  }

  let { title, lede, docs, report, selection }: Props = $props();

  // The report and the page's files never change once mounted; only the
  // selection does, and it only reaches the links and the scroll position.
  // svelte-ignore state_referenced_locally
  const facts = proseFacts(report);
  // svelte-ignore state_referenced_locally
  const rendered = docs.map((doc) => ({ file: doc.file, segments: renderDoc(doc, report, facts) }));
  // svelte-ignore state_referenced_locally
  const toc = contents(docs);

  const href = (id: string) => pageHref(selection, selection.route, id);

  const DIRECTION = { raises: 'raises the figure', lowers: 'lowers the figure', either: 'either way', none: '' } as const;

  /** Where the contents sit beside the text (prose.css), they start open; above it, folded, so the text starts on the first screen. */
  const SIDE_BY_SIDE = '(min-width: 1024px)';
  const media = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(SIDE_BY_SIDE) : null;
  let tocOpen = $state(media?.matches ?? true);

  // Crossing the breakpoint opens or folds the contents; between crossings the reader's choice stands.
  $effect(() => {
    if (!media?.addEventListener) return;
    const follow = (e: MediaQueryListEvent) => (tocOpen = e.matches);
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  });

  function scrollToSection(id: string): void {
    const heading = document.getElementById(id);
    if (!heading) return;
    heading.scrollIntoView({ block: 'start' });
    heading.focus({ preventScroll: true });
  }

  /**
   * A link to the section already in the hash changes no hash, so the store
   * hears nothing; scroll back to it here. Every other link is left to the
   * browser and the hash store.
   */
  function onclick(event: MouseEvent): void {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const href = (event.target as Element | null)?.closest('a')?.getAttribute('href');
    if (!href || href !== window.location.hash) return;
    const section = parseHash(href).section;
    if (section === undefined) return;
    event.preventDefault();
    scrollToSection(section);
  }

  /** The section last scrolled to, so leaving every section returns to the top. */
  let scrolledTo: string | undefined;

  $effect(() => {
    const section = selection.section;
    const previous = scrolledTo;
    scrolledTo = section;
    // After App has reset the scroll for a page change.
    if (section !== undefined) requestAnimationFrame(() => scrollToSection(section));
    else if (previous !== undefined) requestAnimationFrame(() => window.scrollTo(0, 0));
  });
</script>

<!-- Link clicks bubble here; the links themselves are the keyboard path. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="prose-page" {onclick}>
  <header class="prose-header">
    <h1>{title}</h1>
    <p class="prose-lede">{lede}</p>
  </header>

  <nav class="prose-toc" aria-labelledby="prose-toc-title">
    <details bind:open={tocOpen}>
      <summary id="prose-toc-title" class="prose-toc-title">On this page</summary>
      <ol>
        {#each toc as h (h.id)}
          <li><a href={href(h.id)} aria-current={selection.section === h.id ? 'location' : undefined}>{h.text}</a></li>
        {/each}
      </ol>
    </details>
  </nav>

  <article class="prose">
    {#each rendered as doc (doc.file)}
      {#each doc.segments as seg, i (i)}
        {#if seg.kind === 'heading'}
          <svelte:element this={seg.level === 2 ? 'h2' : 'h3'} id={seg.id} tabindex="-1">
            {seg.text}<a class="prose-anchor" href={href(seg.id)} aria-label={`Link to section “${seg.text}”`}>#</a>
          </svelte:element>
        {:else if seg.kind === 'html'}
          {@html rewriteInternalLinks(seg.html, selection)}
        {:else if seg.kind === 'limitations'}
          <ol class="prose-limitations">
            {#each seg.items as item (item.id)}
              <li id="limitation-{item.id}">
                <p class="prose-effect">
                  <strong>{item.label}</strong>{#if DIRECTION[item.direction]}<span>, {DIRECTION[item.direction]}</span>{/if}
                </p>
                {@html rewriteInternalLinks(item.html, selection)}
              </li>
            {/each}
          </ol>
        {:else}
          <ProseTable table={seg.table} />
        {/if}
      {/each}
    {/each}
  </article>
</div>
