import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["_site/", "node_modules/", "vendor/", ".claude/", "**/.venv/", "sw-orcamento.js"] },
  js.configs.recommended,
  {
    // catch vazio é usado de propósito (localStorage bloqueado, @xmldom ausente).
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": ["error", { caughtErrors: "none" }]
    }
  },
  {
    files: ["assets/js/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.browser, JSZip: "readonly" }
    }
  },
  {
    files: ["assets/js/colorize-3mf.js"],
    languageOptions: { sourceType: "module" }
  },
  {
    // Carrega @xmldom/xmldom quando roda nos testes (Node).
    files: ["assets/js/model-parser.js"],
    languageOptions: { globals: { require: "readonly" } }
  },
  {
    files: ["test/**/*.js"],
    // Os testes carregam os scripts do site com global.window = global.
    languageOptions: { sourceType: "commonjs", globals: { ...globals.node, window: "writable" } }
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { sourceType: "module", globals: globals.node }
  }
];
