const PDF_STORAGE_KEY = 'pdf_files';
const MESSAGES_STORAGE_KEY = 'messages';

export interface StoredPDF {
  id: string;
  name: string;
  size: number;
  dataUrl: string;
  timestamp: string;
  uploaded: boolean;
}

export interface StoredMessage {
  id: string;
  msg: string;
  date: string;
  uploaded: boolean;
}

// Gestion des fichiers PDF
export const savePDFToLocal = async (file: File): Promise<StoredPDF> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const pdf: StoredPDF = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        name: file.name,
        size: file.size,
        dataUrl: reader.result as string,
        timestamp: new Date().toISOString(),
        uploaded: false,
      };

      const existing = JSON.parse(localStorage.getItem(PDF_STORAGE_KEY) || '[]');
      existing.push(pdf);
      localStorage.setItem(PDF_STORAGE_KEY, JSON.stringify(existing));

      resolve(pdf);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const getPDFsFromLocal = (): StoredPDF[] => {
  return JSON.parse(localStorage.getItem(PDF_STORAGE_KEY) || '[]');
};

export const removePDFFromLocal = (id: string): void => {
  const pdfs = getPDFsFromLocal();
  const filtered = pdfs.filter((pdf) => pdf.id !== id);
  localStorage.setItem(PDF_STORAGE_KEY, JSON.stringify(filtered));
};

export const markPDFAsUploaded = (id: string): void => {
  const pdfs = getPDFsFromLocal();
  const updated = pdfs.map((pdf) => (pdf.id === id ? { ...pdf, uploaded: true } : pdf));
  localStorage.setItem(PDF_STORAGE_KEY, JSON.stringify(updated));
};

// Gestion des messages
export const saveMessageToLocal = (msg: string): StoredMessage => {
  const message: StoredMessage = {
    id: Date.now().toString(),
    msg,
    date: new Date().toISOString(),
    uploaded: false,
  };

  const existing = JSON.parse(localStorage.getItem(MESSAGES_STORAGE_KEY) || '[]');
  existing.push(message);
  localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(existing));

  return message;
};

export const getMessagesFromLocal = (): StoredMessage[] => {
  return JSON.parse(localStorage.getItem(MESSAGES_STORAGE_KEY) || '[]');
};

export const removeMessageFromLocal = (id: string): void => {
  const messages = getMessagesFromLocal();
  const filtered = messages.filter((msg) => msg.id !== id);
  localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(filtered));
};

export const markMessageAsUploaded = (id: string): void => {
  const messages = getMessagesFromLocal();
  const updated = messages.map((msg) => (msg.id === id ? { ...msg, uploaded: true } : msg));
  localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(updated));
};
