import * as pdfjsLib from 'pdfjs-dist';

// Configure worker. 
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs`;

export const convertPdfToImages = async (file: File): Promise<Blob[]> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pageBlobs: Blob[] = [];

    // Iterate through ALL pages
    for (let i = 1; i <= pdf.numPages; i++) {
        try {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 }); // High quality for OCR
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            
            if (!context) continue;

            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            const blob = await new Promise<Blob | null>((resolve) => {
                canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.95);
            });

            if (blob) {
                pageBlobs.push(blob);
            }
        } catch (e) {
            console.error(`Error rendering page ${i}`, e);
        }
    }

    if (pageBlobs.length === 0) {
        throw new Error("Не удалось извлечь страницы из PDF");
    }

    return pageBlobs;
};

/**
 * Crops a region from an image blob based on normalized coordinates (0-1000).
 */
export const cropImageFromBlob = async (
    sourceBlob: Blob, 
    box: number[] // [ymin, xmin, ymax, xmax] (0-1000)
): Promise<Blob> => {
    if (!box || box.length < 4) return sourceBlob;

    const [ymin, xmin, ymax, xmax] = box;
    
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(sourceBlob);
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                URL.revokeObjectURL(url);
                return reject("No ctx");
            }

            // Convert 0-1000 scale to pixels
            const pixelX = (xmin / 1000) * img.width;
            const pixelY = (ymin / 1000) * img.height;
            const pixelW = ((xmax - xmin) / 1000) * img.width;
            const pixelH = ((ymax - ymin) / 1000) * img.height;

            // Add a small padding (margin)
            const padding = 5;
            const finalX = Math.max(0, pixelX - padding);
            const finalY = Math.max(0, pixelY - padding);
            const finalW = Math.min(img.width - finalX, pixelW + (padding * 2));
            const finalH = Math.min(img.height - finalY, pixelH + (padding * 2));

            // Validate dimensions
            if (finalW <= 0 || finalH <= 0) {
                 // Fallback to whole image if box is invalid
                 canvas.width = img.width;
                 canvas.height = img.height;
                 ctx.drawImage(img, 0, 0);
            } else {
                canvas.width = finalW;
                canvas.height = finalH;
                ctx.drawImage(img, finalX, finalY, finalW, finalH, 0, 0, finalW, finalH);
            }

            canvas.toBlob((blob) => {
                URL.revokeObjectURL(url);
                if (blob) resolve(blob);
                else reject("Crop failed");
            }, 'image/png');
        };
        img.onerror = () => reject("Image load failed");
        img.src = url;
    });
};