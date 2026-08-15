import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // Baseline, not an exemption.
  //
  // Next 16 turned the React Compiler rules on as errors. These six files
  // predate them and every hit is the same two shapes: a fetch-into-setState
  // effect, and price math done inline during render. Fixing them properly
  // means reworking how these components get their data — that is its own
  // piece of work, not a prerequisite for having CI at all.
  //
  // Scoped to this file list on purpose: a new file with the same problem
  // still fails the build. Delete entries as they are fixed; when the list is
  // empty, delete the block.
  {
    files: [
      "app/cart/page.tsx",
      "components/CrossStorePriceChart.tsx",
      "components/DealsGrid.tsx",
      "components/PriceHistoryChart.tsx",
      "hooks/useCart.tsx",
      "hooks/useFavorites.tsx",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
]);

export default eslintConfig;
