// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'supabase/functions/*'],
  },
  {
    files: ['src/components/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}'],
    rules: {
      // All colors come from src/theme/tokens.ts.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
          message: 'Use a color token from @/theme/tokens instead of a raw hex value.',
        },
      ],
    },
  },
]);
