export interface FileItem {
  id: string; // Unique ID (path + name)
  name: string;
  path: string; // Relative path for display
  file: File;
  type: 'image' | 'pdf';
  selected: boolean; // Checkbox state
  rotation: number; // 0, 90, 180, 270
}

export interface FolderGroup {
  folderName: string;
  files: FileItem[];
  status: 'pending' | 'processing' | 'completed' | 'error';
  resultDocBlob?: Blob;
}

export interface ProcessingOptions {
  language: string; // 'ru', 'en', 'de', 'zh' etc.
  generateSummary: boolean;
}

// AI Response Structure
export interface PageContentBlock {
  type: 'heading' | 'subheading' | 'author' | 'paragraph' | 'image_description' | 'table_row' | 'table_crop' | 'formula_crop' | 'image_crop';
  text: string;
  isTranslated?: boolean;
  boundingBox?: number[]; // [ymin, xmin, ymax, xmax] - 0 to 1000 scale
}

export interface PageAnalysisResult {
  pageNumber?: number; // Detected page number
  blocks: PageContentBlock[];
  hasContinuingSentence: boolean; // Does the last sentence look cut off?
}

export interface DocxGenerationData {
  originalFileName: string;
  analysis: PageAnalysisResult;
  imageBlob?: Blob; // Provide original image for embedding/cropping
  sourceType: 'image' | 'pdf'; // To know how to handle cropping
}