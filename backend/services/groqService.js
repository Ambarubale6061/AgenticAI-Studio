// backend/services/groqService.js
import fetch from "node-fetch";

const GROQ_API_KEY = process.env.GROQ_API_KEY;

export async function streamGroqChat(
  messages,
  model = "llama-3.3-70b-versatile",
  res,
) {
  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages, stream: true }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Groq API error:", response.status, errorText);
    throw new Error(`Groq API error: ${response.status}`);
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Node.js readable stream handling
  const stream = response.body;
  stream.on("data", (chunk) => {
    res.write(chunk);
  });

  stream.on("end", () => {
    res.end();
  });

  stream.on("error", (err) => {
    console.error("Stream error:", err);
    res.status(500).json({ error: "Stream error" });
  });
}
