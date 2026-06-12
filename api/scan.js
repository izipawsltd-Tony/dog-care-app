import Anthropic from "@anthropic-ai/sdk";
import {
  TextractClient,
  DetectDocumentTextCommand,
} from "@aws-sdk/client-textract";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const awsRegion = process.env.AWS_REGION || "ap-southeast-2";
  const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
  const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!anthropicKey)
    return res.status(500).json({ error: "Anthropic API key not configured" });
  if (!awsAccessKey || !awsSecretKey)
    return res.status(500).json({ error: "AWS credentials not configured" });

  try {
    const { messages, model, max_tokens, system } = req.body;

    // Check if this is a document scan request (has image/document content)
    const hasDocument = messages?.some((m) =>
      Array.isArray(m.content)
        ? m.content.some((c) => c.type === "image" || c.type === "document")
        : false
    );

    if (hasDocument) {
      // Extract base64 data from message
      let base64Data = null;
      let mediaType = null;

      for (const msg of messages) {
        if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === "document" && block.source?.data) {
              base64Data = block.source.data;
              mediaType = "pdf";
            } else if (block.type === "image" && block.source?.data) {
              base64Data = block.source.data;
              mediaType = block.source.media_type;
            }
          }
        }
      }

      if (base64Data) {
        // Step 1: Run Textract OCR
        const textractClient = new TextractClient({
          region: awsRegion,
          credentials: {
            accessKeyId: awsAccessKey,
            secretAccessKey: awsSecretKey,
          },
        });

        const imageBuffer = Buffer.from(base64Data, "base64");
        const textractCommand = new DetectDocumentTextCommand({
          Document: { Bytes: imageBuffer },
        });

        let extractedText = "";
        try {
          const textractResult = await textractClient.send(textractCommand);
          const lines = textractResult.Blocks?.filter(
            (b) => b.BlockType === "LINE"
          ).map((b) => b.Text || "");
          extractedText = lines.join("\n");
        } catch (textractErr) {
          console.error("Textract error:", textractErr.message);
          // Fall through to Claude vision if Textract fails
        }

        if (extractedText) {
          // Step 2: Use Claude to parse the clean OCR text
          const anthropic = new Anthropic({ apiKey: anthropicKey });

          // Get the text prompt from messages
          const textPrompt = messages
            .flatMap((m) =>
              Array.isArray(m.content)
                ? m.content.filter((c) => c.type === "text").map((c) => c.text)
                : [m.content]
            )
            .join("\n");

          const parseResponse = await anthropic.messages.create({
            model: model || "claude-opus-4-5",
            max_tokens: max_tokens || 1500,
            messages: [
              {
                role: "user",
                content: `${textPrompt}\n\nHere is the OCR text extracted from the document:\n\n${extractedText}`,
              },
            ],
          });

          return res.status(200).json(parseResponse);
        }
      }
    }

    // Fallback: pass through to Anthropic directly (no document)
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
