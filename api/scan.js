import { TextractClient, DetectDocumentTextCommand } from "@aws-sdk/client-textract";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const awsRegion = process.env.AWS_REGION || "ap-southeast-2";
  const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
  const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!anthropicKey) return res.status(500).json({ error: "Anthropic API key not configured" });
  if (!awsAccessKey || !awsSecretKey) return res.status(500).json({ error: "AWS credentials not configured" });

  try {
    const { messages, model, max_tokens } = req.body;

    // Check if request has a document/image
    let base64Data = null;
    let isDocument = false;

    for (const msg of messages || []) {
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "document" && block.source?.data) {
            base64Data = block.source.data;
            isDocument = true;
          } else if (block.type === "image" && block.source?.data) {
            base64Data = block.source.data;
            isDocument = true;
          }
        }
      }
    }

    if (isDocument && base64Data) {
      // Step 1: Textract OCR
      const textractClient = new TextractClient({
        region: awsRegion,
        credentials: { accessKeyId: awsAccessKey, secretAccessKey: awsSecretKey },
      });

      let extractedText = "";
      try {
        const imageBuffer = Buffer.from(base64Data, "base64");
        const result = await textractClient.send(
          new DetectDocumentTextCommand({ Document: { Bytes: imageBuffer } })
        );
        extractedText = result.Blocks
          ?.filter(b => b.BlockType === "LINE")
          .map(b => b.Text || "")
          .join("\n") || "";
      } catch (err) {
        console.error("Textract error:", err.message);
      }

      if (extractedText) {
        // Step 2: Claude parses OCR text
        const textPrompt = messages
          .flatMap(m => Array.isArray(m.content)
            ? m.content.filter(c => c.type === "text").map(c => c.text)
            : [m.content])
          .join("\n");

        const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: model || "claude-opus-4-5",
            max_tokens: max_tokens || 1500,
            messages: [{
              role: "user",
              content: `${textPrompt}\n\nOCR text extracted from document:\n\n${extractedText}`
            }]
          }),
        });

        const data = await claudeResponse.json();
        return res.status(claudeResponse.status).json(data);
      }
    }

    // Fallback: pass through directly to Anthropic
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    return res.status(response.status).json(data);

  } catch (e) {
    console.error("scan.js error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
