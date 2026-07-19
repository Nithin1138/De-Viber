import Docker from 'dockerode';
import chalk from 'chalk';
import * as tar from 'tar';
import { join, resolve } from 'node:path';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import type {
  VerificationResult,
  VerificationDiff,
  RoutePingResult,
} from '../types.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function demuxDockerLogs(buffer: Buffer): string {
  let offset = 0;
  let result = '';
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) break;
    const size = buffer.readUInt32BE(offset + 4);
    if (offset + 8 + size > buffer.length) break;
    const content = buffer.subarray(offset + 8, offset + 8 + size);
    result += content.toString('utf8');
    offset += 8 + size;
  }
  if (result === '' && buffer.length > 0) {
    return buffer.toString('utf8');
  }
  return result;
}

function withTimeout<T>(promise: Promise<T>, timeoutSeconds: number, errorMessage: string): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutSeconds * 1000);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

export class DockerVerifier {
  private docker: Docker;

  constructor() {
    this.docker = new Docker();
  }

  /**
   * Check if Docker daemon is running.
   */
  async checkDockerStatus(): Promise<void> {
    try {
      await this.docker.ping();
    } catch (err: any) {
      throw new Error(
        "Docker daemon is not running or Docker is not installed.\n" +
        "Please make sure Docker Desktop is started and running, then try again.\n" +
        "Error details: " + err.message
      );
    }
  }

  /**
   * Extract files from git ref to a temporary folder.
   */
  async extractGitRef(projectRoot: string, ref: string, destPath: string): Promise<void> {
    try {
      // Check if git repository is initialized
      if (!existsSync(join(projectRoot, '.git'))) {
        throw new Error('Project is not a Git repository. Cannot compare with a baseline ref.');
      }

      // Check if ref exists
      try {
        execSync(`git show "${ref}" --`, { cwd: projectRoot, stdio: 'ignore' });
      } catch {
        throw new Error(`Git baseline ref "${ref}" does not exist in this repository.`);
      }

      await mkdir(destPath, { recursive: true });
      execSync(`git archive "${ref}" | tar -x -C "${destPath}"`, { cwd: projectRoot });
    } catch (err: any) {
      throw new Error(`Failed to extract baseline Git ref "${ref}": ${err.message}`);
    }
  }

