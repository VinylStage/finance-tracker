'use strict';

const express = require('express');
const router = express.Router();
const { getExchangeRates } = require('../services/eximService');
const { serverError } = require('../utils/errors');

/**
 * 환율 정보를 조회하는 라우트
 */
router.get('/', async (req, res) => {
  try {
    const rates = await getExchangeRates();
    res.json(rates);
  } catch (e) {
    serverError(res, e, 'exchange');
  }
});

module.exports = router;