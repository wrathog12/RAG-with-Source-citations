export async function sendMessageOnce(
  url: string,
  body: FormData
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    body,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "Unknown error");
    throw new Error("Server Error: " + errorText);
  }

  return await res.text();
}
