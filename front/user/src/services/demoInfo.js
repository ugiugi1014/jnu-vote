// 데모 안내 정보 (/demo/info) 를 한 번만 받아 여러 화면이 같이 쓴다.
//  { enabled, exhibition, ... } — 데모가 아니면 { enabled: false }
const API = import.meta.env.VITE_API_BASE_URL;
let cached = null;

export function getDemoInfo() {
  if (!cached) {
    cached = fetch(`${API}/demo/info`)
      .then((r) => r.json())
      .catch(() => ({ enabled: false }));
  }
  return cached;
}
