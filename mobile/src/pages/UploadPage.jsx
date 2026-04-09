import { useState } from "react";
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Image, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";

/* ── 공통 헤더 ── */
function Header({ studentId, onLogout }) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.headerTitle}>제주대학교 전자투표</Text>
        <Text style={styles.headerSubtitle}>Jeju National University E-Voting</Text>
      </View>
      <View style={styles.headerRight}>
        <Text style={styles.studentId}>👤 {studentId}</Text>
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
          <Text style={styles.logoutBtnText}>로그아웃</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ── 업로드 폼 ── */
function UploadForm({ studentId, onLogout, onSubmit }) {
  const [image, setImage] = useState(null);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("권한 필요", "사진 접근 권한이 필요합니다.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });
    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header studentId={studentId} onLogout={onLogout} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>학생증 인증</Text>
          <Text style={styles.cardDesc}>
            투표 참여를 위해 학생증 사진을 업로드해주세요.{"\n"}
            관리자 검토 후 투표 권한이 부여됩니다.
          </Text>

          {/* 이미지 미리보기 or 업로드 버튼 */}
          {image ? (
            <Image source={{ uri: image }} style={styles.preview} resizeMode="contain" />
          ) : (
            <TouchableOpacity style={styles.dropzone} onPress={pickImage}>
              <Text style={styles.dropzoneIcon}>🪪</Text>
              <Text style={styles.dropzoneText}>
                탭하여 학생증 사진을 선택하세요{"\n"}
                <Text style={styles.dropzoneHighlight}>JPG, PNG 지원</Text>
              </Text>
            </TouchableOpacity>
          )}

          {/* 다시 선택 */}
          {image && (
            <TouchableOpacity style={styles.reSelectBtn} onPress={pickImage}>
              <Text style={styles.reSelectBtnText}>다시 선택</Text>
            </TouchableOpacity>
          )}

          {/* 안내 */}
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              ⚠️ 학생증의 이름과 학번이 명확히 보여야 합니다. 개인정보는 인증 목적으로만 사용됩니다.
            </Text>
          </View>

          {/* 제출 버튼 */}
          <TouchableOpacity
            style={[styles.submitBtn, !image && styles.submitBtnDisabled]}
            onPress={() => image && onSubmit()}
            disabled={!image}
          >
            <Text style={styles.submitBtnText}>제출하기</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutBtnFull} onPress={onLogout}>
            <Text style={styles.logoutBtnFullText}>로그아웃</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ── 승인 대기 화면 ── */
function WaitingScreen({ studentId, onLogout, onRefresh }) {
  return (
    <SafeAreaView style={styles.container}>
      <Header studentId={studentId} onLogout={onLogout} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.card, { alignItems: "center" }]}>
          <Text style={styles.waitingIcon}>🕐</Text>
          <Text style={styles.waitingTitle}>검토 중입니다</Text>
          <Text style={styles.waitingDesc}>
            학생증 사진이 제출되었습니다.{"\n"}
            관리자 검토 후 투표 권한이 부여됩니다.{"\n"}
            승인까지 잠시 기다려주세요.
          </Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
            <Text style={styles.refreshBtnText}>상태 확인하기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutBtnFull} onPress={onLogout}>
            <Text style={styles.logoutBtnFullText}>로그아웃</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ── 메인 UploadPage ── */
export default function UploadPage({ studentId, onLogout, onSubmit, onRefresh, isPending }) {
  if (isPending) {
    return <WaitingScreen studentId={studentId} onLogout={onLogout} onRefresh={onRefresh} />;
  }
  return <UploadForm studentId={studentId} onLogout={onLogout} onSubmit={onSubmit} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f0f2f5" },

  /* 헤더 */
  header: {
    backgroundColor: "#fff", paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "#e8e8e8",
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  headerTitle: { fontSize: 15, fontWeight: "700", color: "#111" },
  headerSubtitle: { fontSize: 10, color: "#aaa" },
  headerRight: { alignItems: "flex-end", gap: 6 },
  studentId: { fontSize: 12, color: "#555" },
  logoutBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1.5, borderColor: "#e0e0e0", borderRadius: 8,
  },
  logoutBtnText: { fontSize: 12, color: "#444" },

  /* 스크롤 */
  scroll: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 20 },

  /* 카드 */
  card: {
    backgroundColor: "#fff", borderRadius: 16, padding: 32,
    width: "100%", maxWidth: 440,
    shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 16, elevation: 4,
  },
  cardTitle: { fontSize: 20, fontWeight: "700", color: "#111", marginBottom: 8 },
  cardDesc: { fontSize: 14, color: "#888", lineHeight: 22, marginBottom: 28 },

  /* 드롭존 */
  dropzone: {
    borderWidth: 2, borderColor: "#d0d0d0", borderStyle: "dashed",
    borderRadius: 12, padding: 36, alignItems: "center", marginBottom: 20,
  },
  dropzoneIcon: { fontSize: 40, marginBottom: 12 },
  dropzoneText: { fontSize: 14, color: "#888", textAlign: "center", lineHeight: 22 },
  dropzoneHighlight: { color: "#1a5fa8", fontWeight: "600" },

  /* 이미지 미리보기 */
  preview: {
    width: "100%", height: 200, borderRadius: 10,
    backgroundColor: "#f5f5f5", marginBottom: 12,
  },

  /* 다시 선택 */
  reSelectBtn: {
    borderWidth: 1.5, borderColor: "#e0e0e0", borderRadius: 10,
    padding: 12, alignItems: "center", marginBottom: 16,
  },
  reSelectBtnText: { fontSize: 14, color: "#666" },

  /* 안내 */
  notice: {
    backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#fde68a",
    borderRadius: 8, padding: 12, marginBottom: 20,
  },
  noticeText: { fontSize: 13, color: "#92400e", lineHeight: 20 },

  /* 제출 버튼 */
  submitBtn: {
    backgroundColor: "#111", borderRadius: 10, padding: 15,
    alignItems: "center", marginBottom: 10,
  },
  submitBtnDisabled: { backgroundColor: "#ccc" },
  submitBtnText: { fontSize: 15, fontWeight: "600", color: "#fff" },

  /* 로그아웃 버튼 */
  logoutBtnFull: {
    borderWidth: 1.5, borderColor: "#e0e0e0", borderRadius: 10,
    padding: 13, alignItems: "center",
  },
  logoutBtnFullText: { fontSize: 14, color: "#666" },

  /* 대기 화면 */
  waitingIcon: { fontSize: 52, marginBottom: 16 },
  waitingTitle: { fontSize: 20, fontWeight: "700", color: "#111", marginBottom: 10 },
  waitingDesc: { fontSize: 14, color: "#888", textAlign: "center", lineHeight: 22, marginBottom: 28 },
  refreshBtn: {
    backgroundColor: "#111", borderRadius: 10, padding: 14,
    alignItems: "center", width: "100%", marginBottom: 10,
  },
  refreshBtnText: { fontSize: 15, fontWeight: "600", color: "#fff" },
});
