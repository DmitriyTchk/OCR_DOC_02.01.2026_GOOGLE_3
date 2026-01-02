import { GoogleGenAI, Type } from "@google/genai";
import { PageAnalysisResult, DocxGenerationData } from "../types";

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found in environment variables.");
  }
  return new GoogleGenAI({ apiKey });
};

// --- Image Rotation Utility ---
export const processImageWithRotation = async (file: File, rotationDegrees: number): Promise<File> => {
    if (rotationDegrees === 0) return file;

    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                URL.revokeObjectURL(url);
                return reject(new Error("Could not get canvas context"));
            }

            // Calculate new dimensions
            if (rotationDegrees === 90 || rotationDegrees === 270) {
                canvas.width = img.height;
                canvas.height = img.width;
            } else {
                canvas.width = img.width;
                canvas.height = img.height;
            }

            // Rotate
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate((rotationDegrees * Math.PI) / 180);
            ctx.drawImage(img, -img.width / 2, -img.height / 2);

            canvas.toBlob((blob) => {
                URL.revokeObjectURL(url);
                if (blob) {
                    const newFile = new File([blob], file.name, { type: file.type });
                    resolve(newFile);
                } else {
                    reject(new Error("Canvas to Blob failed"));
                }
            }, file.type);
        };
        img.onerror = reject;
        img.src = url;
    });
};

// Helper to convert File to Base64
const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve({
        inlineData: {
          data: base64String,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Sanitize text for XML/DOCX validity
const sanitizeText = (text: string): string => {
    if (!text) return "";
    return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").trim();
};

const cleanMarkdown = (text: string): string => {
    if (!text) return "";
    return text
        .replace(/\*\*/g, "") // Remove bold
        .replace(/\#\#/g, "") // Remove headers
        .replace(/\_\_/g, "") // Remove italics
        .replace(/\*/g, "")
        .replace(/^#+\s/gm, "");
};

// --- CORE ANALYSIS ---

export const analyzePage = async (
  file: File, 
  targetLanguage: string
): Promise<PageAnalysisResult> => {
  const ai = getAiClient();
  const filePart = await fileToGenerativePart(file);

  // Using 2.0 Flash for better visual reasoning (bounding boxes)
  const modelId = "gemini-2.0-flash"; 

  const systemInstruction = `
    You are an expert document digitizer. Analyze the provided page.
    
    CRITICAL INSTRUCTION FOR TABLES, FORMULAS, AND FIGURES:
    Do NOT attempt to transcribe complex tables or mathematical formulas into text. 
    Instead, IDENTIFY their visual location and return them as 'table_crop', 'formula_crop', or 'image_crop' blocks with a \`boundingBox\`.
    
    Rules:
    1. Extract regular text (paragraphs, headings) normally.
    2. If you see a Table, Formula, or Diagram/Photo, return a block with the specific type and its \`boundingBox\` [ymin, xmin, ymax, xmax] (scale 0-1000).
    3. For 'image_crop' blocks, provide a short description in the \`text\` field.
    4. TRANSLATION RULES (CRITICAL):
       - If the target language is '${targetLanguage}' (and NOT 'Original'), you MUST translate EVERY text block.
       - **TRANSLATE THE FIRST PAGE.** Do not skip titles, journal names, or author names.
       - Even if the page looks like a cover page, TRANSLATE IT.
    5. Detect the Page Number if visible.
    
    Return strict JSON.
  `;

  const schema = {
    type: Type.OBJECT,
    properties: {
      pageNumber: { type: Type.INTEGER, nullable: true },
      hasContinuingSentence: { type: Type.BOOLEAN },
      blocks: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: { 
              type: Type.STRING, 
              enum: ["heading", "subheading", "author", "paragraph", "image_description", "table_crop", "formula_crop", "image_crop"] 
            },
            text: { type: Type.STRING, description: "Content or description (Translated if required)" },
            boundingBox: {
                 type: Type.ARRAY,
                 items: { type: Type.INTEGER },
                 description: "[ymin, xmin, ymax, xmax] coordinates on 0-1000 scale"
            }
          },
          required: ["type", "text"],
        },
      },
    },
    required: ["blocks", "hasContinuingSentence"],
  };

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        role: 'user',
        parts: [
          filePart,
          { text: `Analyze this page. Target Language: ${targetLanguage}. Remember to TRANSLATE everything if language is not Original.` }
        ]
      },
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: schema,
      }
    });

    if (response.text) {
      const result = JSON.parse(response.text) as PageAnalysisResult;
      result.blocks = result.blocks.map(b => ({
          ...b,
          text: sanitizeText(b.text)
      }));
      return result;
    }
    throw new Error("No response text from Gemini");
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return {
      blocks: [{ type: 'paragraph', text: `[Ошибка обработки страницы: ${file.name}]` }],
      hasContinuingSentence: false
    };
  }
};

