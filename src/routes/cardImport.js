'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../db/init');
const { serverError, errMsg } = require('../utils/errors');
const { parseCardExcel, detectCardCompany } = require('../services/cardExcelImport');

// FND-09(감사): 파일 개수(30개)만 제한하고 크기·형식 제한이 없어 memoryStorage에
// 임의 크기·형식의 바이너리가 그대로 적재될 수 있었다. 실제 카드사 엑셀 명세서는
// 수백 KB 수준이라 파일당 10MB(다른 곳의 JSON 본문 한도와 동일 기준)면 충분하다.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.xlsx' && ext !== '.xls') {
      return cb(new Error('UNSUPPORTED_FILE_TYPE: .xlsx 또는 .xls 파일만 업로드할 수 있습니다.'));
    }
    cb(null, true);
  },
});

const CARD_COMPANY_LABELS = {
  nonghyup: '농협카드',
  lotte: '롯데카드',
  samsung: '삼성카드',
  hana: '하나카드',
  hyundai: '현대카드',
};

// FND-14(감사): processTransactions 하나에 파일 디코딩·파싱·미리보기 분기·
// 결제수단/카테고리 해석·중복판정·실제 저장이 전부 들어있어 순환복잡도가
// 32까지 올라갔다(113줄). preview/실제 저장 두 갈래가 원래도 서로 다른
// 관심사라 자연스럽게 나뉘는 지점을 따라 함수를 쪼갠다.

// 엑셀 파일을 파싱하고 취소된 거래를 걸러낸다. 파싱 실패(XLSX.read 거부,
// 시트 부재 등)는 사용자 입력 문제이므로 400으로 분류되게 구조화된 접두사로
// 변환한다. SHEET_NOT_FOUND는 이미 구조화돼 있으므로 그대로 전달한다.
function parseAndFilterTransactions(originalname, fileBuffer) {
  // multer/busboy decode multipart filenames as latin1 by default, which mangles
  // non-ASCII (Korean) filenames — re-decode the raw bytes as utf8.
  const decodedOriginalname = Buffer.from(originalname, 'latin1').toString('utf8');
  const detectedCardCompany = detectCardCompany(decodedOriginalname);
  let transactions;
  try {
    transactions = parseCardExcel(detectedCardCompany, fileBuffer);
  } catch (e) {
    if (/^SHEET_NOT_FOUND:/.test(errMsg(e))) throw e;
    throw new Error('PARSE_FAILED: 엑셀 파일을 해석할 수 없습니다. 파일이 손상됐거나 지원하지 않는 형식입니다.');
  }
  return { detectedCardCompany, filteredTransactions: transactions.filter(t => !t.cancelled) };
}

// 승인번호가 있으면 승인번호로, 없으면 (날짜,가맹점,금액) 조합으로 중복을
// 찾는다. preview와 실제 저장이 반드시 같은 기준을 써야 미리보기 건수와
// 실제 저장 건수가 어긋나지 않는다.
function findDuplicateTransaction(row) {
  return row.approval_number
    ? db.prepare('SELECT id FROM transactions WHERE approval_number = ?').get(row.approval_number)
    : db.prepare('SELECT id FROM transactions WHERE date = ? AND merchant = ? AND amount = ?').get(row.date, row.merchant, row.amount);
}

// 미리보기 모드 — 저장 없이 신규/중복 건수만 센다.
function previewImport(filteredTransactions, detectedCardCompany) {
  let count = 0;
  let skipped = 0;
  for (const row of filteredTransactions) {
    if (findDuplicateTransaction(row)) skipped++;
    else count++;
  }
  return {
    cardCompany: detectedCardCompany,
    cardCompanyLabel: CARD_COMPANY_LABELS[detectedCardCompany],
    count,
    skipped,
  };
}

// 카드사 이름에 대응하는 결제수단 id(없으면 null)와 "미분류" 카테고리 id
// (없으면 새로 만듦)를 구한다.
function resolvePaymentMethodAndCategory(detectedCardCompany) {
  const paymentMethodRow = db.prepare(
    'SELECT id FROM payment_methods WHERE name = ?'
  ).get(CARD_COMPANY_LABELS[detectedCardCompany]);
  const payment_method_id = paymentMethodRow ? paymentMethodRow.id : null;

  const uncategorizedRow = db.prepare(
    "SELECT id FROM categories WHERE major_type = '미분류' AND name = '미분류'"
  ).get();
  const category_id = uncategorizedRow
    ? uncategorizedRow.id
    : db.prepare("INSERT INTO categories (major_type, name) VALUES ('미분류', '미분류')").run().lastInsertRowid;

  return { payment_method_id, category_id };
}

