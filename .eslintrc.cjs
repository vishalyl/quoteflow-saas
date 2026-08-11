module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'supabase/functions'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

    // Turned off deliberately, not by neglect: this is a plain-JavaScript
    // codebase with no prop-types anywhere, so the rule produced ~100 errors
    // that made `npm run lint` useless as a gate — which is worse than not
    // having the rule. Type safety should come from migrating the data layer
    // and domain modules to TypeScript, not from prop-types.
    'react/prop-types': 'off',
  },
  overrides: [
    {
      // Vitest globals.
      files: ['**/*.test.js', '**/*.test.jsx'],
      env: { node: true },
      globals: { describe: 'readonly', it: 'readonly', expect: 'readonly', vi: 'readonly' },
    },
  ],
}
