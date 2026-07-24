'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const GUIDE_PATH = path.join(__dirname, '../../docs/GUIDE.md');

// GET /api/guide
router.get('/', (req, res) => {
  fs.readFile(GUIDE_PATH, 'utf-8', (err, content) => {
    if (err) return res.status(404).json({ error: '가이드 문서를 찾을 수 없습니다.' });
    res.type('text/markdown').send(content);
  });
});

module.exports = router;
