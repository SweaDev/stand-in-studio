import { APP_NAME } from '../../shared/app';

/** Control-window entry point. */
function main(): void {
  const root = document.getElementById('app');
  if (!root) throw new Error('missing #app root');
  root.innerHTML = '';
  const h1 = document.createElement('h1');
  h1.textContent = APP_NAME;
  const p = document.createElement('p');
  p.textContent = 'Decide how much of you each call sees.';
  root.append(h1, p);
}

main();
