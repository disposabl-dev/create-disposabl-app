import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const starter = process.env.BENCHMARK_STARTER!;
const canary = process.env.BENCHMARK_CANARY!;
const output = process.env.BENCHMARK_OUTPUT!;
mkdirSync(output, { recursive: true });
let failed = false;
function run(
  label: string,
  cwd: string,
  command: string,
  args: string[],
  expected = 0,
  required: string[] = [],
) {
  const start = performance.now();
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
  const text = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const ok =
    result.status === expected && required.every((word) => text.includes(word));
  console.log(
    `${label}: ${((performance.now() - start) / 1000).toFixed(3)}s exit=${result.status} expected=${expected} ${ok ? "PASS" : "FAIL"}`,
  );
  writeFileSync(join(output, `${label.replaceAll(/[^\w.-]/g, "_")}.txt`), text);
  if (label.endsWith("-config"))
    writeFileSync(join(output, `${label}.json`), result.stdout ?? "");
  if (!ok) {
    failed = true;
    console.error(text);
  }
}
function measure(label: string, cwd: string, command: string, args: string[]) {
  run(label, cwd, command, args);
}
function compare(name: string, dir: string, generator: boolean) {
  const flat = join(dir, "packages/backend/eslint.benchmark.config.mjs");
  copyFileSync(join(root, ".github/benchmarks/backend-flat.mjs"), flat);
  const eslint = join(dir, "node_modules/.bin/eslint");
  const rows: [string, string, string[], string[]][] = [
    [
      "backend",
      "packages/backend",
      [
        "--config",
        "eslint.benchmark.config.mjs",
        ".",
        "--report-unused-disable-directives",
        "--max-warnings=0",
      ],
      [
        "--config",
        "eslint.benchmark.config.mjs",
        ".",
        "--type-aware",
        "--report-unused-disable-directives",
        "--max-warnings=0",
      ],
    ],
    ["web", "apps/web", ["."], [".", "--type-aware"]],
    [
      "mobile",
      ".",
      [
        "--config",
        "apps/mobile/eslint.config.js",
        "apps/mobile/src",
        "packages/disposabl-kit/mobile",
      ],
      [
        "--config",
        "apps/mobile/eslint.config.js",
        "--disable-nested-config",
        "apps/mobile/src",
        "packages/disposabl-kit/mobile",
        "--type-aware",
      ],
    ],
    ["kit", "packages/disposabl-kit", ["."], [".", "--type-aware"]],
  ];
  if (generator)
    rows.push([
      "generator",
      ".",
      [
        "--config",
        "packages/create-disposabl-app/eslint.config.ts",
        "packages/create-disposabl-app",
        "reset.ts",
      ],
      [
        "--config",
        "packages/create-disposabl-app/eslint.config.ts",
        "--disable-nested-config",
        "packages/create-disposabl-app",
        "reset.ts",
        "--type-aware",
      ],
    ]);
  try {
    for (const [lane, cwd, ea, ba] of rows) {
      const work = resolve(dir, cwd);
      measure(
        `${name}-${lane}-eslint`,
        work,
        lane === "mobile"
          ? join(dir, "apps/mobile/node_modules/.bin/eslint")
          : eslint,
        ea,
      );
      measure(`${name}-${lane}-bun`, work, canary, [
        "lint",
        "--no-script",
        ...ba,
      ]);
    }
    const configs: [string, string, string[], string[]][] = [
      [
        "backend",
        "packages/backend",
        [
          "--config",
          "eslint.benchmark.config.mjs",
          "--print-config",
          "convex/http.ts",
        ],
        [
          "--config",
          "eslint.benchmark.config.mjs",
          "--print-config",
          "convex/http.ts",
        ],
      ],
      [
        "web",
        "apps/web",
        ["--print-config", "src/router.tsx"],
        ["--print-config", "src/router.tsx"],
      ],
      [
        "mobile",
        ".",
        [
          "--config",
          "apps/mobile/eslint.config.js",
          "--print-config",
          "apps/mobile/src/app/_layout.tsx",
        ],
        [
          "--config",
          "apps/mobile/eslint.config.js",
          "--disable-nested-config",
          "--print-config",
          "apps/mobile/src/app/_layout.tsx",
        ],
      ],
    ];
    for (const [lane, cwd, ea, ba] of configs) {
      run(
        `${name}-${lane}-eslint-config`,
        resolve(dir, cwd),
        lane === "mobile"
          ? join(dir, "apps/mobile/node_modules/.bin/eslint")
          : eslint,
        ea,
      );
      run(`${name}-${lane}-bun-config`, resolve(dir, cwd), canary, [
        "lint",
        "--no-script",
        ...ba,
      ]);
    }
    const probes: [string, string, string, string[], string[], string[]][] = [
      [
        "backend",
        "packages/backend/convex/lint_probe.ts",
        `import { mutation } from './_generated/server';\nexport const bad = mutation({ handler: async () => { Promise.resolve(1); return process.env.SECRET; } });\n`,
        ["--config", "eslint.benchmark.config.mjs", "convex/lint_probe.ts"],
        [
          "--config",
          "eslint.benchmark.config.mjs",
          "convex/lint_probe.ts",
          "--type-aware",
        ],
        [
          "@convex-dev/require-args-validator",
          "@convex-dev/no-process-env",
          "@typescript-eslint/no-floating-promises",
        ],
      ],
      [
        "mobile",
        "apps/mobile/src/lint_probe.tsx",
        `import { StyleSheet, View } from 'react-native';\nexport const Probe = () => <View style={{ flex: 1 }} />;\n`,
        [
          "--config",
          "apps/mobile/eslint.config.js",
          "apps/mobile/src/lint_probe.tsx",
        ],
        [
          "--config",
          "apps/mobile/eslint.config.js",
          "--disable-nested-config",
          "apps/mobile/src/lint_probe.tsx",
          "--type-aware",
        ],
        ["no-restricted-imports", "no-restricted-syntax"],
      ],
      [
        "web",
        "apps/web/src/lint_probe.tsx",
        "//missing\nexport const probe = 1;\n",
        ["src/lint_probe.tsx"],
        ["src/lint_probe.tsx", "--type-aware"],
        ["@stylistic/spaced-comment"],
      ],
    ];
    run(
      `${name}-backend-legacy-config`,
      join(dir, "packages/backend"),
      eslint,
      ["--print-config", "convex/http.ts"],
    );
    for (const lane of ["backend", "web", "mobile"]) {
      const e = JSON.parse(
        readFileSync(
          join(output, `${name}-${lane}-eslint-config.json`),
          "utf8",
        ),
      ).rules;
      const b = JSON.parse(
        readFileSync(join(output, `${name}-${lane}-bun-config.json`), "utf8"),
      ).rules;
      const keys = [...new Set([...Object.keys(e), ...Object.keys(b)])].sort();
      writeFileSync(
        join(output, `${name}-${lane}-rule-comparison.json`),
        JSON.stringify(
          Object.fromEntries(
            keys.map((key) => [
              key,
              { eslint: e[key] ?? null, bun: b[key] ?? null },
            ]),
          ),
          null,
          2,
        ),
      );
    }
    const oldRules = JSON.parse(
      readFileSync(join(output, `${name}-backend-legacy-config.json`), "utf8"),
    ).rules;
    const newRules = JSON.parse(
      readFileSync(join(output, `${name}-backend-eslint-config.json`), "utf8"),
    ).rules;
    const differences = [
      ...new Set([...Object.keys(oldRules), ...Object.keys(newRules)]),
    ].filter(
      (key) => JSON.stringify(oldRules[key]) !== JSON.stringify(newRules[key]),
    );
    console.log(
      `${name} legacy-to-flat effective rule differences: ${JSON.stringify(differences)}`,
    );
    if (differences.length) failed = true;
    for (const [lane, file, content, ea, ba, rules] of probes) {
      const p = join(dir, file);
      writeFileSync(p, content, { flag: "wx" });
      const cwd = resolve(
        dir,
        lane === "backend"
          ? "packages/backend"
          : lane === "web"
            ? "apps/web"
            : ".",
      );
      try {
        run(
          `${name}-${lane}-negative-eslint`,
          cwd,
          lane === "mobile"
            ? join(dir, "apps/mobile/node_modules/.bin/eslint")
            : eslint,
          ea,
          1,
          rules,
        );
        run(
          `${name}-${lane}-negative-bun`,
          cwd,
          canary,
          ["lint", "--no-script", ...ba],
          1,
          rules,
        );
      } finally {
        rmSync(p);
      }
    }
  } finally {
    rmSync(flat);
  }
}
compare("product", root, true);
compare("starter", starter, false);
if (failed) process.exitCode = 1;
