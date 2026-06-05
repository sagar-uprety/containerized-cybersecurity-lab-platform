const js = require('@eslint/js');
const playwright = require('eslint-plugin-playwright');
const prettier = require('eslint-config-prettier');

module.exports = [
    {
    },
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                __dirname: 'readonly',
                console: 'readonly',
                module: 'readonly',
                process: 'readonly',
                require: 'readonly',
                window: 'readonly',
            },
        },
        plugins: {
            playwright,
        },
        rules: {
            ...js.configs.recommended.rules,
            ...playwright.configs['flat/recommended'].rules,
            'no-console': 'off',
        },
    },
    prettier,
];
