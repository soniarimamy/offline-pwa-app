import {
  saveMessageToLocal,
  getMessagesFromLocal,
  savePDFToLocal,
  getPDFsFromLocal,
  markMessageAsUploaded,
  markPDFAsUploaded,
  type StoredMessage,
  type StoredPDF,
} from './fileStorage';

import {
  saveMessageToAPI,
  getMessagesFromAPI,
  uploadPDFToAPI,
  getPDFsFromAPI,
  type MessageData,
  type PDFData,
  checkConnection,
} from './api';

export class DataManager {
  static async saveMessage(text: string): Promise<{ local: StoredMessage; online: boolean }> {
    const isOnline = await checkConnection();

    if (isOnline) {
      try {
        const messageData: MessageData = {
          msg: text,
          date: new Date().toISOString(),
        };

        const onlineMessage = await saveMessageToAPI(messageData);

        const localMessage: StoredMessage = {
          id: onlineMessage.id || Date.now().toString(),
          msg: onlineMessage.msg,
          date: onlineMessage.date,
          uploaded: true,
        };

        saveMessageToLocal(text);
        markMessageAsUploaded(localMessage.id);

        return {
          local: localMessage,
          online: true,
        };
      } catch (error) {
        console.error('Failed to save message online, saving locally:', error);
        const localMessage = saveMessageToLocal(text);
        return {
          local: localMessage,
          online: false,
        };
      }
    } else {
      const localMessage = saveMessageToLocal(text);
      return {
        local: localMessage,
        online: false,
      };
    }
  }

  static async savePDF(file: File): Promise<{ local: StoredPDF; online: boolean }> {
    const isOnline = await checkConnection();
    const localPDF = await savePDFToLocal(file);

    if (isOnline) {
      try {
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });

        const pdfData: PDFData = {
          name: file.name,
          size: file.size,
          data: dataUrl.split(',')[1],
          timestamp: new Date().toISOString(),
        };

        await uploadPDFToAPI(pdfData);
        markPDFAsUploaded(localPDF.id);

        return {
          local: { ...localPDF, uploaded: true },
          online: true,
        };
      } catch (error) {
        console.error('Failed to upload PDF online, keeping local:', error);
        return {
          local: localPDF,
          online: false,
        };
      }
    }

    return {
      local: localPDF,
      online: false,
    };
  }

  static async getMessages(): Promise<{
    messages: StoredMessage[];
    source: 'local' | 'api' | 'mixed';
  }> {
    const isOnline = await checkConnection();

    if (isOnline) {
      try {
        const apiMessages = await getMessagesFromAPI();

        const convertedMessages: StoredMessage[] = apiMessages.map((msg) => ({
          id: msg.id || Date.now().toString(),
          msg: msg.msg,
          date: msg.date,
          uploaded: true,
        }));

        const localMessages = getMessagesFromLocal();
        const pendingMessages = localMessages.filter((msg) => !msg.uploaded);

        const allMessages = [...convertedMessages, ...pendingMessages];

        return {
          messages: allMessages,
          source: pendingMessages.length > 0 ? 'mixed' : 'api',
        };
      } catch (error) {
        console.error('Failed to fetch from API, using local:', error);
        return {
          messages: getMessagesFromLocal(),
          source: 'local',
        };
      }
    } else {
      return {
        messages: getMessagesFromLocal(),
        source: 'local',
      };
    }
  }

  static async getPDFs(): Promise<{ pdfs: StoredPDF[]; source: 'local' | 'api' | 'mixed' }> {
    const isOnline = await checkConnection();

    if (isOnline) {
      try {
        const apiPDFs = await getPDFsFromAPI();

        const convertedPDFs: StoredPDF[] = apiPDFs.map((pdf) => ({
          id: pdf.id || Date.now().toString(),
          name: pdf.name,
          size: pdf.size,
          dataUrl: `data:application/pdf;base64,${pdf.data}`,
          timestamp: pdf.timestamp,
          uploaded: true,
        }));

        const localPDFs = getPDFsFromLocal();
        const pendingPDFs = localPDFs.filter((pdf) => !pdf.uploaded);

        const allPDFs = [...convertedPDFs, ...pendingPDFs];

        return {
          pdfs: allPDFs,
          source: pendingPDFs.length > 0 ? 'mixed' : 'api',
        };
      } catch (error) {
        console.error('Failed to fetch PDFs from API, using local:', error);
        return {
          pdfs: getPDFsFromLocal(),
          source: 'local',
        };
      }
    } else {
      return {
        pdfs: getPDFsFromLocal(),
        source: 'local',
      };
    }
  }

  static async syncPendingData(): Promise<{
    messagesSynced: number;
    pdfsSynced: number;
    errors: string[];
  }> {
    const isOnline = await checkConnection();
    if (!isOnline) {
      return { messagesSynced: 0, pdfsSynced: 0, errors: ['Not online'] };
    }

    const errors: string[] = [];
    let messagesSynced = 0;
    let pdfsSynced = 0;

    const localMessages = getMessagesFromLocal();
    const pendingMessages = localMessages.filter((msg) => !msg.uploaded);

    for (const msg of pendingMessages) {
      try {
        const messageData: MessageData = {
          msg: msg.msg,
          date: msg.date,
        };

        await saveMessageToAPI(messageData);
        markMessageAsUploaded(msg.id);
        messagesSynced++;
      } catch (error) {
        errors.push(`Message ${msg.id}: ${error}`);
      }
    }

    const localPDFs = getPDFsFromLocal();
    const pendingPDFs = localPDFs.filter((pdf) => !pdf.uploaded);

    for (const pdf of pendingPDFs) {
      try {
        const base64Data = pdf.dataUrl.split(',')[1];
        const pdfData: PDFData = {
          name: pdf.name,
          size: pdf.size,
          data: base64Data,
          timestamp: pdf.timestamp,
        };

        await uploadPDFToAPI(pdfData);
        markPDFAsUploaded(pdf.id);
        pdfsSynced++;
      } catch (error) {
        errors.push(`PDF ${pdf.name}: ${error}`);
      }
    }

    return { messagesSynced, pdfsSynced, errors };
  }

  static async mergeServerData(): Promise<void> {
    const isOnline = await checkConnection();

    if (isOnline) {
      try {
        const [apiMessages, apiPDFs] = await Promise.all([getMessagesFromAPI(), getPDFsFromAPI()]);

        const localMessages = getMessagesFromLocal();
        const localPDFs = getPDFsFromLocal();

        const serverMessageIds = new Set(apiMessages.map((m) => m.id));
        const serverPDFIds = new Set(apiPDFs.map((p) => p.id));

        const mergedMessages = [
          ...apiMessages.map((msg) => ({
            id: msg.id || '',
            msg: msg.msg,
            date: msg.date,
            uploaded: true,
          })),
          ...localMessages.filter((msg) => !msg.uploaded && !serverMessageIds.has(msg.id)),
        ];

        const mergedPDFs = [
          ...apiPDFs.map((pdf) => ({
            id: pdf.id || '',
            name: pdf.name,
            size: pdf.size,
            dataUrl: `data:application/pdf;base64,${pdf.data}`,
            timestamp: pdf.timestamp,
            uploaded: true,
          })),
          ...localPDFs.filter((pdf) => !pdf.uploaded && !serverPDFIds.has(pdf.id)),
        ];

        localStorage.setItem('messages', JSON.stringify(mergedMessages));
        localStorage.setItem('pdf_files', JSON.stringify(mergedPDFs));

        console.log('[DataManager] Data merged successfully');
      } catch (error) {
        console.error('[DataManager] Merge failed:', error);
      }
    }
  }
}
