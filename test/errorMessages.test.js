const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// src 아래 .js 파일을 전부 모은다.
function collectJs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectJs(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const SOURCES = collectJs(path.join(ROOT, 'src'))
  .map((f) => ({ file: path.relative(ROOT, f), text: fs.readFileSync(f, 'utf8') }));

const HANGUL = /[가-힣]/;

describe('error messages', () => {
  test('4xx response messages are all in Korean', () => {
    const found = [];   // 검사 대상 전부
    const errors = [];  // 그중 위반만
    for (const { file, text } of SOURCES) {
      if (file === 'src/utils/errors.js') continue;
      const regex = /status\((4\d\d)\)\.json\(\{\s*error:\s*(['"])(.*?)\2/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const [, , , message] = match;
        found.push({ file, message });
        if (!HANGUL.test(message)) {
          errors.push({ file, message });
        }
      }
    }

    // 정규식이 아무것도 못 잡으면 위반도 0이라 조용히 통과한다. 그걸 막는다.
    assert.ok(found.length >= 30,
      `4xx 메시지를 ${found.length}개만 찾았다. 정규식이 깨졌을 수 있다 (30개 이상 기대).`);
    assert.deepStrictEqual(errors, [],
      `4xx 응답 메시지는 전부 한글이어야 한다. 위반: ${JSON.stringify(errors, null, 2)}`);
  });

  test('machine prefixes are not left in string literals', () => {
    const prefixes = [
      'PARSE_FAILED:',
      'SHEET_NOT_FOUND:',
      'UNSUPPORTED_CARD:',
      'UNSUPPORTED_FILE_TYPE:'
    ];
    
    const errors = [];
    for (const { file, text } of SOURCES) {
      if (file === 'src/utils/errors.js') continue;
      for (const prefix of prefixes) {
        if (text.includes(prefix)) {
          // Find all lines containing the prefix
          const lines = text.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(prefix)) {
              errors.push({ file, line: i + 1, prefix, content: lines[i].trim() });
            }
          }
        }
      }
    }

    assert.ok(errors.length === 0, 
      `No machine prefixes should remain in string literals. Problems: ${JSON.stringify(errors, null, 2)}`);
  });

  test('error messages do not include raw error objects', () => {
    const errors = [];
    for (const { file, text } of SOURCES) {
      if (file === 'src/utils/errors.js') continue;
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('errors.push(') && line.includes('errMsg(')) {
          errors.push({ file, line: i + 1, content: line.trim() });
        }
      }
    }

    assert.ok(errors.length === 0, 
      `Error messages should not include raw error objects. Problems: ${JSON.stringify(errors, null, 2)}`);
  });

  test('isUserInputError is called with Error instances, not strings', () => {
    // 인자가 문자열이면 instanceof 판정이 언제나 false 가 되어 사용자 입력 오류가
    // 조용히 500 으로 떨어진다. 실제로 한 번 그렇게 깨졌다(#231).
    //
    // 금지 목록(예: 'message')으로 막으면 errMsg(e) 같은 새 표현에 뚫린다.
    // 그래서 허용 형태만 통과시킨다 — 인자는 단순 식별자여야 한다.
    const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
    const errors = [];
    let checked = 0;
    for (const { file, text } of SOURCES) {
      if (file === 'src/utils/errors.js') continue;
      const regex = /isUserInputError\(([^)]*)\)/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const arg = match[1].trim();
        checked += 1;
        if (!IDENTIFIER.test(arg)) {
          errors.push({ file, arg });
        }
      }
    }

    assert.ok(checked >= 4,
      `isUserInputError 호출을 ${checked}개만 찾았다. 정규식이 깨졌을 수 있다 (4개 이상 기대).`);
    assert.deepStrictEqual(errors, [],
      `isUserInputError 에는 오류 객체(단순 식별자)를 넘겨야 한다. 위반: ${JSON.stringify(errors, null, 2)}`);
  });

  test('UserInputError contract is satisfied', () => {
    const { UserInputError, isUserInputError } = require('../src/utils/errors.js');
    
    // 1. UserInputError 인스턴스는 Error의 인스턴스다
    const error = new UserInputError('test message');
    assert.ok(error instanceof Error);
    
    // 2. isUserInputError(new UserInputError('x')) 가 true
    assert.ok(isUserInputError(new UserInputError('x')));
    
    // 3. isUserInputError(new Error('x')) 가 false
    assert.ok(!isUserInputError(new Error('x')));
    
    // 4. isUserInputError('x') 가 false (문자열을 넘겨도 터지지 않고 false)
    assert.ok(!isUserInputError('x'));
    
    // 5. isUserInputError(null) 과 isUserInputError(undefined) 가 false
    assert.ok(!isUserInputError(null));
    assert.ok(!isUserInputError(undefined));
  });
});
