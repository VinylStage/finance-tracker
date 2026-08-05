'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// DB_PATH 와 같은 방식으로 주입을 받는다. 파일이 없을 때의 404 를 확인하려면
// 문서를 실제로 치워야 하는데, 테스트가 중간에 죽으면 저장소 파일이 사라진 채
// 남는다. 경로를 바꿔 끼우면 그 위험이 없다.
const GUIDE_PATH = process.env.GUIDE_PATH || path.join(__dirname, '../../docs/GUIDE.md');

// GET /api/guide
router.get('/', (req, res) => {
  fs.readFile(GUIDE_PATH, 'utf-8', (err, content) => {
    if (err) return res.status(404).json({ error: '가이드 문서를 찾을 수 없습니다.' });
    res.type('text/markdown').send(content);
  });
});

module.exports = router;
