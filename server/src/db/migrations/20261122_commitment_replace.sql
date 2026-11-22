-- 투표 키 분실 대비: 선거 시작 전에는 commitment 교체(재등록)를 허용한다.
-- 교체하려면 그 학생의 트리 위치(leaf index)를 알아야 하므로 시작 전까지만 저장하고,
-- 선거 시작(POST /:id/start) 시 NULL 로 지운다. commitment 값 자체는 저장하지 않는다(체인에만 존재).
ALTER TABLE voters ADD COLUMN commitment_leaf_index INT NULL;
