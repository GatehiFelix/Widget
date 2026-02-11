import axios from "axios";

/**
 * Uses Gemini Vision API to generate a caption for an image (base64 or URL)
 * @param {Buffer|string} image - Image buffer or URL
 * @param {string} apiKey - Google Gemini API key
 * @returns {Promise<string>} Caption or description
 */
export async function geminiImageToCaption(image, apiKey) {
  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent?key=" + apiKey;
  let imagePart;
  if (Buffer.isBuffer(image)) {
    imagePart = {
      inlineData: {
        mimeType: "image/png",
        data: image.toString("base64"),
      },
    };
  } else if (typeof image === "string" && image.startsWith("http")) {
    imagePart = { url: image };
  } else {
    throw new Error("Invalid image input");
  }
  const body = {
    contents: [
      {
        parts: [
          imagePart,
          { text: "Describe this image in detail for retrieval." },
        ],
      },
    ],
  };
  const { data } = await axios.post(endpoint, body);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No caption returned from Gemini");
  return text;
}
