export async function streamMessage(
  url: string,
  body: FormData,
  onChunk: (chunk: string) => void,
  onFinish: () => void
) {
  const response = await fetch(url, {
    method: "POST",
    body,
  });

  if (!response.ok || !response.body) {
    onChunk("Failed to get a response from the server.");
    onFinish();
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      onChunk(chunk);
    }
  } finally {
    onFinish();
    reader.releaseLock();
  }
}