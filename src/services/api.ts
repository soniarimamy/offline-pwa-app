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
  data: string;
  timestamp: string;
}

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
    console.warn('Connection not available:', error);
    return false;
  }
};

export const getMessageFromAPI = async (id: string): Promise<MessageData> => {
  const response = await fetch(`${API_BASE_URL}/messages/${id}`);

  if (!response.ok) {
    throw new Error('Failed to fetch message from API');
  }

  return response.json();
};

export const getPDFFromAPI = async (id: string): Promise<PDFData> => {
  const response = await fetch(`${API_BASE_URL}/pdfs/${id}`);

  if (!response.ok) {
    throw new Error('Failed to fetch PDF from API');
  }

  return response.json();
};
