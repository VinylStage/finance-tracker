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
    globals: true,
    // 환경을 두 갈래로 나눈다(#619).
    //
    // 파일마다 jsdom 을 새로 만드는 비용이 컸다. 실측(106파일): `environment` 만
    // 36초, 파일당 약 350ms 다. 코어가 적은 CI 러너에서는 이 합이 벽시계에 그대로
    // 실려 클라이언트 테스트가 90초를 먹었다 — CI 전체 150초의 60% 다.
    //
    // `src/lib` 의 순수 로직은 DOM 이 필요 없다. 그런데 **공용 셋업이 필요하게
    // 만들고 있었다** — `vitest.setup.js` 가 `@testing-library/react` 를 import 해서,
    // node 환경으로 돌리면 테스트에 들어가기도 전에
    // `ReferenceError: HTMLElement is not defined` 로 죽는다.
    //
    // 그래서 셋업이 안 걸리는 갈래를 따로 둔다. 테스트 내용은 하나도 안 바뀐다.
    projects: [
      {
        // DOM 이 필요 없는 순수 로직.
        //
        // `src/lib` 에도 브라우저 API 를 만지는 파일이 다섯 있는데, 그 파일들은
        // 자기 첫 줄에 `@vitest-environment jsdom` 을 달아 **스스로** 갈래를 바꾼다.
        // 여기에 목록으로 빼지 않는 이유는, 목록은 파일이 늘거나 성격이 바뀔 때
        // 같이 안 고쳐지기 때문이다.
        //
        // 그 다섯도 셋업은 필요 없다 — 셋업이 주는 것은 `ResizeObserver` 스텁뿐이고
        // 다섯 중 아무도 안 쓴다(실측).
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/lib/**/*.test.{js,jsx}'],
        },
      },
      {
        // ── 오래 걸리는 화면 테스트 세 개(#630)
        //
        // 이 셋이 전체 57.6초 중 **19.8초(34%)** 다. 셋 다 디바운스(400ms)를 실제로
        // 기다리는 테스트를 갖고 있어서 느리다.
        //
        // **왜 갈래를 따로 만드나** — CI 가 샤드로 나눠 도는데(#640), `--shard` 는 파일을
        // 경로순으로 정렬해 **개수를 균등하게** 나눈다. 시간이 아니라 개수라서 이 셋이
        // 한쪽에 몰리면 그 샤드만 오래 끈다. 3샤드 실측이 `[30.2, 3.1, 24.3]` 초였다 —
        // 한 샤드는 3초에 끝나고 러너가 노는 동안 CI 는 30초를 기다린다.
        //
        // 파일 목록을 CLI 로 넘겨 시간 기준으로 나누는 방법을 먼저 시도했으나,
        // **vitest 4 의 projects 모드에서는 CLI 파일 필터가 project include 와 안 맞아
        // «No test files found» 로 죽는다**(project 를 지정해도 같다). 그래서 갈래를
        // 설정에 두는 쪽으로 바꿨다.
        //
        // fake timer 로 대기를 없애는 것도 시도했는데 **더 나빠졌다** — `waitFor` 가
        // 가짜 시계에서 폴링을 못 해 6.1초짜리가 50초가 되고 10건이 깨졌다.
        //
        // 목록이 낡아도 **파일이 빠지지는 않는다.** 아래 갈래가 «그 셋을 뺀 나머지 전부»
        // 라서, 여기서 지워도 저쪽이 주워 간다. 갱신은 `npm run test:timings` 로 시간을
        // 다시 재고 상위 셋을 보면 된다.
        extends: true,
        test: {
          name: 'jsdom-heavy',
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.js'],
          include: [
            'src/components/InstallmentBillingHint.test.jsx',
            'src/components/CardRemapSection.test.jsx',
            'src/components/CardEstimateHint.test.jsx',
          ],
        },
      },
      {
        // 화면을 그리는 것 중 위 셋을 뺀 나머지. 예전과 같은 환경이다.
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          // 루트의 node --test 가 test/ 디렉터리를 훑기 때문에 src/test/ 아래에 두면
          // 이 파일을 테스트로 착각해 실행하고 실패한다. client 루트에 둔다.
          setupFiles: ['./vitest.setup.js'],
          include: ['src/**/*.test.{js,jsx}'],
          // 위 갈래들이 가져간 것을 뺀다. 두 갈래가 같은 파일을 돌리면 테스트 수가
          // 두 배로 세어져 «늘었다» 로 보인다.
          exclude: [
            'src/lib/**/*.test.{js,jsx}',
            'src/components/InstallmentBillingHint.test.jsx',
            'src/components/CardRemapSection.test.jsx',
            'src/components/CardEstimateHint.test.jsx',
          ],
        },
      },
    ],
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
