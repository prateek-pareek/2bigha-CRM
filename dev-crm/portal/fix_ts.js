const fs = require('fs');

function fixWorkspace() {
  const file = 'd:/Mathionix technologies/connectivity/internal tool/Mathionix-internal/portal/src/app/crm/workspace/page.tsx';
  let content = fs.readFileSync(file, 'utf8');

  // Fix all the map keys and parameters to satisfy typescript
  content = content.replace(/key=\{String\(l\.id \|\| l\._id\) \+ "-" \+ idx\}/g, 'key={String((l as any).id || (l as any)._id) + "-" + (typeof idx !== "undefined" ? idx : Math.random())}');
  content = content.replace(/key=\{String\(d\.id \|\| d\._id\) \+ "-" \+ idx\}/g, 'key={String((d as any).id || (d as any)._id) + "-" + (typeof idx !== "undefined" ? idx : Math.random())}');
  content = content.replace(/key=\{String\(t\.id \|\| t\._id\) \+ "-" \+ idx\}/g, 'key={String((t as any).id || (t as any)._id) + "-" + (typeof idx !== "undefined" ? idx : Math.random())}');
  content = content.replace(/key=\{String\(item\.jobId \|\| item\.id\) \+ "-" \+ idx\}/g, 'key={String((item as any).jobId || (item as any).id) + "-" + (typeof idx !== "undefined" ? idx : Math.random())}');
  content = content.replace(/key=\{String\(p\._id\) \+ "-" \+ idx\}/g, 'key={String((p as any)._id) + "-" + (typeof idx !== "undefined" ? idx : Math.random())}');

  fs.writeFileSync(file, content);
}

function fixOverview() {
  const file = 'd:/Mathionix technologies/connectivity/internal tool/Mathionix-internal/portal/src/components/crm/CrmReportOverviewCharts.tsx';
  let content = fs.readFileSync(file, 'utf8');

  content = content.replace(/leadsByDay\.reduce\(\(a, b\) => a \+ \(b\.count\|\|0\), 0\)/g, '(leadsByDay as any[]).reduce((a, b) => a + (b.count||0), 0)');
  content = content.replace(/touchesByDay\.reduce\(\(a, b\) => a \+ \(b\.count\|\|0\), 0\)/g, '(touchesByDay as any[]).reduce((a, b) => a + (b.count||0), 0)');

  fs.writeFileSync(file, content);
}

fixWorkspace();
fixOverview();
console.log('Fixed typescript errors');
