const fs = require('fs');
const data = JSON.parse(fs.readFileSync('coverage/coverage-final.json', 'utf8'));

const results = [];
for (const file in data) {
  const f = data[file];
  let lines = { covered: 0, total: 0 };
  let funcs = { covered: 0, total: 0 };
  let branches = { covered: 0, total: 0 };

  if (f.l) {
    const vals = Object.values(f.l);
    lines.total = vals.filter(v => v !== undefined).length;
    lines.covered = vals.filter(v => v > 0).length;
  }
  if (f.f) {
    const vals = Object.values(f.f);
    funcs.total = vals.filter(v => v !== undefined).length;
    funcs.covered = vals.filter(v => v > 0).length;
  }
  if (f.b) {
    for (const branch in f.b) {
      const b = f.b[branch];
      branches.total += b.length;
      branches.covered += b.filter(v => v > 0).length;
    }
  }

  if (lines.total > 0 || funcs.total > 0) {
    results.push({
      file: file.replace('D:\\Codebox\\PROJECTS\\FluidFlow\\', ''),
      lines: lines.total > 0 ? ((lines.covered / lines.total) * 100).toFixed(1) : null,
      funcs: funcs.total > 0 ? ((funcs.covered / funcs.total) * 100).toFixed(1) : null,
      branches: branches.total > 0 ? ((branches.covered / branches.total) * 100).toFixed(1) : null
    });
  }
}

// Filter to utils/ and services/ only
const filtered = results.filter(r => r.file.startsWith('utils\\') || r.file.startsWith('services\\') || r.file.startsWith('hooks\\') || r.file.startsWith('data\\'));
filtered.sort((a, b) => (parseFloat(a.lines) || 0) - (parseFloat(b.lines) || 0));

console.log('Files with partial coverage (utils/services/hooks/data):');
filtered.slice(0, 50).forEach(r => {
  const l = r.lines ? r.lines + '%' : 'N/A';
  const f = r.funcs ? r.funcs + '%' : 'N/A';
  const b = r.branches ? r.branches + '%' : 'N/A';
  console.log(r.file + ' - Lines:' + l + ' Funcs:' + f + ' Branches:' + b);
});
