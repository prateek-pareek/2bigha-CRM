const fs = require('fs');

function fixWorkspace() {
  const file = 'd:/Mathionix technologies/connectivity/internal tool/Mathionix-internal/portal/src/app/crm/workspace/page.tsx';
  let content = fs.readFileSync(file, 'utf8');

  // Replace the problematic typeof idx with just Math.random() since we don't have idx in scope
  content = content.replace(/\(typeof idx !== "undefined" \? idx : Math\.random\(\)\)/g, 'Math.random()');

  fs.writeFileSync(file, content);
}

fixWorkspace();
console.log('Fixed undefined idx in workspace');