// 실제 저장 — 중복은 건너뛰고, 행 단위 오류는 나머지 처리를 막지 않도록 모아둔다.
function performImport(filteredTransactions, detectedCardCompany) {
  const { payment_method_id, category_id } = resolvePaymentMethodAndCategory(detectedCardCompany);
  let imported = 0;
  let skipped = 0;
  const errors = [];

  db.transaction(() => {
    for (const row of filteredTransactions) {
      try {
        if (findDuplicateTransaction(row)) {
          skipped++;
          continue;
        }
        db.prepare(`
          INSERT INTO transactions
            (date, category_id, amount, payment_method_id, payment_style, merchant, approval_number)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          row.date,
          category_id,
          row.amount,
          payment_method_id,
          row.is_installment ? '할부' : '일시불',
          row.merchant,
          row.approval_number
        );
        imported++;
      } catch (err) {
        errors.push(`${row.date} ${row.merchant}: ${errMsg(err)}`);
      }
    }
  })(); // Immediately invoke the transaction

  return { imported, skipped, errors };
}

// Function to process transactions (shared logic between preview and real import)
function processTransactions(originalname, fileBuffer, isPreview = false) {
  const { detectedCardCompany, filteredTransactions } = parseAndFilterTransactions(originalname, fileBuffer);
  return isPreview
    ? previewImport(filteredTransactions, detectedCardCompany)
    : performImport(filteredTransactions, detectedCardCompany);
}

// 파일명을 UTF-8로 디코딩(multer latin1 → utf8). 응답 표시용.
function decodeFilename(name) {
  return Buffer.from(name, 'latin1').toString('utf8');
}

// multer 미들웨어(크기 초과·fileFilter 거부 등)의 오류는 next(err)로 라우트 핸들러를
// 건너뛰고 곧장 에러 미들웨어로 가버린다 — 여기서 잡아 사용자 입력 오류(400)로 변환한다.
function uploadOrReject(multerMiddleware) {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: '파일 크기가 너무 큽니다 (파일당 최대 10MB)' });
      }
      return res.status(400).json({ error: errMsg(err).replace(/^UNSUPPORTED_FILE_TYPE:\s*/, '') || '파일을 업로드할 수 없습니다.' });
    });
  };
}

// 파싱/입력 오류(사용자 문제)는 400 대상, 그 외는 서버 오류로 구분한다.
function isUserInputError(message) {
  return /^(UNSUPPORTED_CARD|SHEET_NOT_FOUND|PARSE_FAILED):/.test(message);
}

// 파일 하나를 처리하고 결과 객체를 반환한다. 실패해도 throw하지 않고 ok:false 로 담는다.
// (멀티파일에서 한 파일 실패가 나머지를 중단시키지 않도록)
function processOne(file, isPreview) {
  const filename = decodeFilename(file.originalname);
  try {
    const result = processTransactions(file.originalname, file.buffer, isPreview);
    return { filename, ok: true, ...result };
  } catch (e) {
    const message = errMsg(e);
    return { filename, ok: false, error: isUserInputError(message) ? message : 'Internal error' };
  }
}

// 파일별 결과를 전체 합계로 집계한다(preview: count/skipped, import: imported/skipped).
function aggregate(results) {
  const totals = { files: results.length, succeeded: 0, failed: 0 };
  for (const r of results) {
    if (!r.ok) { totals.failed++; continue; }
    totals.succeeded++;
    for (const k of ['count', 'skipped', 'imported']) {
      if (typeof r[k] === 'number') totals[k] = (totals[k] || 0) + r[k];
    }
  }
  return totals;
}

router.post('/', uploadOrReject(upload.array('files', 30)), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'files is required' });
    }

    const isPreview = req.query.preview === 'true';
    // append 전용: card-import 는 중복 체크 후 삽입이라 파괴적 동작(overwrite/delete)이 없다.
    const results = files.map((f) => processOne(f, isPreview));
    res.json({ results, totals: aggregate(results) });
  } catch (e) {
    // 파일별 오류는 processOne 이 담으므로 여기 도달하면 예상 못한 서버 오류다(내부 메시지 숨김+로깅).
    serverError(res, e, 'cardImport');
  }
});

// 단일 파일 하위호환 라우트 (기존 'file' 필드로 호출하는 클라이언트 대응)
router.post('/single', uploadOrReject(upload.single('file')), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    const isPreview = req.query.preview === 'true';
    const result = processTransactions(req.file.originalname, req.file.buffer, isPreview);
    res.json(result);
  } catch (e) {
    // 잘못된 입력(미지원 카드사, 시트 부재, 파일 해석 실패)은 400. DB 등 그 외 오류는 500(내부 메시지 숨김+로깅).
    const message = errMsg(e);
    if (isUserInputError(message)) return res.status(400).json({ error: message });
    serverError(res, e, 'cardImport');
  }
});

module.exports = router;