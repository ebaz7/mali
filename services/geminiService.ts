
import { apiCall } from './apiService';

export const enhanceDescription = async (text: string): Promise<string> => {
  if (!text) return "";
  try {
    // Send a prompt to the server, which proxies to n8n/OpenAI
    const prompt = `لطفا متن زیر را به زبان فارسی رسمی و اداری برای شرح سند حسابداری بازنویسی کن. فقط متن نهایی را برگردان و هیچ توضیح اضافه‌ای نده: "${text}"`;
    const response = await apiCall<{ reply: string }>('/ai-request', 'POST', { message: prompt });
    return response.reply || text;
  } catch (error) {
    console.error("AI Service Error:", error);
    return text;
  }
};
