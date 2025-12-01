
import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
export const enhanceDescription = async (text: string): Promise<string> => {
  if (!text) return "";
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Reword the following payment description into formal Persian business language suitable for a financial voucher or invoice. Keep it concise. Input: "${text}"`,
    });
    return response.text.trim();
  } catch (error) {
    console.error("Gemini API Error:", error);
    return text;
  }
};
