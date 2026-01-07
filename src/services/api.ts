const API_BASE_URL = 'http://localhost:3000/api';

export interface MessageData {
  id?: string;
  msg: string;
  date: string;
}

export interface PDFData {
  id?: string;
  name: string;
  size: number;
  data: string; // base64
  timestamp: string;
}

// API pour les messages
export const saveMessageToAPI = async (message: MessageData): Promise<MessageData> => {
  const response = await fetch(`${API_BASE_URL}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    throw new Error('Failed to save message to API');
  }

  return response.json();
};

export const getMessagesFromAPI = async (): Promise<MessageData[]> => {
  const response = await fetch(`${API_BASE_URL}/messages`);

  if (!response.ok) {
    throw new Error('Failed to fetch messages from API');
  }

  return response.json();
};

// API pour les fichiers PDF
export const uploadPDFToAPI = async (pdfData: PDFData): Promise<PDFData> => {
  const response = await fetch(`${API_BASE_URL}/pdfs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(pdfData),
  });

  if (!response.ok) {
    throw new Error('Failed to upload PDF to API');
  }

  return response.json();
};

export const getPDFsFromAPI = async (): Promise<PDFData[]> => {
  const response = await fetch(`${API_BASE_URL}/pdfs`);

  if (!response.ok) {
    throw new Error('Failed to fetch PDFs from API');
  }

  return response.json();
};

export const checkConnection = async (): Promise<boolean> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('Connexion non disponible:', error);
    return false;
  }
};
