'use strict';

const express = require('express');
const router = express.Router();
const kisService = require('../services/kisService');
const { serverError } = require('../utils/errors');

/**
 * 주식 가격 조회 API
 */
router.get('/:ticker', async (req, res) => {
  try {
    const { ticker } = req.params;
    const result = await kisService.getStockPrice(ticker);
    
    if (result.enabled === false) {
      return res.status(503).json({
        error: '주가 조회 기능은 아직 준비 중입니다.',
      });
    }
    
    res.json(result);
  } catch (error) {
    // FND-18(감사): "미활성화" 상태는 이제 kisService가 예외 대신 값으로
    // 돌려주므로(위 if 분기가 처리), 여기 도달하는 에러는 전부 실제로
    // 예상 못한 것이다 — serverError()로 보내 로그를 남긴다.
    serverError(res, error, 'stocks');
  }
});

module.exports = router;
