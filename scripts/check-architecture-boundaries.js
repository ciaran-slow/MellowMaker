const { ESLint } = require('eslint');

const forbiddenImports = [
  {
    filePath: 'src/domain/reviewProbe.ts',
    code: "import { CraftCard } from '../ui/components/CraftCard';\nvoid CraftCard;",
  },
  {
    filePath: 'src/domain/reviewProbe.ts',
    code: "import { CraftCard } from '@/ui/components/CraftCard';\nvoid CraftCard;",
  },
  {
    filePath: 'src/data/reviewProbe.ts',
    code: "import { CraftCard } from '../ui/components/CraftCard';\nvoid CraftCard;",
  },
  {
    filePath: 'src/data/reviewProbe.ts',
    code: "import { CraftCard } from '@/ui/components/CraftCard';\nvoid CraftCard;",
  },
  {
    filePath: 'src/features/reviewProbe.ts',
    code: "import '../data/patterns/sqlite/PatternRepository';",
  },
  {
    filePath: 'src/features/reviewProbe.ts',
    code: "import '@/data/patterns/sqlite/PatternRepository';",
  },
];

async function main() {
  const eslint = new ESLint();

  for (const probe of forbiddenImports) {
    const [result] = await eslint.lintText(probe.code, {
      filePath: probe.filePath,
    });
    const rejected = result.messages.some(
      ({ ruleId }) => ruleId === 'no-restricted-imports',
    );

    if (!rejected) {
      throw new Error(`Architecture lint accepted forbidden import:\n${probe.code}`);
    }
  }

  const [allowed] = await eslint.lintText(
    "import { CraftCard } from './CraftCard';\nvoid CraftCard;",
    { filePath: 'src/ui/components/reviewProbe.ts' },
  );
  const errors = allowed.messages.filter(({ severity }) => severity === 2);

  if (errors.length > 0) {
    throw new Error(
      `Architecture lint rejected an allowed same-layer import:\n${JSON.stringify(errors)}`,
    );
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
