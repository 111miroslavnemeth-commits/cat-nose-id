export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  const apiKey = process.env.ROBOFLOW_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: "ROBOFLOW_API_KEY is not configured."
    });
  }

  const roboflowUrl =
    "https://serverless.roboflow.com/infer/workflows/miroslav-nemeth/cat-face-data-atoiv";

  try {
    const body = req.body;

    if (!body || !body.image) {
      return res.status(400).json({
        ok: false,
        error: "Missing image."
      });
    }

    let image = body.image;

    if (typeof image === "string") {
      image = {
        type: "base64",
        value: image
      };
    }

    if (!image.value) {
      return res.status(400).json({
        ok: false,
        error: "Image value is missing."
      });
    }

    const response = await fetch(roboflowUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        api_key: apiKey,
        inputs: {
          image: {
            type: image.type || "base64",
            value: image.value
          }
        }
      })
    });

    const text = await response.text();

    let result;

    try {
      result = JSON.parse(text);
    } catch {
      result = {
        raw: text
      };
    }

    console.log("Roboflow status:", response.status);
    console.log("Roboflow response:", result);

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: "Roboflow returned an error.",
        roboflow: result
      });
    }

    return res.status(200).json({
      ok: true,
      result: result
    });

  } catch (error) {
    console.error("Roboflow connection error:", error);

    return res.status(502).json({
      ok: false,
      error: "Server could not connect to Roboflow.",
      details: error.message
    });
  }
}
