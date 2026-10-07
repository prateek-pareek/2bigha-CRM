// Minimal require hook: lets Node load portal .ts files (pure helpers only) using the
// portal tsconfig's own path aliases via ts.resolveModuleName.
const path = require('path');
const fs = require('fs');
const Module = require('module');
const PORTAL = path.resolve(__dirname, '../../../portal');
const ts = require(path.join(PORTAL, 'node_modules/typescript'));

const cfgPath = path.join(PORTAL, 'tsconfig.json');
const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(cfgPath, ts.sys.readFile).config, ts.sys, PORTAL);
const options = cfg.options;

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (parent && parent.filename && /\.tsx?$/.test(parent.filename) && (request.startsWith('@/') || request.startsWith('.'))) {
    const r = ts.resolveModuleName(request, parent.filename, options, ts.sys);
    const f = r.resolvedModule && r.resolvedModule.resolvedFileName;
    if (f && !f.endsWith('.d.ts')) return path.resolve(f);
  }
  return origResolve.call(this, request, parent, ...rest);
};

for (const ext of ['.ts', '.tsx']) {
  require.extensions[ext] = function (module, filename) {
    const src = fs.readFileSync(filename, 'utf8');
    const out = ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    module._compile(out, filename);
  };
}
module.exports = { PORTAL };
