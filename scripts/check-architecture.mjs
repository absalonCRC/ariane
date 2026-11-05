import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const errors = [];
function walk(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(folder, entry.name);
    return entry.isDirectory() ? walk(file) : /\.tsx?$/.test(file) ? [file] : [];
  });
}
for (const file of walk(path.join(root, 'src'))) {
  const relative = path.relative(root, file);
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  function visit(node) {
    let specifier;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      specifier = node.moduleSpecifier;
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      specifier = node.argument.literal;
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
      specifier = node.arguments[0];
    if (specifier && ts.isStringLiteral(specifier)) {
      const value = specifier.text;
      const target = path.resolve(path.dirname(file), value);
      if (path.isAbsolute(value) || value.includes('node_modules'))
        errors.push(`${relative}: machine-specific import ${value}`);
      if (
        relative.startsWith('src/contracts/') &&
        (!value.startsWith('.') || !target.startsWith(path.join(root, 'src/contracts') + path.sep))
      )
        errors.push(`${relative}: contracts depend on ${value}`);
      if (
        relative !== 'src/main.tsx' &&
        !/^src\/(app|performance)\//.test(relative) &&
        /\/app\/(App|useWorkspace)$/.test(target)
      )
        errors.push(`${relative}: feature depends on root workspace`);
      if (/\/app\/(types|client)$/.test(target))
        errors.push(`${relative}: removed compatibility facade ${value}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
const rust = fs.readFileSync(path.join(root, 'src-tauri/src/api/request.rs'), 'utf8');
const native = [...rust.matchAll(/^    ([A-Z]\w*)\s*[,\{]/gm)]
  .map((m) => m[1][0].toLowerCase() + m[1].slice(1))
  .sort();
const contract = ts.createSourceFile(
  'requests.ts',
  fs.readFileSync(path.join(root, 'src/contracts/requests.ts'), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
);
for (const name of ['Requests', 'Responses']) {
  const declaration = contract.statements.find(
    (node) => ts.isInterfaceDeclaration(node) && node.name.text === name,
  );
  const keys = declaration.members.map((member) => member.name.getText(contract)).sort();
  if (JSON.stringify(keys) !== JSON.stringify(native))
    errors.push(
      `${name}: native IPC names differ (missing: ${native.filter((k) => !keys.includes(k))}; extra: ${keys.filter((k) => !native.includes(k))})`,
    );
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log(`Architecture: contract boundaries and ${native.length} IPC names verified.`);
