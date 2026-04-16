import axios from "axios";

const client = axios.create({
  baseURL: "/api"
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("taskflow_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const backendMessage = error?.response?.data?.message;
    if (typeof backendMessage === "string" && backendMessage.trim()) {
      error.friendlyMessage = backendMessage.trim();
    } else if (status === 413) {
      error.friendlyMessage = "上传内容过大，请压缩文件后重试";
    } else if (status === 403) {
      error.friendlyMessage = "没有权限执行该操作";
    } else if (status === 404) {
      error.friendlyMessage = "请求资源不存在";
    } else if (!error?.response) {
      error.friendlyMessage = "网络异常，请检查连接后重试";
    } else {
      error.friendlyMessage = "请求失败，请稍后重试";
    }
    return Promise.reject(error);
  }
);

export function getErrorMessage(error, fallback = "请求失败，请稍后重试") {
  return error?.friendlyMessage || error?.response?.data?.message || fallback;
}

export default client;
