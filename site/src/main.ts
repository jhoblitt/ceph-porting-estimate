import { mount } from 'svelte';
import App from './App.svelte';
import { loadReport } from './lib/report';
import './styles/tokens.css';
import './styles/base.css';

const target = document.getElementById('app');
if (!target) throw new Error('index.html has no #app element');

try {
  const report = await loadReport();
  mount(App, { target, props: { report } });
} catch (err) {
  target.textContent = 'The report data could not be loaded. Try reloading the page.';
  throw err;
}