  /**
   * Scan files in target path for route definitions.
   */
  private async scanRoutes(dirPath: string): Promise<string[]> {
    const routes = new Set<string>(['/']);
    const routePatterns = [
      /path:\s*['"`](\/[\w\-\/:*]*)['"`]/g,
      /app\.(?:get|post|put|delete|use)\s*\(\s*['"`](\/[\w\-\/:*]*)['"`]/g,
      /router\.(?:get|post|put|delete|use)\s*\(\s*['"`](\/[\w\-\/:*]*)['"`]/g,
      /<Route\s+[^>]*path\s*=\s*['"`](\/[\w\-\/:*]*)['"`]/g,
    ];

    const findSourceFiles = (dir: string): string[] => {
      const results: string[] = [];
      try {
        const list = execSync('find . -type f -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx"', {
          cwd: dir,
          encoding: 'utf-8',
        }).split('\n');
        for (const file of list) {
          const trimmed = file.trim();
          if (trimmed && !trimmed.includes('node_modules') && !trimmed.includes('dist')) {
            results.push(resolve(dir, trimmed));
          }
        }
      } catch {
        // Find might fail/be empty
      }
      return results;
    };

    try {
      const files = findSourceFiles(dirPath);
      const { readFileSync } = await import('node:fs');
      for (const file of files) {
        try {
          const content = readFileSync(file, 'utf-8');
          for (const pattern of routePatterns) {
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(content)) !== null) {
              let route = match[1];
              if (route.includes(':')) {
                route = route.split('/:')[0];
              }
              if (route && route.startsWith('/') && !route.includes('*')) {
                routes.add(route);
              }
            }
          }
        } catch {
          // ignore read errors
        }
      }
    } catch {
      // ignore scan errors
    }

    return Array.from(routes);
  }

  /**
   * Run verification on a project folder.
   */
  async verifyPath(
    dirPath: string,
    projectName: string,
    suffix: string,
    timeoutSeconds: number
  ): Promise<VerificationResult> {
    const timestamp = Date.now();
    const imageName = `deviber-verify-${projectName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${suffix}:${timestamp}`;
    const dockerfilePath = join(dirPath, 'Dockerfile');
    let hasDockerfile = existsSync(dockerfilePath);

    let containerTest: any = null;
    let containerApp: any = null;

    try {
      if (!hasDockerfile) {
        // Create custom Dockerfile
        const dockerfileContent = this.generateDockerfile();
        await writeFile(dockerfilePath, dockerfileContent, 'utf-8');
      }

      console.log(`🔨 Building Docker image: ${imageName}`);
      const tarStream = tar.c({ gzip: false, cwd: dirPath }, ['.']);
      const buildStream = await this.docker.buildImage(tarStream as any, { t: imageName } as any);

      await withTimeout(
        new Promise<void>((resolve, reject) => {
          this.docker.modem.followProgress(
            buildStream as any,
            (err, res) => {
              if (err) reject(err);
              else resolve();
            },
            (event) => {
              if (event.stream) {
                process.stdout.write(event.stream);
              }
              if (event.error) {
                reject(new Error(event.error));
              }
            }
          );
        }),
        timeoutSeconds,
        `Build timed out after ${timeoutSeconds}s`
      );

      // Read package.json to inspect scripts
      let packageJson: any = {};
      const pkgPath = join(dirPath, 'package.json');
      if (existsSync(pkgPath)) {
        const { readFileSync } = await import('node:fs');
        packageJson = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      }

      let testPassed: boolean | undefined;
      let testPassedCount = 0;
      let testFailedCount = 0;
      let testOutput = '';

      const testScript = packageJson.scripts?.test;
      if (testScript && !testScript.includes('vitest') && !testScript.includes('jest')) {
        // Run tests if script exists
        console.log(`🧪 Running test suite...`);
        containerTest = await this.docker.createContainer({
          Image: imageName,
          Cmd: ['npm', 'test'],
        });

        await containerTest.start();

        await withTimeout(
          containerTest.wait(),
          timeoutSeconds,
          `Test suite timed out after ${timeoutSeconds}s`
        );

        const logsBuffer = await containerTest.logs({ stdout: true, stderr: true });
        testOutput = demuxDockerLogs(logsBuffer);
        console.log(testOutput);

        const inspectData = await containerTest.inspect();
        testPassed = inspectData.State.ExitCode === 0;

        // Try to parse tests output to find passed/failed count
        const passMatch = testOutput.match(/(\d+)\s+passed/i);
        const failMatch = testOutput.match(/(\d+)\s+failed/i);
        testPassedCount = passMatch ? parseInt(passMatch[1], 10) : (testPassed ? 1 : 0);
        testFailedCount = failMatch ? parseInt(failMatch[1], 10) : (testPassed ? 0 : 1);
      }

      // Check routes
      console.log(`🌐 Booting application container...`);
      const routesToPing = await this.scanRoutes(dirPath);
      console.log(`  Discovered routes to check: ${routesToPing.join(', ')}`);

      let startCmd: string[] | undefined;
      const allDeps = {
        ...(packageJson.dependencies ?? {}),
        ...(packageJson.devDependencies ?? {}),
      };
      if (allDeps.vite) {
        startCmd = ['npx', 'vite', '--host', '0.0.0.0', '--port', '3000'];
      } else {
        startCmd = packageJson.scripts?.start
          ? ['npm', 'start']
          : packageJson.scripts?.dev
            ? ['npm', 'run', 'dev']
            : undefined;
      }

      containerApp = await this.docker.createContainer({
        Image: imageName,
        Cmd: startCmd,
        ExposedPorts: {
          '3000/tcp': {},
          '5173/tcp': {},
        },
        HostConfig: {
          PortBindings: {
            '3000/tcp': [{ HostPort: '' }],
            '5173/tcp': [{ HostPort: '' }],
          },
        },
      });

      await containerApp.start();

      // Wait for container to be ready and inspect port bindings
      const inspectData = await containerApp.inspect();
      const ports = inspectData.NetworkSettings.Ports;
      const mappedPorts: string[] = [];
      if (ports['3000/tcp'] && ports['3000/tcp'][0]) {
        mappedPorts.push(ports['3000/tcp'][0].HostPort);
      }
      if (ports['5173/tcp'] && ports['5173/tcp'][0]) {
        mappedPorts.push(ports['5173/tcp'][0].HostPort);
      }

      if (mappedPorts.length === 0) {
        throw new Error('Application container booted but exposed no ports (3000 or 5173).');
      }

      console.log(`  Mapped host ports: ${mappedPorts.join(', ')}`);

      // Ping routes on mapped ports
      const routesChecked: RoutePingResult[] = [];
      for (const route of routesToPing) {
        let pingSuccess = false;
        let finalStatus = 0;
        let lastError = '';

        // Try mapped ports
        for (const port of mappedPorts) {
          const url = `http://127.0.0.1:${port}${route}`;
          let retries = 5;
          while (retries > 0 && !pingSuccess) {
            try {
              console.log(`  Probing URL: ${url} (retry ${6 - retries}/5)...`);
              const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
              finalStatus = res.status;
              if (res.status >= 200 && res.status < 500) { // count 404 as server responding successfully (application booted)
                pingSuccess = true;
                console.log(`  URL ${url} responded with ${res.status}`);
              } else {
                lastError = `HTTP ${res.status}`;
              }
            } catch (err: any) {
              lastError = `${err.name}: ${err.message}`;
              if (err.cause) {
                lastError += ` (Cause: ${err.cause.message})`;
              }
            }
            if (!pingSuccess) {
              await sleep(1000);
            }
            retries--;
          }
          if (pingSuccess) break;
        }

        routesChecked.push({
          route,
          statusCode: finalStatus,
          success: pingSuccess,
          error: pingSuccess ? undefined : lastError,
        });
      }

      const anyFailed = routesChecked.some((r) => !r.success);
      if (anyFailed && containerApp) {
        console.log(chalk.yellow('⚠️ Some route checks failed. Fetching application container logs:'));
        try {
          const logsBuffer = await containerApp.logs({ stdout: true, stderr: true });
          const appLogs = demuxDockerLogs(logsBuffer);
          console.log(chalk.dim(appLogs));
        } catch (logErr: any) {
          console.warn(`Could not fetch container logs: ${logErr.message}`);
        }
      }

      return {
        built: true,
        testPassed,
        testPassedCount,
        testFailedCount,
        testOutput,
        routesChecked,
      };
    } catch (err: any) {
      return {
        built: false,
        buildError: err.message,
        routesChecked: [],
      };
    } finally {
      // Cleanup
      if (!hasDockerfile) {
        await rm(dockerfilePath, { force: true });
      }
      if (containerTest) {
        await containerTest.remove({ force: true }).catch(() => {});
      }
      if (containerApp) {
        await containerApp.stop().catch(() => {});
        await containerApp.remove({ force: true }).catch(() => {});
      }
      // Remove built image
      await this.docker.getImage(imageName).remove({ force: true }).catch(() => {});
    }
  }

  /**
   * Run compare and produce a VerificationDiff.
   */
  compare(baseline: VerificationResult | undefined, current: VerificationResult): VerificationDiff {
    const regressions: string[] = [];

    if (!current.built) {
      regressions.push(`Current build failed: ${current.buildError}`);
    }

    if (baseline) {
      if (baseline.built && !current.built) {
        regressions.push('Build failed in current version but succeeded in baseline.');
      }

      if (baseline.testPassed && current.testPassed === false) {
        regressions.push('Tests passed in baseline but failed in current version.');
      }

      if (
        baseline.testPassedCount !== undefined &&
        current.testPassedCount !== undefined &&
        current.testPassedCount < baseline.testPassedCount
      ) {
        regressions.push(
          `Test pass count decreased from ${baseline.testPassedCount} in baseline to ${current.testPassedCount} in current.`
        );
      }

      // Compare route pings
      for (const basePing of baseline.routesChecked) {
        const curPing = current.routesChecked.find((r) => r.route === basePing.route);
        if (!curPing) {
          regressions.push(`Route "${basePing.route}" is missing in current version.`);
        } else if (basePing.success && !curPing.success) {
          regressions.push(
            `Route "${basePing.route}" succeeded in baseline (${basePing.statusCode}) but failed in current (${curPing.statusCode || curPing.error}).`
          );
        }
      }
    }

    return {
      pass: regressions.length === 0,
      baseline,
      current,
      regressions,
    };
  }

  /**
   * Find and clean up orphaned Docker resources.
   */
  async cleanOrphanedResources(): Promise<void> {
    const containers = await this.docker.listContainers({ all: true });
    for (const c of containers) {
      if (c.Image.startsWith('deviber-verify-') || c.Names.some((n) => n.includes('deviber-verify-'))) {
        const container = this.docker.getContainer(c.Id);
        if (c.State === 'running') {
          await container.stop().catch(() => {});
        }
        await container.remove({ force: true }).catch(() => {});
        console.log(`Cleaned container: ${c.Id}`);
      }
    }

    const images = await this.docker.listImages();
    for (const img of images) {
      if (img.RepoTags && img.RepoTags.some((tag) => tag.startsWith('deviber-verify-'))) {
        for (const tag of img.RepoTags) {
          await this.docker.getImage(tag).remove({ force: true }).catch(() => {});
          console.log(`Cleaned image: ${tag}`);
        }
      }
    }
  }

  private generateDockerfile(): string {
    return `FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.js* yarn.lo* pnpm-lock.ya* ./

RUN if [ -f pnpm-lock.yaml ]; then \
      npm install -g pnpm && pnpm install --frozen-lockfile; \
    elif [ -f yarn.lock ]; then \
      yarn install --frozen-lockfile; \
    else \
      npm install; \
    fi

COPY . .

RUN if npm run | grep -q "build"; then \
      if [ -f pnpm-lock.yaml ]; then pnpm build; \
      elif [ -f yarn.lock ]; then yarn build; \
      else npm run build; fi \
    fi

EXPOSE 3000
EXPOSE 5173
ENV PORT=3000
ENV HOST=0.0.0.0
`;
  }
}
