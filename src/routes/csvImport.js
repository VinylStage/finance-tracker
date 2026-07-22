'use strict';

const express = require('express');
const router = express.Router();
const { parseCardCsv } = require('../services/csvImport');

/**
 * CSV 파일을 파싱해서 거래 내역 미리보기 제공
 */
router.post('/', async (req, res) => {
  try {
    const { cardCompany, csvText } = req.body;

    if (!cardCompany || !csvText) {
      return res.status(400).json({
        error: 'cardCompany and csvText are required'
      });
    }

    const transactions = parseCardCsv(cardCompany, csvText);

    res.json({
      count: transactions.length,
      transactions
    });
  } catch (error) {
    res.status(400).json({
      error: error.message
    });
  }
});

module.exports = router;