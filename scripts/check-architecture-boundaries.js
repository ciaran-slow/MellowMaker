const fs = require('node:fs/promises');
const path = require('node:path');
const { ESLint } = require('eslint');

const projectRoot = process.cwd();
const platformAdapterPath = path.join(
  projectRoot,
  'src/platform/sqliteAdapter.ts',
);
const dataAdapterPath = path.join(projectRoot, 'src/data/sqliteAdapter.ts');
const dataContractPath = path.join(
  projectRoot,
  'src/data/contracts/Repository.ts',
);

const virtualForbiddenImports = [
  {
    filePath: 'src/domain/reviewProbe.ts',
    code: "import { CraftCard } from '../ui/components/CraftCard';\nvoid CraftCard;",
    ruleId: 'no-restricted-imports',
  },
  {
    filePath: 'src/domain/reviewProbe.ts',
    code: "import { CraftCard } from '@/ui/components/CraftCard';\nvoid CraftCard;",
    ruleId: 'no-restricted-imports',
  },
  {
    filePath: 'src/data/reviewProbe.ts',
    code: "import { CraftCard } from '../ui/components/CraftCard';\nvoid CraftCard;",
    ruleId: 'no-restricted-imports',
  },
  {
    filePath: 'src/data/reviewProbe.ts',
    code: "import { CraftCard } from '@/ui/components/CraftCard';\nvoid CraftCard;",
    ruleId: 'no-restricted-imports',
  },
];

async function writeProbeFile(filePath, code, createdPaths) {
  try {
    await fs.writeFile(filePath, code, { flag: 'wx' });
    createdPaths.push(filePath);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      error.code !== 'EEXIST'
    ) {
      throw error;
    }
  }
}

function expectRejected(result, code, ruleId) {
  const rejected = result.messages.some((message) => message.ruleId === ruleId);

  if (!rejected) {
    throw new Error(`Architecture lint accepted forbidden import:\n${code}`);
  }
}

async function main() {
  const eslint = new ESLint({ cwd: projectRoot });

  for (const probe of virtualForbiddenImports) {
    const [result] = await eslint.lintText(probe.code, {
      filePath: probe.filePath,
    });
    expectRejected(result, probe.code, probe.ruleId);
  }

  const createdPaths = [];
  const probeRoots = [];

  try {
    const featureProbeRoot = await fs.mkdtemp(
      path.join(projectRoot, 'src/features/architecture-lint-'),
    );
    probeRoots.push(featureProbeRoot);
    const uiProbeRoot = await fs.mkdtemp(
      path.join(projectRoot, 'src/ui/architecture-lint-'),
    );
    probeRoots.push(uiProbeRoot);

    await fs.mkdir(path.dirname(platformAdapterPath), { recursive: true });
    await fs.mkdir(path.dirname(dataContractPath), { recursive: true });
    await writeProbeFile(
      platformAdapterPath,
      'export const sqliteAdapter = {};\n',
      createdPaths,
    );
    await writeProbeFile(
      dataAdapterPath,
      'export const sqliteAdapter = {};\n',
      createdPaths,
    );
    await writeProbeFile(
      dataContractPath,
      'export interface Repository {}\n',
      createdPaths,
    );

    const featureDeepRoot = path.join(featureProbeRoot, 'presentation/deep');
    const uiDeepRoot = path.join(uiProbeRoot, 'components/deep');
    await Promise.all([
      fs.mkdir(featureDeepRoot, { recursive: true }),
      fs.mkdir(uiDeepRoot, { recursive: true }),
    ]);

    const physicalProbes = [
      {
        filePath: path.join(featureDeepRoot, 'platformAlias.ts'),
        code: "import '@/platform/sqliteAdapter';",
        forbidden: true,
      },
      {
        filePath: path.join(featureDeepRoot, 'platformRelative.ts'),
        code: "import '../../../../platform/sqliteAdapter';",
        forbidden: true,
      },
      {
        filePath: path.join(uiDeepRoot, 'platformAlias.ts'),
        code: "import '@/platform/sqliteAdapter';",
        forbidden: true,
      },
      {
        filePath: path.join(uiDeepRoot, 'platformRelative.ts'),
        code: "import '../../../../platform/sqliteAdapter';",
        forbidden: true,
      },
      {
        filePath: path.join(featureDeepRoot, 'dataAlias.ts'),
        code: "import '@/data/sqliteAdapter';",
        forbidden: true,
      },
      {
        filePath: path.join(featureDeepRoot, 'dataRelative.ts'),
        code: "import '../../../../data/sqliteAdapter';",
        forbidden: true,
      },
      {
        filePath: path.join(featureDeepRoot, 'contractAlias.ts'),
        code: "import '@/data/contracts/Repository';",
        forbidden: false,
      },
      {
        filePath: path.join(featureDeepRoot, 'contractRelative.ts'),
        code: "import '../../../../data/contracts/Repository';",
        forbidden: false,
      },
    ];

    for (const probe of physicalProbes) {
      await fs.writeFile(probe.filePath, `${probe.code}\n`);
      const [result] = await eslint.lintFiles([probe.filePath]);

      if (probe.forbidden) {
        expectRejected(result, probe.code, 'import/no-restricted-paths');
      } else {
        const errors = result.messages.filter(({ severity }) => severity === 2);
        if (errors.length > 0) {
          throw new Error(
            `Architecture lint rejected an allowed contract import:\n${probe.code}\n${JSON.stringify(errors)}`,
          );
        }
      }
    }

    const [allowedSameLayer] = await eslint.lintText(
      "import { CraftCard } from './CraftCard';\nvoid CraftCard;",
      { filePath: 'src/ui/components/reviewProbe.ts' },
    );
    const sameLayerErrors = allowedSameLayer.messages.filter(
      ({ severity }) => severity === 2,
    );

    if (sameLayerErrors.length > 0) {
      throw new Error(
        `Architecture lint rejected an allowed same-layer import:\n${JSON.stringify(sameLayerErrors)}`,
      );
    }
  } finally {
    await Promise.all(
      probeRoots.map((probeRoot) =>
        fs.rm(probeRoot, { recursive: true, force: true }),
      ),
    );
    await Promise.all(createdPaths.map((filePath) => fs.rm(filePath)));

    for (const directory of [
      path.dirname(dataContractPath),
      path.dirname(dataAdapterPath),
      path.dirname(platformAdapterPath),
    ]) {
      try {
        await fs.rmdir(directory);
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !('code' in error) ||
          !['ENOENT', 'ENOTEMPTY'].includes(error.code)
        ) {
          throw error;
        }
      }
    }
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
