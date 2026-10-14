-- 익명 투표 전환 (feat/anonymous-voting)
-- 1) 유권자 트리 등록 여부 (commitment 값 자체는 저장하지 않음 — 체인에만 존재)
ALTER TABLE voters ADD COLUMN commitment_registered_at DATETIME NULL;

-- 2) 학번과 투표를 연결하던 기존 데이터 제거
--    voter_public_key: 투표 임시 공개키 (개표 시 복호화된 표와 연결 가능했음)
--    has_voted: 누가 투표했는지 (익명 투표에서는 서버가 알 수 없음)
UPDATE voters SET voter_public_key = NULL, has_voted = FALSE;
