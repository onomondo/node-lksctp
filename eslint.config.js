/* c8 ignore start */

module.exports = [
  {
    rules: {
      "global-require": "off",
      "quote-props": ["warn", "consistent-as-needed"],

      "quotes": ["error", "double", {
        allowTemplateLiterals: true,
      }],

      "no-plusplus": "error",
      "no-nested-ternary": "error",
      "no-multiple-empty-lines": "error",
      "no-inline-comments": "off",
      "no-lonely-if": "error",
      "no-array-constructor": "error",
      "no-delete-var": "error",
      "no-param-reassign": "error",
      "no-return-assign": "error",
      "no-import-assign": "error",
      "no-multi-assign": "error",
      "keyword-spacing": "error",

      "max-len": ["warn", {
        code: 140,
      }],

      "max-params": ["error", 4],
      "max-statements": ["error", 15],
      "no-loss-of-precision": "error",
      "no-unreachable-loop": "error",
      "require-atomic-updates": "error",
      "complexity": ["error", 5],

      "max-statements-per-line": ["error", {
        max: 1,
      }],

      "no-tabs": "error",
      "no-underscore-dangle": "error",
      "no-negated-condition": "error",
      "no-use-before-define": "error",

      "no-shadow": "error",

      "no-labels": "error",
      "no-throw-literal": "error",
      "default-case": "error",
      "default-case-last": "error",
      "no-caller": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new": "error",
      "no-new-func": "error",
      "no-new-object": "error",
      "no-new-wrappers": "error",
      "no-useless-concat": "error",

      "no-unused-vars": ["error", {
        ignoreRestSiblings: true,
      }],

      "array-bracket-newline": ["error", "consistent"],
      "func-names": ["error", "never"],

      "func-style": ["error", "expression", {
        allowArrowFunctions: true,
      }],

      "max-depth": ["error", 4],
      "arrow-parens": "error",
      "no-confusing-arrow": "error",
      "prefer-const": "error",
      "rest-spread-spacing": ["error", "never"],
      "template-curly-spacing": ["error", "never"],
      "prefer-rest-params": "error",
      "prefer-spread": "error",
      "prefer-template": "error",
      "object-shorthand": ["error", "properties"],
      "no-var": "error",
      "no-useless-computed-key": "error",
      "array-callback-return": "error",
      "consistent-return": "error",
      "dot-notation": "error",
      "eqeqeq": "error",
      "no-eq-null": "error",
      "no-implicit-coercion": "error",
      "no-multi-spaces": ["error", {
        ignoreEOLComments: true,
      }],
      "no-proto": "error",
      "yoda": "error",
      "indent": ["error", 2],
      "object-curly-spacing": ["error", "always"],

      "object-curly-newline": ["error", {
        consistent: true,
        multiline: true,
      }],

      "space-before-blocks": "error",
      "space-before-function-paren": ["error", "always"],
      "spaced-comment": "error",
      "no-whitespace-before-property": "error",

      "brace-style": ["error", "1tbs", {
        allowSingleLine: false,
      }],

      "eol-last": ["error", "always"],
      "func-call-spacing": ["error", "never"],
      "semi": ["error", "always"],
    }
  }
];
/* c8 ignore stop */
