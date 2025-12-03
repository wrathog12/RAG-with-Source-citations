import { sendMessageOnce } from "@/utils/sendMesssage";

export function useChatService() {
  const sendMessage = async (message: string, file?: File) => {
    const fd = new FormData();
    fd.append("user_query", message);

    if (file) {
      fd.append("file", file);
    }

    return await sendMessageOnce("/api/chat", fd);
  };

  return { sendMessage };
}
