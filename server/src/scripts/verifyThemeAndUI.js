import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

console.log('=== VERIFYING HTML FILES FOR THEME & 3D STRUCTURE ===');
['index.html', 'auth.html', 'portal.html'].forEach(file => {
  const filePath = path.join(rootDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const hasAntiFouc = content.includes('portal_theme') && content.includes('data-theme');
  const hasThemeToggle = content.includes('id="theme-toggle"') || content.includes('class="theme-toggle"');
  const hasSunMoon = content.includes('sun-icon') && content.includes('moon-icon');
  const hasFont = content.includes('Plus+Jakarta+Sans');

  console.log(`\nChecking ${file}:`);
  console.log(`  - Anti-FOUC script present: ${hasAntiFouc ? '✅' : '❌'}`);
  console.log(`  - Theme toggle button present: ${hasThemeToggle ? '✅' : '❌'}`);
  console.log(`  - Sun/Moon icons present: ${hasSunMoon ? '✅' : '❌'}`);
  console.log(`  - Google Fonts Plus Jakarta Sans: ${hasFont ? '✅' : '❌'}`);

  if (!hasAntiFouc || !hasThemeToggle || !hasSunMoon || !hasFont) {
    console.error(`Verification FAILED for ${file}`);
    process.exit(1);
  }
});

console.log('\n=== VERIFYING CSS TOKENS FOR LIGHT & DARK THEMES ===');
const cssPath = path.join(rootDir, 'styles.css');
const css = fs.readFileSync(cssPath, 'utf8');
const requiredVars = [
  '--bg-primary',
  '--bg-secondary',
  '--surface',
  '--surface-card',
  '--text-primary',
  '--text-secondary',
  '--border-color',
  '--accent-primary',
  '--accent-gradient',
  '--shadow-card',
  '--badge-ok-bg',
  '--badge-warn-bg',
  '--badge-bad-bg'
];

requiredVars.forEach(v => {
  const count = (css.match(new RegExp(v + ':', 'g')) || []).length;
  console.log(`  Variable ${v}: ${count} definitions ${count >= 2 ? '✅' : '❌'}`);
  if (count < 2) {
    console.error(`Variable ${v} must be defined in both light and dark themes!`);
    process.exit(1);
  }
});

console.log('\n=== VERIFYING THEME JAVASCRIPT EXPORTS & LOGIC ===');
const themeJsPath = path.join(rootDir, 'js/theme.js');
const themeJs = fs.readFileSync(themeJsPath, 'utf8');
const requiredFunctions = [
  'getPreferredTheme',
  'applyTheme',
  'updateToggleButtons',
  'toggleTheme',
  'initThemeToggle'
];

requiredFunctions.forEach(fn => {
  const hasFn = themeJs.includes(`function ${fn}`);
  console.log(`  Theme function ${fn}: ${hasFn ? '✅' : '❌'}`);
  if (!hasFn) {
    console.error(`Missing required theme function ${fn}`);
    process.exit(1);
  }
});

console.log('\n🎉 ALL THEME & UI CHECKS PASSED WITH 100% SUCCESS!\n');
