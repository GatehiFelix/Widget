import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: "AIzaSyD6L6ctdB9OcYcgsRlhAKZc3aMdyBYY8A4",
  modelName: "gemini-embedding-001"
});

const testText = "This is a test sentence.";

console.log("Testing Gemini embeddings...");

try {
  const result = await embeddings.embedQuery(testText);
  console.log("✅ Embedding generated successfully");
  console.log(`📏 Dimension: ${result.length}`);
  console.log(`📊 First 5 values: [${result.slice(0, 5).join(', ')}...]`);
  console.log(`🔢 Sample value: ${result[0]}`);
} catch (error) {
  console.error("❌ Error:", error.message);
}