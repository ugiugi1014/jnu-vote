# 선거 + 후보자 + 코디네이터 키 API

## 선거 상태 흐름

```
pending → active → closed → tallied
```

- `pending`: 생성됨, 시작 전
- `active`: 투표 진행 중 (`POST /:id/start` 후)
- `closed`: 투표 마감 (`end_time` 도달 시 스케줄러가 자동 전환)
- `tallied`: 개표 완료 (자동 개표 또는 `POST /:id/tally`)

---

## `POST /elections`

선거 생성. **코디네이터 ECDH 키쌍을 자동 생성**하여 DB 저장.

**권한**: admin  
**요청**:
```json
{
  "title": "2026년 1학기 총학생회 회장 선거",
  "description": "총학생회 회장 및 부회장 선출",
  "start_time": "2026-03-20 09:00:00",
  "end_time": "2026-03-27 18:00:00"
}
```

**성공 (200)**:
```json
{
  "message": "선거 생성 완료",
  "election_id": 1,
  "coord_public_key": "{\"kty\":\"EC\",\"crv\":\"P-256\",\"x\":\"...\",\"y\":\"...\"}"
}
```

**검증**:
- 필수: title, start_time, end_time
- start_time < end_time

---

## `GET /elections`

전체 선거 목록 조회 (최신순).

**권한**: public  
**요청**: 없음

**성공 (200)**:
```json
[
  {
    "id": 1,
    "title": "...",
    "description": "...",
    "start_time": "...",
    "end_time": "...",
    "status": "active",
    "coord_public_key": "{ ... }",
    "contract_address": "0x... 또는 null",
    "token_contract_address": "0x... 또는 null",
    "total_voters": 0,
    "voted_count": 0,
    "created_at": "..."
  }
]
```

> `coord_private_key` 는 응답에 포함되지 않음 (ELECTION_PUBLIC_COLUMNS 에서 제외).

---

## `GET /elections/:id`

선거 상세 + 후보자 목록.

**권한**: public

**성공 (200)**:
```json
{
  "election": { "id": 1, "title": "...", "status": "active", "...": "..." },
  "candidates": [
    {
      "id": 10,
      "election_id": 1,
      "name": "김제주",
      "description": "경영학과 3학년\n학생 중심 대학",
      "candidate_index": 0,
      "created_at": "..."
    }
  ]
}
```

---

## `GET /elections/:id/coordinator/public-key`

투표 시 ECDH 용 코디네이터 JWK 공개키 반환.

**권한**: public

**성공 (200)**:
```json
{
  "kty": "EC",
  "crv": "P-256",
  "x": "...",
  "y": "..."
}
```

**에러**:
| 코드 | 사유 |
|---|---|
| 404 | 선거 없음 또는 코디네이터 키 미생성 |

**활용**: 프론트 `VoteDetailPage` 에서 ECDH 키쌍 만들 때 사용.

---

## `PUT /elections/:id`

선거 정보 수정. 상태 무관 호출 가능하지만, 프론트에서 `pending` 외 상태는 시간만 수정하도록 제한 권장.

**권한**: admin  
**요청** (undefined 필드는 기존값 유지):
```json
{
  "title": "...",
  "description": "...",
  "start_time": "...",
  "end_time": "..."
}
```

---

## `DELETE /elections/:id`

선거 삭제. CASCADE 로 후보자/유권자/투표 결과 동시 삭제.

**권한**: admin  
**주의**: 데이터 영구 손실. 운영에서는 사용 권장 안 함.

---

## `POST /elections/:id/start`

선거 시작 (`pending` → `active`).

**권한**: admin  
**전제**: `contract_address`, `token_contract_address` 둘 다 등록되어 있어야 함.

**성공 (200)**: `{ "message": "선거 시작" }`

---

## `POST /elections/:id/close`

선거 수동 종료 (`active` → `closed`). 자동 종료(end_time 기준)도 있음.

**권한**: admin

---

## `POST /elections/:id/contract`

컨트랙트 주소 등록. 둘 중 하나만 보내도 OK (다른 쪽은 기존값 유지).

**권한**: admin  
**요청**:
```json
{
  "contract_address": "0x...",          // VotingSystem
  "token_contract_address": "0x..."     // VotingToken
}
```

**검증**: `0x + 40자 hex` 형식.

---

## `POST /elections/:id/candidates`

후보자 등록.

**권한**: admin  
**요청**:
```json
{
  "name": "김제주",
  "description": "경영학과 3학년\n학생 중심 대학",
  "candidate_index": 0
}
```

**제약**:
- `candidate_index` 0-based, `(election_id, candidate_index)` 유니크
- 회로 기준 `0, 1, 2` (3명 한도)

---

## `GET /elections/:id/candidates`

후보자 목록.

**권한**: public

---

## `DELETE /elections/:id/candidates/:candidateId`

후보자 삭제.

**권한**: admin

**활용**: 선거 수정 시 "후보 일괄 교체" 패턴 (전체 삭제 → 재등록).
