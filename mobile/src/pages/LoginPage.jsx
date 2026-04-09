import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  Image, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView,
} from "react-native";

const LOGO = require("../../assets/jejun.png");

export default function LoginPage({ onLogin }) {
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const isValid = studentId.length > 0 && password.length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>

          {/* 로고 */}
          <Image source={LOGO} style={styles.logo} resizeMode="contain" />

          {/* 타이틀 */}
          <Text style={styles.title}>제주대학교 전자투표</Text>
          <Text style={styles.subtitle}>학생 포털 계정으로 로그인하세요</Text>

          {/* 학번 */}
          <Text style={styles.label}>학번</Text>
          <TextInput
            style={styles.input}
            placeholder="예: 20210001"
            placeholderTextColor="#bbb"
            value={studentId}
            onChangeText={setStudentId}
            maxLength={10}
            autoComplete="off"
            keyboardType="numeric"
          />

          {/* 비밀번호 */}
          <Text style={styles.label}>비밀번호</Text>
          <TextInput
            style={styles.input}
            placeholder="비밀번호를 입력하세요"
            placeholderTextColor="#bbb"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {/* 로그인 버튼 */}
          <TouchableOpacity
            style={[styles.loginBtn, !isValid && styles.loginBtnDisabled]}
            onPress={() => isValid && onLogin(studentId)}
            disabled={!isValid}
          >
            <Text style={styles.loginBtnText}>로그인</Text>
          </TouchableOpacity>

          <Text style={styles.footer}>포털 계정 비밀번호를 사용합니다</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f0f2f5",
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 36,
    width: "100%",
    maxWidth: 440,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  logo: {
    width: 80,
    height: 80,
    alignSelf: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111",
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    marginBottom: 32,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    marginBottom: 8,
  },
  input: {
    width: "100%",
    padding: 13,
    borderWidth: 1.5,
    borderColor: "#e0e0e0",
    borderRadius: 10,
    fontSize: 15,
    color: "#111",
    backgroundColor: "#fafafa",
    marginBottom: 16,
  },
  loginBtn: {
    width: "100%",
    padding: 15,
    backgroundColor: "#111",
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 16,
  },
  loginBtnDisabled: {
    backgroundColor: "#ccc",
  },
  loginBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  footer: {
    fontSize: 13,
    color: "#aaa",
    textAlign: "center",
  },
});
