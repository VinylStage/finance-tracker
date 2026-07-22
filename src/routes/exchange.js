'use strict';

const express = require('express');
const router = express.Router();
const { getExchangeRates } = require('../services/eximService');

/**
 * 환율 정보를 조회하는 라우트
 */
router.get('/', async (req, res) => {
  try {
    const rates = await getExchangeRates();
    res.json(rates);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;