import { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, AlignmentType } from "docx";
import { DocxGenerationData } from "../types";
import { cropImageFromBlob } from "../utils/pdfUtils";

export const createDocx = async (
  pages: DocxGenerationData[], // Assumed to be ALREADY ordered by the App logic
  summary: string | null
): Promise<Blob> => {
  
  const docChildren: any[] = [];

  // 1. Add Summary
  if (summary) {
    docChildren.push(
      new Paragraph({
        text: "РЕЗЮМЕ (SUMMARY)",
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
      }),
      new Paragraph({
        children: [new TextRun({ text: summary, size: 24 })], // 12pt
        spacing: { after: 600, line: 360 }, // 1.5 spacing
        alignment: AlignmentType.JUSTIFIED,
      }),
      new Paragraph({
        text: "--- ТЕКСТ ДОКУМЕНТА ---",
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        color: "999999"
      })
    );
  }

  // 2. Process Ordered Pages
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    
    // Add page delimiter for clarity in draft check (optional, helps user verify order)
    /*
    docChildren.push(new Paragraph({
         text: `[Стр. ${page.analysis.pageNumber || '?'}: ${page.originalFileName}]`,
         color: "CCCCCC",
         size: 16
    }));
    */

    // Process blocks
    for (let bIdx = 0; bIdx < page.analysis.blocks.length; bIdx++) {
      const block = page.analysis.blocks[bIdx];
      let paragraph;

      // Special handling for CROPPED elements (Images, Tables, Formulas)
      if (['image_crop', 'table_crop', 'formula_crop'].includes(block.type) && block.boundingBox && page.imageBlob) {
          try {
              // Crop the specific region
              const croppedBlob = await cropImageFromBlob(page.imageBlob, block.boundingBox);
              const buffer = await croppedBlob.arrayBuffer();

              const caption = block.text !== "null" ? block.text : 
                             (block.type === 'table_crop' ? "Таблица" : 
                             (block.type === 'formula_crop' ? "Формула" : "Рисунок"));

              docChildren.push(
                  new Paragraph({
                      children: [
                          new ImageRun({
                              data: buffer,
                              transformation: { width: 450, height: 450 }, // Safe constraints
                          })
                      ],
                      alignment: AlignmentType.CENTER,
                      spacing: { before: 200, after: 100 }
                  }),
                  new Paragraph({
                      text: `[${caption}]`,
                      alignment: AlignmentType.CENTER,
                      style: "Caption",
                      spacing: { after: 300 },
                      color: "666666"
                  })
              );
              continue; // Skip standard text processing for this block
          } catch (e) {
              console.error("Crop error", e);
              paragraph = new Paragraph({
                  text: `[Ошибка отображения: ${block.text}]`,
                  color: "FF0000"
              });
          }
      } else {
          // Standard Text Elements
          switch (block.type) {
            case 'heading':
              paragraph = new Paragraph({
                text: block.text,
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 400, after: 200 },
                keepNext: true
              });
              break;
            case 'subheading':
              paragraph = new Paragraph({
                text: block.text,
                heading: HeadingLevel.HEADING_3,
                spacing: { before: 300, after: 150 },
                keepNext: true
              });
              break;
            case 'author':
              paragraph = new Paragraph({
                children: [new TextRun({ text: block.text, bold: true, italics: true })],
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 },
              });
              break;
            case 'paragraph':
            default:
              paragraph = new Paragraph({
                text: block.text,
                alignment: AlignmentType.JUSTIFIED,
                spacing: { after: 200, line: 276 }, 
              });
              break;
          }
      }
      
      if (paragraph) docChildren.push(paragraph);
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: docChildren,
      },
    ],
  });

  return await Packer.toBlob(doc);
};