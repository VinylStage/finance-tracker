'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../db/init');
const { serverError, errMsg } = require('../utils/errors');
const { parseCardExcel, detectCardCompany } = require('../services/cardExcelImport');

const upload = multer({ storage: multer.memoryStorage() });

// Function to process transactions (shared logic between preview and real import)
function processTransactions(cardCompany, originalname, fileBuffer, isPreview = false) {
  // multer/busboy decode multipart filenames as latin1 by default, which mangles
  // non-ASCII (Korean) filenames — re-decode the raw bytes as utf8.
  const decodedOriginalname = Buffer.from(originalname, 'latin1').toString('utf8');
  const detectedCardCompany = detectCardCompany(decodedOriginalname);
  // 파싱 단계 실패(XLSX.read 거부, 시트 부재 등)는 사용자 입력 문제이므로 400으로 분류되게
  // 구조화된 접두사로 변환한다. SHEET_NOT_FOUND 는 이미 구조화돼 있으므로 그대로 전달한다.
  let transactions;
  try {
    transactions = parseCardExcel(detectedCardCompany, fileBuffer);
  } catch (e) {
    if (/^SHEET_NOT_FOUND:/.test(errMsg(e))) throw e;
    throw new Error('PARSE_FAILED: 엑셀 파일을 해석할 수 없습니다. 파일이 손상됐거나 지원하지 않는 형식입니다.');
  }

  // Filter out cancelled transactions
  const filteredTransactions = transactions.filter(t => !t.cancelled);

  const CARD_COMPANY_LABELS = {
    nonghyup: '농협카드',
    lotte: '롯데카드',
    samsung: '삼성카드',
    hana: '하나카드',
    hyundai: '현대카드',
  };

  if (isPreview) {
    // In preview mode, count new vs existing transactions without inserting
    let count = 0;
    let skipped = 0;

    for (const row of filteredTransactions) {
      // Check for duplicates
      const existing = row.approval_number
        ? db.prepare('SELECT id FROM transactions WHERE approval_number = ?').get(row.approval_number)
        : db.prepare('SELECT id FROM transactions WHERE date = ? AND merchant = ? AND amount = ?').get(row.date, row.merchant, row.amount);
      
      if (existing) {
        skipped++;
      } else {
        count++;
      }
    }

    return {
      cardCompany: detectedCardCompany,
      cardCompanyLabel: CARD_COMPANY_LABELS[detectedCardCompany],
      count,
      skipped
    };
  } else {
    // Real import mode - get or create payment_method_id and category_id
    const paymentMethodRow = db.prepare(
      'SELECT id FROM payment_methods WHERE name = ?'
    ).get(CARD_COMPANY_LABELS[detectedCardCompany]);
    const payment_method_id = paymentMethodRow ? paymentMethodRow.id : null;

    // Get or create "미분류" category
    const uncategorizedRow = db.prepare(
      "SELECT id FROM categories WHERE major_type = '미분류' AND name = '미분류'"
    ).get();
    let category_id;
    if (uncategorizedRow) {
      category_id = uncategorizedRow.id;
    } else {
      const result = db.prepare(
        "INSERT INTO categories (major_type, name) VALUES ('미분류', '미분류')"
      ).run();
      category_id = result.lastInsertRowid;
    }

    let imported = 0;
    let skipped = 0;
    const errors = [];

    db.transaction(() => {
      for (const row of filteredTransactions) {
        try {
          // Check for duplicates
          const existing = row.approval_number
            ? db.prepare('SELECT id FROM transactions WHERE approval_number = ?').get(row.approval_number)
            : db.prepare('SELECT id FROM transactions WHERE date = ? AND merchant = ? AND amount = ?').get(row.date, row.merchant, row.amount);
          
          if (existing) {
            skipped++;
            continue;
          }

          // Insert transaction
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
}

// 파일명을 UTF-8로 디코딩(multer latin1 → utf8). 응답 표시용.
function decodeFilename(name) {
  return Buffer.from(name, 'latin1').toString('utf8');
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
    const result = processTransactions(null, file.originalname, file.buffer, isPreview);
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

router.post('/', upload.array('files', 30), async (req, res) => {
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
router.post('/single', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    const isPreview = req.query.preview === 'true';
    const result = processTransactions(null, req.file.originalname, req.file.buffer, isPreview);
    res.json(result);
  } catch (e) {
    // 잘못된 입력(미지원 카드사, 시트 부재, 파일 해석 실패)은 400. DB 등 그 외 오류는 500(내부 메시지 숨김+로깅).
    const message = errMsg(e);
    if (isUserInputError(message)) return res.status(400).json({ error: message });
    serverError(res, e, 'cardImport');
  }
});

module.exports = router;