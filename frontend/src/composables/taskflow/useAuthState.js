import { reactive, ref } from "vue";

export function useAuthState({ api, ElMessage, getErrorMessage, runBootstrap }) {
  const token = ref(localStorage.getItem("taskflow_token") || "");
  const user = reactive(JSON.parse(localStorage.getItem("taskflow_user") || "{}"));
  const loginForm = reactive({ username: "admin", password: "admin123" });

  function saveAuth(loginUser, jwt) {
    token.value = jwt;
    Object.assign(user, loginUser);
    localStorage.setItem("taskflow_token", jwt);
    localStorage.setItem("taskflow_user", JSON.stringify(loginUser));
  }

  function clearAuth() {
    token.value = "";
    Object.keys(user).forEach((k) => delete user[k]);
    localStorage.removeItem("taskflow_token");
    localStorage.removeItem("taskflow_user");
  }

  async function doLogin() {
    try {
      const { data } = await api.post("/auth/login", loginForm);
      saveAuth(data.user, data.token);
      await runBootstrap();
      ElMessage.success("登录成功");
    } catch (err) {
      ElMessage.error(getErrorMessage(err, "登录失败"));
    }
  }

  function logout() {
    clearAuth();
  }

  function handleUserMenuCommand(command) {
    if (command === "logout") {
      logout();
    }
  }

  return {
    token,
    user,
    loginForm,
    saveAuth,
    clearAuth,
    doLogin,
    logout,
    handleUserMenuCommand,
  };
}