// --- LOGICAL REORDERING ---

export const reorderPagesByContent = async (pages: DocxGenerationData[]): Promise<DocxGenerationData[]> => {
    if (pages.length <= 1) return pages;

    const ai = getAiClient();
    const modelId = "gemini-2.0-flash"; 

    // Prepare a lightweight JSON representing the flow of the document
    const pagesSummary = pages.map((p, index) => {
        const textBlocks = p.analysis.blocks.filter(b => b.type === 'paragraph' || b.type === 'heading');
        const firstText = textBlocks.length > 0 ? textBlocks[0].text.substring(0, 100) : "";
        const lastText = textBlocks.length > 0 ? textBlocks[textBlocks.length - 1].text.substring(textBlocks[textBlocks.length - 1].text.length - 100) : "";
        
        return {
            tempId: index,
            fileName: p.originalFileName,
            detectedPageNum: p.analysis.pageNumber,
            firstSentence: firstText,
            lastSentence: lastText
        };
    });

    const prompt = `
        I have a set of scanned pages from a document (article or journal). 
        They might be out of order.
        
        Your task is to reorder them logically based on:
        1. Detected Page Numbers (if available and reliable).
        2. Semantic Continuity: The last sentence of one page should logically connect to the first sentence of the next.
        
        Here is the data:
        ${JSON.stringify(pagesSummary, null, 2)}
        
        Return ONLY a JSON array of 'tempId' integers in the correct reading order.
        Example: [2, 0, 1, 3]
    `;

    try {
        const response = await ai.models.generateContent({
            model: modelId,
            contents: { role: 'user', parts: [{ text: prompt }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: { type: Type.INTEGER }
                }
            }
        });

        if (response.text) {
            const newOrderIds = JSON.parse(response.text) as number[];
            const reorderedPages: DocxGenerationData[] = [];
            newOrderIds.forEach(id => {
                if (pages[id]) reorderedPages.push(pages[id]);
            });
            // Add any missing pages (safety fallback)
            pages.forEach((p, idx) => {
                if (!newOrderIds.includes(idx)) reorderedPages.push(p);
            });
            return reorderedPages;
        }
        return pages; // Fallback
    } catch (e) {
        console.error("Reordering failed, using default sort", e);
        return [...pages].sort((a, b) => (a.analysis.pageNumber || 999) - (b.analysis.pageNumber || 999));
    }
};

// --- SUMMARY GENERATION ---

export const generateSummary = async (fullText: string, language: string): Promise<string> => {
  const ai = getAiClient();
  const modelId = "gemini-2.0-flash"; 

  try {
    const sanitizedInput = sanitizeText(fullText.substring(0, 60000)); // Increased context window
    
    const prompt = `
      Ты — опытный аналитик и редактор. Твоя задача — составить подробное, глубокое аналитическое резюме (Executive Summary) на основе предоставленного текста статьи.
      
      СТРОГИЕ ТРЕБОВАНИЯ К РЕЗЮМЕ:
      1. **Язык**: СТРОГО РУССКИЙ (вне зависимости от языка оригинала).
      2. **Формат**: Обычный текст (plain text). ЗАПРЕЩЕНО использовать Markdown символы (звездочки **, решетки ##).
      3. **Структура**: Резюме должно быть разбито на 4-5 отдельных, объемных абзацев, каждый из которых раскрывает конкретную тему. Разделяй абзацы двойным переносом строки.
      
      СМЫСЛОВЫЕ БЛОКИ ДЛЯ АБЗАЦЕВ:
      
      Блок 1: Контекст и Цели.
      О чем эта статья? Какую проблему решают авторы? Какова актуальность исследования?
      
      Блок 2: Методология и Подход.
      Какие методы использовались? Были ли эксперименты, математическое моделирование или теоретический анализ?
      
      Блок 3: Ключевые Результаты.
      Что конкретно было обнаружено или доказано? Приведи основные факты и аргументы из текста.
      
      Блок 4: Выводы и Заключение.
      К чему пришли авторы? Каково практическое значение работы?
      
      Текст для анализа:
      ${sanitizedInput}...
    `;

    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        role: "user",
        parts: [{ text: prompt }]
      }
    });
    
    const rawText = response.text || "Не удалось создать саммари.";
    return cleanMarkdown(sanitizeText(rawText));
  } catch (e) {
    return "Ошибка при генерации саммари.";
  }
};