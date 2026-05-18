# 학생증 인증 API

학생증 인증은 **계정 단위**(`user_verifications`)로 한 번만 통과하면 모든 선거에 재사용됨.

## 상태 흐름

```
none → pending → approved / rejected
              ↑ 거절 후 재제출 가능
```

---

## `POST /verification/request`

학생증 사진 + 학번 제출.

**권한**: auth  
**Content-Type**: `multipart/form-data`

**필드**:
- `student_id` (text, 필수)
- `file` (image/pdf, 5MB 이하)

**파일 저장**: `server/uploads/verifications/<email>_<timestamp>.<ext>`

**성공 (200)**:
```json
{
  "message": "인증 신청 완료",
  "status": "pending",
  "file_path": "uploads/verifications/20210001_stu_jejunu_ac_kr_1700000000.jpg"
}
```

**제약**:
- 같은 사용자가 다시 제출하면 기존 row UPDATE (`status='pending'`, `note=NULL`, 새 file_path 적용)
- 거절(`rejected`) 상태에서도 재제출 가능

**에러**:
| 코드 | 사유 |
|---|---|
| 400 | `student_id` 필수 |
| 401 | 토큰 없음/만료 |
| 500 | 파일 저장/DB 오류 |

---

## `GET /verification/me`

자기 인증 상태 조회.

**권한**: auth

**성공 (200)** — 신청 안 한 경우:
```json
{ "status": "none" }
```

**성공 (200)** — 신청 있는 경우:
```json
{
  "email": "20210001@stu.jejunu.ac.kr",
  "student_id": "20210001",
  "file_path": "uploads/... 또는 null",
  "status": "pending|approved|rejected",
  "note": "거절 사유 또는 null",
  "created_at": "...",
  "reviewed_at": "심사 시점 또는 null"
}
```

**활용**: 학생증 심사 대기 화면에서 주기적 폴링.

---

## `GET /verification/admin`

심사 목록 (관리자용).

**권한**: admin  
**쿼리 파라미터**: `?status=pending|approved|rejected` (선택)

**성공 (200)**:
```json
[
  {
    "id": 1,
    "email": "20210001@stu.jejunu.ac.kr",
    "student_id": "20210001",
    "file_path": "uploads/... 또는 null",
    "status": "pending",
    "note": null,
    "created_at": "2026-03-18 09:23:00",
    "reviewed_at": null
  }
]
```

---

## `GET /verification/admin/:id/file`

학생증 사진 스트림. **승인/거절 전까지만** 접근 가능 (그 후엔 file_path 가 NULL 로 비워지고 파일 삭제됨).

**권한**: admin  
**응답**: 파일 바이트 스트림 (Content-Type 은 파일에 따라)

**에러**:
| 코드 | 사유 |
|---|---|
| 404 | 인증 신청 없음 / 이미 처리되어 파일 삭제됨 |

**프론트 사용 예 (blob URL)**:
```js
const res = await fetch(`${API_BASE}/api/verification/admin/${id}/file`, {
  headers: { Authorization: `Bearer ${token}` }
});
const blob = await res.blob();
const url = URL.createObjectURL(blob);
// <img src={url} />
// 사용 후 URL.revokeObjectURL(url)
```

`<img>` 태그가 Authorization 헤더를 직접 못 붙이니까 fetch 로 받아서 blob URL 변환하는 방식 권장.

---

## `PATCH /verification/admin/:id`

학생증 승인/거절.

**권한**: admin  
**요청**:
```json
{
  "status": "approved",
  "note": "(선택) 거절 사유 등"
}
```

`status` 는 `approved` 또는 `rejected` 만 가능.

**처리**:
- `user_verifications.status` 변경 + `reviewed_at = NOW()`
- **파일 즉시 삭제** + `file_path = NULL` (보안)

**성공 (200)**:
```json
{ "message": "인증 상태 변경 완료", "status": "approved" }
```

**에러**:
| 코드 | 사유 |
|---|---|
| 400 | `status` 가 approved/rejected 가 아님 |
| 404 | 인증 신청 없음 |

**주의**:
- 승인 후 토큰 발급은 별도 단계 (`POST /elections/:id/tokens/issue`)
- 승인 취소(rejected) 시 이미 발급된 토큰은 자동 회수 안 됨 (정책)
