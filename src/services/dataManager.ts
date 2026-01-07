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
  // Enregistrer un message selon l'état de connexion
  static async saveMessage(text: string): Promise<{ local: StoredMessage; online: boolean }> {
    const isOnline = await checkConnection();

    if (isOnline) {
      // Sauvegarder en ligne
      const messageData: MessageData = {
        msg: text,
        date: new Date().toISOString(),
      };

      const onlineMessage = await saveMessageToAPI(messageData);

      return {
        local: {
          id: onlineMessage.id || Date.now().toString(),
          msg: onlineMessage.msg,
          date: onlineMessage.date,
          uploaded: true,
        },
        online: true,
      };
    } else {
      // Sauvegarder localement
      const localMessage = saveMessageToLocal(text);

      return {
        local: localMessage,
        online: false,
      };
    }
  }

  // Enregistrer un PDF selon l'état de connexion
  static async savePDF(file: File): Promise<{ local: StoredPDF; online: boolean }> {
    const isOnline = await checkConnection();
    const localPDF = await savePDFToLocal(file);

    if (isOnline) {
      try {
        // Convertir File en base64
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });

        const pdfData: PDFData = {
          name: file.name,
          size: file.size,
          data: dataUrl.split(',')[1], // Retirer le préfixe data:application/pdf;base64,
          timestamp: new Date().toISOString(),
        };

        await uploadPDFToAPI(pdfData);
        markPDFAsUploaded(localPDF.id);

        return {
          local: { ...localPDF, uploaded: true },
          online: true,
        };
      } catch (error) {
        console.error('Failed to upload PDF online, keeping local only:', error);
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

  // Récupérer les messages selon l'état de connexion
  static async getMessages(): Promise<{
    messages: StoredMessage[];
    source: 'local' | 'api' | 'mixed';
  }> {
    const isOnline = await checkConnection();

    if (isOnline) {
      try {
        const apiMessages = await getMessagesFromAPI();

        // Convertir les messages API au format local
        const convertedMessages: StoredMessage[] = apiMessages.map((msg) => ({
          id: msg.id || Date.now().toString(),
          msg: msg.msg,
          date: msg.date,
          uploaded: true,
        }));

        return {
          messages: convertedMessages,
          source: 'api',
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

  // Récupérer les PDFs selon l'état de connexion
  static async getPDFs(): Promise<{ pdfs: StoredPDF[]; source: 'local' | 'api' | 'mixed' }> {
    const isOnline = await checkConnection();

    if (isOnline) {
      try {
        const apiPDFs = await getPDFsFromAPI();

        // Convertir les PDFs API au format local
        const convertedPDFs: StoredPDF[] = apiPDFs.map((pdf) => ({
          id: pdf.id || Date.now().toString(),
          name: pdf.name,
          size: pdf.size,
          dataUrl: `data:application/pdf;base64,${pdf.data}`,
          timestamp: pdf.timestamp,
          uploaded: true,
        }));

        return {
          pdfs: convertedPDFs,
          source: 'api',
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

  // Synchroniser les données locales non uploadées
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

    // Synchroniser les messages non uploadés
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

    // Synchroniser les PDFs non uploadés
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
}
