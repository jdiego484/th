import * as fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Backgrounds (Dark to Light)
content = content.replace(/bg-neutral-950/g, 'bg-slate-50');
content = content.replace(/bg-neutral-900\/50/g, 'bg-white');
content = content.replace(/bg-neutral-900/g, 'bg-white');
content = content.replace(/bg-neutral-800/g, 'bg-white');
content = content.replace(/bg-neutral-700/g, 'bg-slate-100');
content = content.replace(/bg-black\/50/g, 'bg-slate-900\/20');
content = content.replace(/bg-black\/40/g, 'bg-slate-900\/20');

// 2. Borders & Shadows
content = content.replace(/border-white\/10/g, 'border-slate-200 shadow-sm');
content = content.replace(/border-white\/5/g, 'border-slate-200');
content = content.replace(/border-neutral-800/g, 'border-slate-200');
content = content.replace(/border-neutral-700/g, 'border-slate-200');
content = content.replace(/divide-white\/5/g, 'divide-slate-200');
content = content.replace(/divide-white\/10/g, 'divide-slate-200');

// 3. Text Colors
content = content.replace(/text-white/g, 'text-slate-900');
content = content.replace(/text-neutral-400/g, 'text-slate-500');
content = content.replace(/text-neutral-300/g, 'text-slate-600');
content = content.replace(/text-neutral-500/g, 'text-slate-400');
content = content.replace(/text-neutral-600/g, 'text-slate-400');

// 4. Accents (Emerald -> Orange)
content = content.replace(/emerald-500/g, 'orange-500');
content = content.replace(/emerald-400/g, 'orange-600');
content = content.replace(/emerald-600/g, 'orange-600');

// 5. Fix Button Text Colors
for(let i=0; i<3; i++) {
    content = content.replace(/className=(["'`])((?:(?!\1).)*?bg-orange-[56]00(?:(?!\1).)*?)text-slate-900((?:(?!\1).)*?)\1/g, 'className=$1$2text-white$3$1');
}

// 6. Introduce Blue (Secondary Accents, Tabs, Icons)
content = content.replace(/text-orange-600 bg-orange-500\/10/g, 'text-blue-700 bg-blue-50');
content = content.replace(/text-orange-600 bg-orange-500\/20/g, 'text-blue-700 bg-blue-100');

content = content.replace(/bg-orange-500\/20 p-2 rounded-2xl/g, 'bg-blue-50 p-2 rounded-2xl');

content = content.replace(/border-orange-500\/50/g, 'border-blue-300');
content = content.replace(/border-orange-500\/20/g, 'border-blue-200');
content = content.replace(/border-orange-500/g, 'border-blue-500');

content = content.replace(/hover:bg-orange-500\/5/g, 'hover:bg-blue-50');
content = content.replace(/hover:text-orange-500/g, 'hover:text-blue-600');

content = content.replace(/bg-orange-500\/10 text-orange-600/g, 'bg-blue-50 text-blue-700');

// 7. Any remaining text-slate-900 inside blue buttons?
for(let i=0; i<3; i++) {
    content = content.replace(/className=(["'`])((?:(?!\1).)*?bg-blue-[567]00(?:(?!\1).)*?)text-slate-900((?:(?!\1).)*?)\1/g, 'className=$1$2text-white$3$1');
}

// Save
fs.writeFileSync('src/App.tsx', content);
