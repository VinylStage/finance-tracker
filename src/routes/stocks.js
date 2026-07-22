'use strict';

const express = require('express');
const router = express.Router();
const kisService = require('../services/kisService');

/**
 * 주식 가격 조회 API
 */
router.get('/:ticker', async (req, res) => {
  try {
    const { ticker } = req.params;
    const result = await kisService.getStockPrice(ticker);
    
    if (result.enabled === false) {
      return res.status(503).json({
        error: 'KIS API integration not yet enabled',
      });
    }
    
    res.json(result);
  } catch (error) {
    res.status(503).json({
      error: 'KIS API integration not yet enabled',
    });
  }
});

module.exports = router;