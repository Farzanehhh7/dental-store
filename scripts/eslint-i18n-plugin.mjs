const PERSIAN_CHAR_RE = /[\u0600-\u06FF]/;

function isInsideTranslationFallback(node) {
  let curr = node?.parent;
  while (curr) {
    if (
      curr.type === 'CallExpression' &&
      curr.callee &&
      ((curr.callee.type === 'Identifier' && curr.callee.name === 't') ||
        (curr.callee.type === 'MemberExpression' &&
          curr.callee.property &&
          curr.callee.property.name === 't'))
    ) {
      return true;
    }
    if (curr.type === 'JSXElement' || curr.type === 'JSXFragment' || curr.type === 'JSXAttribute') {
      return false;
    }
    curr = curr.parent;
  }
  return false;
}

export const dentalI18nPlugin = {
  meta: {
    name: 'dental-i18n',
    version: '1.0.0',
  },
  rules: {
    'no-hardcoded-persian-jsx': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow hardcoded Persian/Arabic string literals in JSX text and attributes',
        },
        schema: [],
        messages: {
          hardcodedPersianJsx:
            'Hardcoded Persian text in JSX is forbidden; extract "{{sample}}" into src/messages/fa.json & en.json via useI18n().t(...).',
        },
      },
      create(context) {
        const reportIfPersian = (node, rawText) => {
          if (typeof rawText !== 'string' || !PERSIAN_CHAR_RE.test(rawText)) return;
          if (isInsideTranslationFallback(node)) return;
          const sample = rawText.trim().replace(/\s+/g, ' ').slice(0, 48);
          context.report({
            node,
            messageId: 'hardcodedPersianJsx',
            data: { sample },
          });
        };

        const isInsideJsx = (node) => {
          let curr = node?.parent;
          while (curr) {
            if (
              curr.type === 'JSXExpressionContainer' ||
              curr.type === 'JSXAttribute' ||
              curr.type === 'JSXElement' ||
              curr.type === 'JSXFragment'
            ) {
              return true;
            }
            if (
              curr.type === 'VariableDeclaration' ||
              curr.type === 'FunctionDeclaration' ||
              curr.type === 'Program'
            ) {
              return false;
            }
            curr = curr.parent;
          }
          return false;
        };

        return {
          JSXText(node) {
            reportIfPersian(node, node.value);
          },
          JSXAttribute(node) {
            if (node.value && node.value.type === 'Literal' && typeof node.value.value === 'string') {
              reportIfPersian(node.value, node.value.value);
            }
          },
          'JSXExpressionContainer Literal'(node) {
            if (typeof node.value === 'string' && isInsideJsx(node)) {
              reportIfPersian(node, node.value);
            }
          },
          'JSXExpressionContainer TemplateElement'(node) {
            const raw = node.value?.cooked ?? node.value?.raw ?? '';
            if (isInsideJsx(node)) {
              reportIfPersian(node, raw);
            }
          },
        };
      },
    },
  },
};
