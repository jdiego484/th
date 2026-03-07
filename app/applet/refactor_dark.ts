import * as fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Backgrounds (Light to Dark)
content = content.replace(/bg-slate-50/g, 'bg-neutral-950');
content = content.replace(/bg-white/g, 'bg-neutral-900');
content = content.replace(/bg-slate-100/g, 'bg-neutral-800');

// 2. Borders & Shadows (Light to Dark)
content = content.replace(/border-slate-200/g, 'border-white/10');
content = content.replace(/divide-slate-200/g, 'divide-white/10');
content = content.replace(/shadow-sm/g, ''); // Shadows don't look good on dark
content = content.replace(/shadow-xl/g, 'shadow-2xl shadow-black');

// 3. Text Colors (Dark to Light)
content = content.replace(/text-slate-900/g, 'text-white');
content = content.replace(/text-slate-500/g, 'text-neutral-400');
content = content.replace(/text-slate-600/g, 'text-neutral-300');
content = content.replace(/text-slate-400/g, 'text-neutral-500');

// 4. Accents - Blue (Light to Dark adjustments)
content = content.replace(/bg-blue-50/g, 'bg-blue-500/10');
content = content.replace(/text-blue-700/g, 'text-blue-400');
content = content.replace(/border-blue-200/g, 'border-blue-500/20');
content = content.replace(/border-blue-300/g, 'border-blue-500/30');
content = content.replace(/border-blue-500/g, 'border-blue-500');

// 5. Introduce Green (Emerald) for some text elements
// Let's change some blue text to green to satisfy the "white, green and blue" request
// Specifically, status badges or secondary highlights
content = content.replace(/text-blue-400 rounded-md text-xs font-medium border border-blue-500\/20/g, 'text-emerald-400 rounded-md text-xs font-medium border border-emerald-500/20');
content = content.replace(/bg-blue-500\/10 text-emerald-400/g, 'bg-emerald-500/10 text-emerald-400');

// 6. Buttons (Keep Orange, ensure text is white)
content = content.replace(/bg-orange-500/g, 'bg-orange-600');
content = content.replace(/text-orange-600/g, 'text-orange-500');
content = content.replace(/hover:bg-orange-600/g, 'hover:bg-orange-500');

// 7. Fix specific hover states
content = content.replace(/hover:bg-slate-100/g, 'hover:bg-white/5');
content = content.replace(/hover:bg-white\/5/g, 'hover:bg-white/10');

// 8. Ensure icons and specific text are green/blue
// Change some orange text highlights to green/blue if they aren't buttons
content = content.replace(/text-orange-500 font-bold/g, 'text-emerald-400 font-bold');

// Save
fs.writeFileSync('src/App.tsx', content);
