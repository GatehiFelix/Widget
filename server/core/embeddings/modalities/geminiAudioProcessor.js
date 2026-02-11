import axios from "axios";

/**
 * Uses Gemini API to transcribe audio (base64 or URL)
 * @param {Buffer|string} audio - Audio buffer or URL
 * @param {string} apiKey - Google Gemini API key
 * @returns {Promise<string>} Transcribed text
 */
export async function geminiAudioToText(audio, apiKey) {
  // Gemini does not natively transcribe audio, so use Google Speech-to-Text API
  const endpoint = `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`;
  let audioContent;
  if (Buffer.isBuffer(audio)) {
    audioContent = audio.toString("base64");
  } else {
    throw new Error("Audio must be a Buffer");
  }
  const body = {
    config: {
      encoding: "LINEAR16", // or "MP3" if mp3
      languageCode: "en-US",
    },
    audio: {
      content: audioContent,
    },
  };
  const { data } = await axios.post(endpoint, body);
  const transcript = data?.results?.[0]?.alternatives?.[0]?.transcript;
  if (!transcript) throw new Error("No transcript returned from Speech-to-Text");
  return transcript;
}
