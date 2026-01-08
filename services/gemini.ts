
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { MeditationTheme, VoiceName, ImageSize, AspectRatio, MeditationScript } from "../types";

export const decodeBase64 = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
};

export const encodeBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
  }
  return buffer;
}

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const generateScript = async (theme: string): Promise<MeditationScript> => {
  const response = await getAI().models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Create a soothing guided meditation script for the theme: ${theme}. Return JSON with segments and timestamps.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          fullText: { type: Type.STRING },
          segments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { text: { type: Type.STRING }, startSecond: { type: Type.NUMBER }, endSecond: { type: Type.NUMBER } },
              required: ["text", "startSecond", "endSecond"]
            }
          }
        },
        required: ["title", "fullText", "segments"]
      }
    }
  });
  return JSON.parse(response.text);
};

export const generateVisual = async (prompt: string, size: ImageSize, ratio: AspectRatio): Promise<string> => {
  const response = await getAI().models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: { parts: [{ text: prompt }] },
    config: { imageConfig: { aspectRatio: ratio, imageSize: size } },
  });
  const part = response.candidates[0].content.parts.find(p => p.inlineData);
  if (!part) throw new Error("No image generated");
  return `data:image/png;base64,${part.inlineData.data}`;
};

export const editVisual = async (base64Data: string, prompt: string): Promise<string> => {
  const data = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const response = await getAI().models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        { inlineData: { data, mimeType: 'image/png' } },
        { text: prompt }
      ]
    },
  });
  const part = response.candidates[0].content.parts.find(p => p.inlineData);
  if (!part) throw new Error("Image editing failed");
  return `data:image/png;base64,${part.inlineData.data}`;
};

export const generateVideo = async (prompt: string, imageBase64?: string): Promise<string> => {
  const ai = getAI();
  const config = { numberOfVideos: 1, resolution: '720p' as const, aspectRatio: '16:9' as const };
  const imagePart = imageBase64 ? { image: { imageBytes: imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64, mimeType: 'image/png' } } : {};
  
  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt,
    ...imagePart,
    config
  });
  
  while (!operation.done) {
    await new Promise(r => setTimeout(r, 10000));
    operation = await ai.operations.getVideosOperation({ operation });
  }
  
  const link = operation.response?.generatedVideos?.[0]?.video?.uri;
  const res = await fetch(`${link}&key=${process.env.API_KEY}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
};

export const analyzeMedia = async (file: File, prompt: string): Promise<string> => {
  const reader = new FileReader();
  const base64Promise = new Promise<string>((resolve) => {
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  const data = await base64Promise;
  const mimeType = file.type;

  const response = await getAI().models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts: [{ inlineData: { data, mimeType } }, { text: prompt }] },
    config: { thinkingConfig: { thinkingBudget: 32768 } }
  });
  return response.text;
};

export const getSmartChat = async (message: string, useThinking = false, useGrounding = false) => {
  const ai = getAI();
  let model = 'gemini-3-flash-preview';
  let tools: any[] = [];
  let toolConfig: any = undefined;

  if (useThinking) {
    model = 'gemini-3-pro-preview';
  }

  if (useGrounding) {
    // Grounding with Maps requires 2.5 series
    model = 'gemini-2.5-flash';
    tools = [{ googleSearch: {} }, { googleMaps: {} }];
    
    try {
      const pos: any = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej));
      toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude
          }
        }
      };
    } catch (e) {
      console.warn("Location not available for Maps grounding.");
    }
  }

  const response = await ai.models.generateContent({
    model,
    contents: message,
    config: {
      ...(useThinking ? { thinkingConfig: { thinkingBudget: 32768 } } : {}),
      ...(tools.length > 0 ? { tools } : {}),
      ...(toolConfig ? { toolConfig } : {})
    }
  });
  
  const urls: { title: string; uri: string }[] = [];
  const grounding = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  grounding.forEach((chunk: any) => {
    if (chunk.web) urls.push({ title: chunk.web.title, uri: chunk.web.uri });
    if (chunk.maps) urls.push({ title: chunk.maps.title, uri: chunk.maps.uri });
  });

  return { text: response.text, urls };
};

export const fastResponse = async (prompt: string) => {
  const response = await getAI().models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: prompt
  });
  return response.text;
};

export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  const reader = new FileReader();
  const base64Promise = new Promise<string>((resolve) => {
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(audioBlob);
  });
  const data = await base64Promise;
  const response = await getAI().models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts: [{ inlineData: { data, mimeType: 'audio/wav' } }, { text: "Transcribe this audio accurately." }] }
  });
  return response.text;
};

export const processVoiceCommand = async (audioBlob: Blob) => {
  const transcript = await transcribeAudio(audioBlob);
  const response = await getAI().models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `The user said: "${transcript}". 
    Interpret this as an app control intent.
    Themes: Forest, Ocean, Space, Mountain, Zen.
    Voices: Kore, Puck, Charon, Fenrir, Zephyr.
    Actions: generate_image, generate_video, play, pause, stop.
    Return JSON format only.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          theme: { type: Type.STRING, enum: ["Forest", "Ocean", "Space", "Mountain", "Zen"] },
          voice: { type: Type.STRING, enum: ["Kore", "Puck", "Charon", "Fenrir", "Zephyr"] },
          action: { type: Type.STRING, enum: ["generate_image", "generate_video", "play", "pause", "stop"] }
        }
      }
    }
  });
  return { transcript, intent: JSON.parse(response.text) };
};

export const generateSpeech = async (text: string, voice: VoiceName): Promise<string> => {
  const response = await getAI().models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Read this calmly: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  });
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
};
