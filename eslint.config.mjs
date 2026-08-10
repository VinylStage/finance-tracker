import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

// 정적 검사(#감사 S1).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 넣는가
//
// 이 저장소에는 정적 검사가 `node --check` 하나뿐이었다. 그것은 **문법만** 보고,
// 서버 `src/` 만 본다 — 클라이언트는 아예 대상이 아니었다.
//
// 그래서 리팩터링 중 import 를 빠뜨린 채 식별자를 쓰는 코드가 그대로 통과했다.
// 테스트 1,600개가 전부 초록인데 브라우저에서 ReferenceError 로 앱이 죽었다.
// `node --check` 도 Vite 빌드도 정의되지 않은 식별자를 잡지 못한다.
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 규칙이 이것뿐인가
//
// **스타일 규칙을 켜지 않는다.** 목적은 "앱을 죽이는 결함을 정적으로 잡는 것"
// 하나다. 스타일까지 켜면 기존 파일 수백 곳이 걸려 도입 자체가 미뤄지고,
// 잡음 속에서 진짜 오류가 묻힌다.
//
// no-unused-vars 는 경고로 둔다 — 지우다 만 코드를 드러내되 CI 를 막지는 않는다.
// 정말 막아야 하는 것은 no-undef 뿐이다.
// ─────────────────────────────────────────────────────────────────────────

export default [
  {
    ignores: [
      'node_modules/**',
      'client/node_modules/**',
      'client/dist/**',
      'public/**',
      'coverage/**',
      'ref/**',
      'data/**',
    ],
  },

  // 서버·마이그레이션·테스트 — CommonJS + Node 전역
  {
    files: ['src/**/*.js', 'migrations/**/*.js', 'test/**/*.js', '.github/scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
    },
  },

  // 빌드 스크립트·설정 — Node 에서 도는 ESM
  //
  // vite.config.js 는 확장자가 .js 지만 Node 가 실행한다. process·__dirname 을
  // 쓰므로 브라우저 전역만 주면 no-undef 가 잘못 걸린다.
  {
    files: ['scripts/**/*.mjs', '*.config.mjs', 'client/vite.config.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
    },
  },

  // 클라이언트 — ESM + JSX + 브라우저 전역
  {
    files: ['client/src/**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^React$' }],

      // 훅을 조건문·반복문 안에서 부르면 렌더마다 훅 순서가 달라져 React 가
      // 즉시 던진다. no-undef 와 같은 성질(앱이 죽는 결함)이라 에러로 둔다.
      'react-hooks/rules-of-hooks': 'error',

      // 의존성 배열은 조언이다. 이 저장소는 의도적으로 비운 자리마다 이유를
      // 주석으로 적고 disable 해 왔다 — 그 판단을 뒤집지 않는다. 다만 규칙이
      // 등록돼 있어야 기존 disable 주석이 "없는 규칙" 으로 에러가 나지 않는다.
      'react-hooks/exhaustive-deps': 'off',
    },
  },

  // 클라이언트 테스트 — vitest 전역 + Node 전역(process 등을 쓴다)
  {
    files: ['client/src/**/*.test.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.vitest },
    },
  },
];
