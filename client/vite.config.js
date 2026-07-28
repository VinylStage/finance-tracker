import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../public'),
    emptyOutDir: true,
  },
  // 컴포넌트 테스트(#212). 루트의 node:test 는 DOM 이 없어서 .jsx 를 못 다룬다.
  //
  // include 를 client/src 아래로 한정한다 — 루트 test/ 에는 node:test 로 도는
  // 파일이 있어서 vitest 가 같이 집어가면 중복 실행되고 러너가 서로 다른 API 로 깨진다.
  //
  // 커버리지 대상에서 진입점(main.jsx)과 라우팅 껍데기는 뺀다. 렌더 트리를
  // 통째로 띄우는 것 말고는 의미 있는 단언을 붙일 수 없고, 그건 통합 테스트의 몫이다.
  test: {
    environment: 'jsdom',
    globals: true,
    // 루트의 node --test 가 test/ 디렉터리를 훑기 때문에 src/test/ 아래에 두면
    // 이 파일을 테스트로 착각해 실행하고 실패한다. client 루트에 둔다.
    setupFiles: ['./vitest.setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx', 'src/**/*.test.{js,jsx}'],
      // 품질 기준이 아니라 회귀 방지선이다. 컴포넌트 테스트가 처음 들어온
      // 시점의 실측(7.36/8.20/7.35/7.82)에서 1%p 아래로 잡았다.
      // 페이지 컴포넌트를 덮으면서 함께 올린다.
      //
      // 주의: client/src/lib 의 일부 모듈(theme, nav, onboarding 등)은 루트의
      // node:test 가 검증하고 있어 이 리포트에서는 0% 로 잡힌다. 이 숫자는
      // 클라이언트 실제 커버리지를 과소평가한다.
      thresholds: {
        statements: 6,
        branches: 7,
        functions: 6,
        lines: 6,
      },
    },
  },
});
