import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // 여러 세션이 각자 워크트리에서 미리보기를 띄우면 API 포트가 서로 달라야
      // 한다. 여기가 3000 으로 고정돼 있으면 내 화면이 남의 서버에 붙는다 —
      // 포트만 나눠도 프록시가 따라오지 않으면 격리가 성립하지 않는다.
      '/api': process.env.VITE_API_TARGET || 'http://localhost:3000',
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
      // 시점의 실측(7.36/8.20/7.35/7.82)에서 1%p 아래로 잡고 "페이지 컴포넌트를
      // 덮으면서 함께 올린다" 고 적어 뒀는데, 실측이 48% 까지 올라오는 동안
      // 방어선은 6 에 남아 있었다. **커버리지가 48% 에서 7% 로 떨어져도 CI 가
      // 초록이었다** — 게이트가 있는 것처럼 보이지만 없는 것과 같았다(감사 S3).
      //
      // 2026-08-05 재실측(62.79/61.49/54.47/66.05)에서 약 2%p 아래로 맞춘다.
      // 앞선 값(50.08/50.56/43.58/52.40) 이후 페이지 스모크와 카드 비활성화
      // 작업이 들어오면서 12%p 가량 올랐다.
      //
      // 올릴 때마다 그 시점 실측을 함께 적는다 — 근거 없이 내려가지 않게.
      //
      // 주의: client/src/lib 의 일부 모듈(theme, nav, onboarding 등)은 루트의
      // node:test 가 검증하고 있어 이 리포트에서는 0% 로 잡힌다. 이 숫자는
      // 클라이언트 실제 커버리지를 과소평가한다.
      thresholds: {
        statements: 60,
        branches: 59,
        functions: 52,
        lines: 64,
      },
    },
  },
});
