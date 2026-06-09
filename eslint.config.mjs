import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  { ignores: ['dist/**', 'dist-electron/**', 'release/**', 'coverage/**', 'node_modules/**', 'public/**'] },
  js.configs.recommended,
  ...tseslint.configs['flat/recommended'],
  {
    files: ['src/**/*.ts', 'electron/**/*.ts'],
    languageOptions: { parser: tsparser, ecmaVersion: 2022, sourceType: 'module' },
    // Tolera as diretivas legadas `// eslint-disable-next-line no-console`.
    // `no-console` NÃO é habilitado de propósito: o projeto registra diagnósticos
    // via console em pontos críticos (Lições 34/47).
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      // Convenção do projeto: identificadores `_`-prefixados são intencionalmente não usados.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
      'no-fallthrough': ['error', { allowEmptyCase: true }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];
