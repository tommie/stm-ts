import eslint from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  prettierConfig,

  {
    rules: {
      // Typescript checks for this.
      "no-fallthrough": "off",
      "prefer-const": [
        "error",
        {
          destructuring: "all",
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          // Adding an underscore allows giving a name, while acknowleding it's unused.
          // This is what Typescript does.
          argsIgnorePattern: "^_",

          // We don't want to allow ignored variables, but sadly this setting is also
          // used for generic parameters.
          varsIgnorePattern: "^_",

          // Destructuring can be used to omit some data.
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
);
