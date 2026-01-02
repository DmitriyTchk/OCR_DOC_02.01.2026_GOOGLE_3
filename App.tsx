import React, { useState, useRef, useEffect } from 'react';
import { FileItem, FolderGroup, ProcessingOptions, DocxGenerationData } from './types';
import { analyzePage, generateSummary, processImageWithRotation, reorderPagesByContent } from './services/geminiService';
import { createDocx } from './services/docxService';
import { convertPdfToImages } from './utils/pdfUtils'; 
import { naturalSort, isImage, isPdf } from './utils/sortUtils';

// --- Icons (Unchanged) ---
const FolderIcon = () => (
  <svg className="w-6 h-6 text-yellow-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
  </svg>
);
const FileIcon = ({ type }: { type: 'image' | 'pdf' }) => (
  <svg className={`w-5 h-5 ${type === 'pdf' ? 'text-red-400' : 'text-blue-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    {type === 'pdf' ? (
       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    ) : (
       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    )}
  </svg>
);
const EyeIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);
const RotateIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);
const ZoomInIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
  </svg>
);
const ZoomOutIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM5 10h14" />
  </svg>
);
const CloseIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const ExternalLinkIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
);


// --- Preview Modal Component ---
interface PreviewModalProps {
  fileItem: FileItem;
  onClose: () => void;
  onUpdateRotation: (id: string, newRotation: number) => void;
}

const PreviewModal: React.FC<PreviewModalProps> = ({ fileItem, onClose, onUpdateRotation }) => {
  const [scale, setScale] = useState(1);
  const [currentRotation, setCurrentRotation] = useState(fileItem.rotation);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (fileItem.file) {
      const objectUrl = URL.createObjectURL(fileItem.file);
      setUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }
  }, [fileItem.file]);

  if (!fileItem || !url) return null;

  const isPdfFile = isPdf(fileItem.file);

  const handleRotate = () => {
      const newRotation = (currentRotation + 90) % 360;
      setCurrentRotation(newRotation);
      if (!isPdfFile) {
          onUpdateRotation(fileItem.id, newRotation);
      }
  };

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-4">
      {/* Controls Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/90 to-transparent z-20 pointer-events-none">
        <div className="pointer-events-auto bg-slate-800/90 rounded-lg px-4 py-2 text-white font-mono text-sm shadow-lg border border-slate-700 flex items-center gap-2">
           <span className={isPdfFile ? "text-red-400" : "text-blue-400"}>{isPdfFile ? "PDF" : "IMG"}</span>
           {fileItem.name}
        </div>
        <div className="pointer-events-auto flex gap-2 bg-slate-800/50 p-1 rounded-xl backdrop-blur-sm">
            <button onClick={handleZoomOut} className="p-2 hover:bg-slate-700 text-white rounded-lg transition-colors" title="Уменьшить">
                <ZoomOutIcon />
            </button>
            <button onClick={handleZoomIn} className="p-2 hover:bg-slate-700 text-white rounded-lg transition-colors" title="Увеличить">
                <ZoomInIcon />
            </button>
            {!isPdfFile && (
                <button onClick={handleRotate} className="p-2 hover:bg-slate-700 text-white rounded-lg transition-colors" title="Повернуть (Влияет на результат)">
                    <RotateIcon />
                </button>
            )}
            {isPdfFile && (
                <a href={url} target="_blank" rel="noreferrer" className="p-2 hover:bg-indigo-600 text-white rounded-lg transition-colors" title="Открыть в новой вкладке (если не грузится)">
                    <ExternalLinkIcon />
                </a>
            )}
            <div className="w-px bg-slate-600 mx-1"></div>
            <button onClick={onClose} className="p-2 hover:bg-red-600 text-white rounded-lg transition-colors" title="Закрыть">
                <CloseIcon />
            </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center overflow-hidden w-full h-full relative z-10">
         <div 
            className="transition-transform duration-300 ease-out origin-center flex items-center justify-center"
            style={{ 
                transform: `scale(${scale}) rotate(${isPdfFile ? 0 : currentRotation}deg)`,
                width: isPdfFile ? '90%' : 'auto',
                height: isPdfFile ? '95%' : 'auto',
                maxWidth: '95vw',
                maxHeight: '95vh'
            }}
         >
            {isPdfFile ? (
                <object 
                    data={url} 
                    type="application/pdf"
                    className="w-full h-full bg-slate-200 rounded shadow-2xl"
                >
                    <div className="flex flex-col items-center justify-center h-full bg-slate-800 text-slate-300 p-8 text-center">
                        <p className="mb-4">Браузер не может отобразить PDF в этом окне.</p>
                        <a href={url} target="_blank" rel="noreferrer" className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded">
                            Открыть PDF в новой вкладке
                        </a>
                    </div>
                </object>
            ) : (
                <img 
                    src={url} 
                    alt="Preview" 
                    className="max-w-full max-h-full object-contain rounded shadow-2xl bg-slate-800"
                />
            )}
         </div>
      </div>
    </div>
  );
};


// --- Main App Component ---

const App: React.FC = () => {
  const [folders, setFolders] = useState<FolderGroup[]>([]);
  const [cloudLink, setCloudLink] = useState('');
  const [processingLog, setProcessingLog] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewFileItem, setPreviewFileItem] = useState<FileItem | null>(null);
  
  const [options, setOptions] = useState<ProcessingOptions>({
    language: 'Original',
    generateSummary: true,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = (msg: string) => {
    setProcessingLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const handleDirectoryPick = async () => {
    try {
      // @ts-ignore
      if (window.showDirectoryPicker) {
        // @ts-ignore
        const handle = await window.showDirectoryPicker();
        addLog(`Выбрана папка: ${handle.name}`);
        throw new Error("Force Fallback");
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
          // Proceed to fallback
      }
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const allFiles = Array.from(e.target.files) as File[];
      const groups: Record<string, FileItem[]> = {};

      allFiles.forEach(file => {
        if (isImage(file) || isPdf(file)) {
            const pathParts = file.webkitRelativePath.split('/');
            const folderName = pathParts.length > 1 ? pathParts[pathParts.length - 2] : 'Root';
            
            if (!groups[folderName]) groups[folderName] = [];
            
            groups[folderName].push({
              id: `${folderName}_${file.name}_${file.size}`,
              name: file.name,
              path: file.webkitRelativePath,
              file: file,
              type: isPdf(file) ? 'pdf' : 'image',
              selected: true,
              rotation: 0 
            });
        }
      });

      const newFolders: FolderGroup[] = Object.entries(groups).map(([name, files]) => ({
        folderName: name,
        files: naturalSort(files, (f) => f.name),
        status: 'pending'
      }));

      setFolders(newFolders);
      addLog(`Загружено ${newFolders.length} папок с файлами.`);
    }
  };

  const toggleFileSelection = (folderIdx: number, fileId: string) => {
      setFolders(prev => {
          const newFolders = [...prev];
          const folder = newFolders[folderIdx];
          folder.files = folder.files.map(f => 
              f.id === fileId ? { ...f, selected: !f.selected } : f
          );
          return newFolders;
      });
  };

  const toggleFolderSelection = (folderIdx: number, selectAll: boolean) => {
      setFolders(prev => {
          const newFolders = [...prev];
          const folder = newFolders[folderIdx];
          folder.files = folder.files.map(f => ({ ...f, selected: selectAll }));
          return newFolders;
      });
  };

  const updateFileRotation = (fileId: string, newRotation: number) => {
      setFolders(prev => {
          return prev.map(folder => ({
              ...folder,
              files: folder.files.map(f => f.id === fileId ? { ...f, rotation: newRotation } : f)
          }));
      });
  };

  // --- Processing Logic ---

  const processFolders = async () => {
    const foldersToProcess = folders.filter(f => f.files.some(file => file.selected));

    if (foldersToProcess.length === 0) {
        addLog("Нет выбранных файлов для обработки.");
        return;
    }

    setIsProcessing(true);
    addLog("Начало обработки...");

    const updatedFolders = [...folders];

    for (let i = 0; i < updatedFolders.length; i++) {
      const folder = updatedFolders[i];
      const filesToProcess = folder.files.filter(f => f.selected);
      if (filesToProcess.length === 0) continue;

      folder.status = 'processing';
      setFolders([...updatedFolders]);

      const docxPagesBuffer: DocxGenerationData[] = [];

      // PHASE 1: EXTRACTION & ANALYSIS
      addLog(`[ФАЗА 1] Извлечение и анализ страниц...`);

      for (const fileItem of filesToProcess) {
        try {
          // If PDF, extract ALL pages
          if (fileItem.type === 'pdf') {
              addLog(`  Извлечение всех страниц из PDF: ${fileItem.name}...`);
              const pdfPageBlobs = await convertPdfToImages(fileItem.file);
              addLog(`    -> Получено ${pdfPageBlobs.length} страниц изображений.`);
              
              for (let idx = 0; idx < pdfPageBlobs.length; idx++) {
                  const blob = pdfPageBlobs[idx];
                  const tempFile = new File([blob], `${fileItem.name}_page_${idx+1}.jpg`, { type: 'image/jpeg' });
                  
                  addLog(`    Анализ страницы PDF ${idx+1}/${pdfPageBlobs.length}...`);
                  const analysis = await analyzePage(tempFile, options.language);
                  
                  docxPagesBuffer.push({
                      originalFileName: `${fileItem.name} [Page ${idx+1}]`,
                      analysis,
                      imageBlob: blob,
                      sourceType: 'image' // treated as image after extraction
                  });
              }
          } 
          // If Image, just process
          else if (fileItem.type === 'image') {
              let fileToAnalyze: File = fileItem.file;
              if (fileItem.rotation !== 0) {
                  addLog(`  Применение поворота ${fileItem.rotation}° для ${fileItem.name}...`);
                  fileToAnalyze = await processImageWithRotation(fileItem.file, fileItem.rotation);
              }

              addLog(`  Анализ изображения: ${fileItem.name}...`);
              const analysis = await analyzePage(fileToAnalyze, options.language);

              docxPagesBuffer.push({
                  originalFileName: fileItem.name,
                  analysis,
                  imageBlob: fileToAnalyze,
                  sourceType: 'image'
              });
          }

        } catch (err) {
          addLog(`  Ошибка обработки файла ${fileItem.name}: ${err}`);
          console.error(err);
        }
      }

      // PHASE 2: LOGICAL REORDERING
      addLog(`[ФАЗА 2] Логическая стыковка ${docxPagesBuffer.length} страниц...`);
      const orderedPages = await reorderPagesByContent(docxPagesBuffer);
      addLog(`  Порядок восстановлен.`);

      // PHASE 3: SUMMARY GENERATION
      let summaryText = null;
      if (options.generateSummary) {
          addLog(`[ФАЗА 3] Генерация саммари...`);
          // Extract full text from ordered pages
          const fullText = orderedPages.map(p => 
              p.analysis.blocks
                .filter(b => b.type !== 'image_crop' && b.type !== 'table_crop')
                .map(b => b.text).join(' ')
          ).join('\n\n');

          summaryText = await generateSummary(fullText, options.language === 'Original' ? 'Russian' : options.language);
      }

      // PHASE 4: DOCX CREATION
      addLog(`[ФАЗА 4] Сборка DOCX документа...`);
      try {
        const blob = await createDocx(orderedPages, summaryText);
        folder.resultDocBlob = blob;
        folder.status = 'completed';
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${folder.folderName}_AI_Processed.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        addLog(`  Успешно: ${folder.folderName}_AI_Processed.docx`);
      } catch (e) {
        addLog(`  Ошибка создания DOCX: ${e}`);
        console.error(e);
        folder.status = 'error';
      }

      setFolders([...updatedFolders]);
    }

    setIsProcessing(false);
    addLog("Все задачи выполнены.");
  };

  return (
    <div className="flex flex-col h-full font-sans relative">
      {/* Preview Modal */}
      {previewFileItem && (
          <PreviewModal 
            fileItem={previewFileItem} 
            onClose={() => setPreviewFileItem(null)} 
            onUpdateRotation={updateFileRotation}
          />
      )}

      {/* Header */}
      <header className="bg-slate-800 p-4 border-b border-slate-700 shadow-md flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            <div>
                <h1 className="text-xl font-bold text-white">AI Оцифровщик Документов</h1>
                <p className="text-xs text-slate-400">Gemini 2.5 Flash • PDF & IMG • Smart Order</p>
            </div>
        </div>
        <div className="flex items-center gap-4">
            <select 
                className="bg-slate-700 border border-slate-600 rounded px-3 py-1 text-sm text-white focus:ring-2 focus:ring-indigo-500"
                value={options.language}
                onChange={(e) => setOptions({...options, language: e.target.value})}
            >
                <option value="Original">Без перевода (Оригинал)</option>
                <option value="Russian">Русский</option>
                <option value="English">English</option>
                <option value="German">Deutsch</option>
                <option value="Chinese">中文</option>
            </select>
            <label className="flex items-center space-x-2 cursor-pointer">
                <input 
                    type="checkbox" 
                    checked={options.generateSummary}
                    onChange={e => setOptions({...options, generateSummary: e.target.checked})}
                    className="form-checkbox h-4 w-4 text-indigo-600 rounded bg-slate-700 border-slate-600"
                />
                <span className="text-sm text-slate-300">Создать Саммари</span>
            </label>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* Left Panel: Configuration & Input */}
        <aside className="w-1/3 min-w-[350px] bg-slate-850 p-6 flex flex-col gap-6 border-r border-slate-700 overflow-y-auto z-0">
            
            {/* Cloud Section */}
            <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                <h3 className="text-sm font-semibold text-slate-300 mb-2 uppercase tracking-wider">Облачный Источник</h3>
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        placeholder="Ссылка на Google Drive..." 
                        value={cloudLink}
                        onChange={(e) => setCloudLink(e.target.value)}
                        className="flex-1 bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    <button 
                        onClick={() => addLog("Демо режим: Облачные ссылки требуют OAuth. Используйте локальные файлы.")}
                        className="bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded text-slate-300 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                    </button>
                </div>
            </div>

            {/* Local Section */}
            <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 flex flex-col gap-4 flex-1">
                 <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Локальные файлы</h3>
                 
                 <div className="border-2 border-dashed border-slate-600 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-700/50 transition-all group" onClick={handleDirectoryPick}>
                    <div className="p-4 bg-slate-700 rounded-full mb-3 group-hover:bg-indigo-600 transition-colors">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                    </div>
                    <p className="text-slate-300 font-medium">Выбрать папку с журналом</p>
                    <p className="text-xs text-slate-500 mt-1">Поддержка JPG, PNG, PDF, TIFF</p>
                 </div>
                 
                 {/* Hidden Input for Fallback */}
                 <input 
                    type="file" 
                    ref={fileInputRef} 
                    // @ts-ignore
                    webkitdirectory="" 
                    directory="" 
                    multiple 
                    className="hidden" 
                    onChange={handleFileInputChange} 
                 />

                 {/* File List Preview */}
                 {folders.length > 0 && (
                     <div className="flex-1 overflow-y-auto min-h-[200px] bg-slate-900 rounded border border-slate-700 p-2">
                        {folders.map((folder, folderIdx) => {
                            const allSelected = folder.files.every(f => f.selected);
                            const someSelected = folder.files.some(f => f.selected);

                            return (
                                <div key={folderIdx} className="mb-4">
                                    <div className="flex items-center text-sm font-bold text-slate-300 mb-1 sticky top-0 bg-slate-900 py-1 z-10 gap-2">
                                        <FolderIcon />
                                        <div className="flex-1 truncate">{folder.folderName}</div>
                                        
                                        {/* Folder Select All Checkbox */}
                                        <input 
                                            type="checkbox" 
                                            checked={allSelected}
                                            ref={input => {
                                                if (input) input.indeterminate = someSelected && !allSelected;
                                            }}
                                            onChange={(e) => toggleFolderSelection(folderIdx, e.target.checked)}
                                            className="cursor-pointer w-4 h-4 rounded border-slate-500 bg-slate-700 text-indigo-500 focus:ring-indigo-500"
                                            title="Выбрать все"
                                        />

                                        <span className={`text-xs px-2 py-0.5 rounded ${
                                            folder.status === 'completed' ? 'bg-green-900 text-green-300' : 
                                            folder.status === 'processing' ? 'bg-yellow-900 text-yellow-300' : 'bg-slate-700'
                                        }`}>
                                            {folder.status === 'completed' ? 'Готово' : folder.status === 'processing' ? 'В работе' : 'Ожидание'}
                                        </span>
                                    </div>
                                    <div className="pl-6 space-y-1">
                                        {folder.files.map((file) => (
                                            <div 
                                                key={file.id} 
                                                className={`flex items-center text-xs p-1 rounded hover:bg-slate-800 gap-2 group transition-colors ${
                                                    file.selected ? 'text-slate-200' : 'text-slate-500'
                                                }`}
                                            >
                                                <input 
                                                    type="checkbox"
                                                    checked={file.selected}
                                                    onChange={() => toggleFileSelection(folderIdx, file.id)}
                                                    className="cursor-pointer w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-offset-slate-900"
                                                />
                                                <FileIcon type={file.type} />
                                                <span 
                                                    className={`flex-1 truncate cursor-pointer select-none ${!file.selected && 'line-through opacity-50'} ${file.rotation !== 0 ? 'text-indigo-400' : ''}`}
                                                    onClick={() => toggleFileSelection(folderIdx, file.id)}
                                                >
                                                    {file.name} {file.rotation !== 0 && `(↻${file.rotation}°)`}
                                                </span>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setPreviewFileItem(file); }}
                                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-700 rounded text-slate-300 transition-opacity"
                                                    title="Предпросмотр"
                                                >
                                                    <EyeIcon />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                     </div>
                 )}
            </div>

            <button
                disabled={isProcessing || folders.length === 0}
                onClick={processFolders}
                className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transform transition-all active:scale-95 ${
                    isProcessing || folders.length === 0
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500 hover:shadow-indigo-500/25'
                }`}
            >
                {isProcessing ? (
                    <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Обработка...
                    </span>
                ) : "Начать Обработку"}
            </button>
        </aside>

        {/* Right Panel: Logs & Preview */}
        <section className="flex-1 bg-slate-900 p-6 flex flex-col gap-4">
            <div className="bg-black/40 rounded-xl border border-slate-700 flex-1 p-4 font-mono text-sm overflow-hidden flex flex-col shadow-inner">
                <h3 className="text-xs font-bold text-slate-500 uppercase mb-2 border-b border-slate-800 pb-2">Системный Журнал</h3>
                <div className="flex-1 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent pr-2">
                    {processingLog.length === 0 && <span className="text-slate-600 italic">Ожидание действий...</span>}
                    {processingLog.map((log, i) => (
                        <div key={i} className="text-green-400 break-words border-l-2 border-transparent hover:border-slate-600 pl-2">
                            <span className="opacity-50 mr-2">{log.split(']')[0]}]</span>
                            {log.split(']')[1]}
                        </div>
                    ))}
                    {/* Auto scroll anchor */}
                    <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
                </div>
            </div>

            <div className="h-1/3 bg-slate-800 rounded-xl border border-slate-700 p-6 flex flex-col justify-center items-center text-center">
                <h2 className="text-xl font-semibold text-white mb-2">Инструкция</h2>
                <ul className="text-sm text-slate-400 space-y-2 max-w-lg">
                    <li>1. Выберите папку с изображениями или PDF.</li>
                    <li>2. Отметьте галочками нужные файлы (или "Выбрать все").</li>
                    <li>3. Используйте иконку "Глаз" для предпросмотра, поворота и зума страниц.</li>
                    <li>4. Нажмите "Начать обработку". Результат скачается автоматически.</li>
                </ul>
            </div>
        </section>

      </main>
    </div>
  );
};

export default App;