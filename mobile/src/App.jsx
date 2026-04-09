import { useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import LoginPage from "./pages/LoginPage";
import VoteListPage from "./pages/VoteListPage";
import VoteDetailPage from "./pages/VoteDetailPage";
import VoteResultPage from "./pages/VoteResultPage";
import UploadPage from "./pages/UploadPage";

const Stack = createNativeStackNavigator();

export default function App() {
  const [studentId, setStudentId] = useState("");
  const [userStatus, setUserStatus] = useState("none");

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login">
          {(props) => (
            <LoginPage
              {...props}
              onLogin={(id) => {
                setStudentId(id);
                if (id === "2026") setUserStatus("approved");
                props.navigation.navigate("VoteList");
              }}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Upload">
          {(props) => (
            <UploadPage
              {...props}
              studentId={studentId}
              isPending={userStatus === "pending"}
              onSubmit={() => {
                setUserStatus("pending");
                props.navigation.navigate("VoteList");
              }}
              onRefresh={() => {
                setUserStatus("approved");
                props.navigation.navigate("VoteList");
              }}
              onLogout={() => {
                setStudentId("");
                setUserStatus("none");
                props.navigation.navigate("Login");
              }}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="VoteList">
          {(props) => (
            <VoteListPage
              {...props}
              studentId={studentId}
              userStatus={userStatus}
              onGoUpload={() => props.navigation.navigate("Upload")}
              onVote={(vote) => props.navigation.navigate("VoteDetail", { vote })}
              onResult={(vote) => props.navigation.navigate("VoteResult", { vote })}
              onLogout={() => {
                setStudentId("");
                setUserStatus("none");
                props.navigation.navigate("Login");
              }}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="VoteDetail">
          {(props) => (
            <VoteDetailPage
              {...props}
              vote={props.route.params?.vote}
              onBack={() => props.navigation.goBack()}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="VoteResult">
          {(props) => (
            <VoteResultPage
              {...props}
              vote={props.route.params?.vote}
              onBack={() => props.navigation.goBack()}
            />
          )}
        </Stack.Screen>

      </Stack.Navigator>
    </NavigationContainer>
  );
}
