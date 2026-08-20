const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const workspace = path.resolve(__dirname, '..');
const releaseRoot = path.join(workspace, 'release');
const rootPackage = readJson(path.join(workspace, 'package.json'));
const packageName = `ai-party-school-server-${rootPackage.version}-linux-x64`;
const stageDir = path.join(releaseRoot, packageName);
const archivePath = path.join(releaseRoot, `${packageName}.tar.gz`);
const zipPath = path.join(releaseRoot, `${packageName}.zip`);

const requiredPaths = [
  'packages/server/dist/main.js',
  'packages/server/public/admin/index.html',
  'packages/server/public/mobile/index.html',
  'packages/shared/dist/index.js',
  'packages/server/prisma/schema.mysql.prisma',
  'packages/server/prisma/migrations',
  'deploy/linux/install.sh',
];

for (const relativePath of requiredPaths) {
  const absolutePath = path.join(workspace, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing required build output: ${relativePath}`);
  }
}

fs.mkdirSync(releaseRoot, { recursive: true });
removeGeneratedPath(stageDir);
removeGeneratedPath(archivePath);
removeGeneratedPath(`${archivePath}.sha256`);
removeGeneratedPath(zipPath);
removeGeneratedPath(`${zipPath}.sha256`);
fs.mkdirSync(stageDir, { recursive: true });

copyFile('package.json', 'app/package.json');
copyFile('pnpm-lock.yaml', 'app/pnpm-lock.yaml');
copyFile('pnpm-workspace.yaml', 'app/pnpm-workspace.yaml');
copyFile('.npmrc', 'app/.npmrc');

copyFile('packages/server/package.json', 'app/packages/server/package.json');
copyDirectory('packages/server/dist', 'app/packages/server/dist');
copyDirectory('packages/server/public', 'app/packages/server/public');
copyFile('packages/server/prisma/schema.prisma', 'app/packages/server/prisma/schema.prisma');
copyFile('packages/server/prisma/schema.mysql.prisma', 'app/packages/server/prisma/schema.mysql.prisma');
copyFile('packages/server/prisma/seed.ts', 'app/packages/server/prisma/seed.ts');
copyDirectory('packages/server/prisma/migrations', 'app/packages/server/prisma/migrations');

copyFile('packages/shared/package.json', 'app/packages/shared/package.json');
copyDirectory('packages/shared/dist', 'app/packages/shared/dist');

copyFile('deploy/linux/install.sh', 'install.sh');
copyFile('deploy/linux/health-check.sh', 'health-check.sh');
copyFile('deploy/linux/server.env.example', 'server.env.example');
copyFile('deploy/linux/Caddyfile', 'Caddyfile');
copyDirectory('deploy/linux/systemd', 'systemd');
copyFile('deploy/linux/README.md', 'README.md');

fs.writeFileSync(path.join(stageDir, 'VERSION'), `${rootPackage.version}\n`, 'utf8');
fs.writeFileSync(
  path.join(stageDir, 'BUILD-INFO.json'),
  `${JSON.stringify(buildInfo(), null, 2)}\n`,
  'utf8',
);

const stagedFiles = listFiles(stageDir).filter((file) => file !== 'MANIFEST.sha256');
const manifest = stagedFiles
  .map((file) => `${sha256(path.join(stageDir, file))}  ${file.replaceAll('\\', '/')}`)
  .join('\n');
fs.writeFileSync(path.join(stageDir, 'MANIFEST.sha256'), `${manifest}\n`, 'utf8');

const tar = spawnSync(
  'tar',
  ['-czf', archivePath, '-C', releaseRoot, packageName],
  { cwd: workspace, encoding: 'utf8' },
);
if (tar.status !== 0) {
  throw new Error(`tar failed:\n${tar.stdout || ''}${tar.stderr || ''}`);
}

const archiveHash = sha256(archivePath);
fs.writeFileSync(`${archivePath}.sha256`, `${archiveHash}  ${path.basename(archivePath)}\n`, 'utf8');

let zipHash = null;
if (process.platform === 'win32') {
  const zip = spawnSync(
    'tar',
    ['-a', '-cf', zipPath, '-C', releaseRoot, packageName],
    { cwd: workspace, encoding: 'utf8' },
  );
  if (zip.status !== 0) {
    throw new Error(`ZIP creation failed:\n${zip.stdout || ''}${zip.stderr || ''}`);
  }
  zipHash = sha256(zipPath);
  fs.writeFileSync(`${zipPath}.sha256`, `${zipHash}  ${path.basename(zipPath)}\n`, 'utf8');
}

console.log(`Release directory: ${stageDir}`);
console.log(`Archive: ${archivePath}`);
console.log(`SHA256: ${archiveHash}`);
if (zipHash) {
  console.log(`ZIP: ${zipPath}`);
  console.log(`ZIP SHA256: ${zipHash}`);
}

function copyFile(source, destination) {
  const sourcePath = path.join(workspace, source);
  const destinationPath = path.join(stageDir, destination);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}

function copyDirectory(source, destination) {
  const sourcePath = path.join(workspace, source);
  const destinationPath = path.join(stageDir, destination);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.cpSync(sourcePath, destinationPath, { recursive: true, dereference: false });
}

function listFiles(root) {
  const files = [];
  const walk = (directory) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(root, absolutePath);
      if (entry.isSymbolicLink()) {
        throw new Error(`Symlinks are not allowed in release input: ${relativePath}`);
      }
      if (entry.isDirectory()) walk(absolutePath);
      else if (entry.isFile()) files.push(relativePath);
    }
  };
  walk(root);
  return files;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function removeGeneratedPath(target) {
  const resolvedRoot = path.resolve(releaseRoot);
  const resolvedTarget = path.resolve(target);
  if (path.dirname(resolvedTarget) !== resolvedRoot || !path.basename(resolvedTarget).startsWith(packageName)) {
    throw new Error(`Refusing to remove path outside the generated release scope: ${resolvedTarget}`);
  }
  if (!fs.existsSync(resolvedTarget)) return;
  const stat = fs.lstatSync(resolvedTarget);
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to remove generated symlink: ${resolvedTarget}`);
  }
  fs.rmSync(resolvedTarget, { recursive: stat.isDirectory(), force: false });
}

function buildInfo() {
  const commit = runGit(['rev-parse', '--short=12', 'HEAD']);
  const dirty = runGit(['status', '--porcelain']).length > 0;
  return {
    name: rootPackage.name,
    version: rootPackage.version,
    target: 'linux-x64',
    builtAt: new Date().toISOString(),
    sourceCommit: commit || null,
    sourceDirty: dirty,
    buildNode: process.version,
    packageManager: rootPackage.packageManager,
  };
}

function runGit(args) {
  const result = spawnSync('git', args, { cwd: workspace, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}
