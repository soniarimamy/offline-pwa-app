import {
  Snackbar,
  Alert,
  Button,
  TextField,
  Typography,
  Container,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Paper,
  Box,
  Chip,
  CircularProgress,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Delete as DeleteIcon,
  PictureAsPdf as PdfIcon,
  CloudDone as CloudDoneIcon,
  CloudOff as CloudOffIcon,
  Sync as SyncIcon,
} from '@mui/icons-material';
import { useEffect, useState, useRef } from 'react';
import { DataManager } from './services/dataManager';
import { useOnlineStatus } from './services/useOnlineStatus';
import type { StoredMessage, StoredPDF } from './services/fileStorage';

function App() {
  const [text, setText] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPreview, setPdfPreview] = useState<StoredPDF | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [pdfs, setPdfs] = useState<StoredPDF[]>([]);
  const [openSnackbar, setOpenSnackbar] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<
    'success' | 'error' | 'info' | 'warning'
  >('info');
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const { online, lastChecked } = useOnlineStatus();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();

    // Vérifier périodiquement la connexion et synchroniser
    const syncInterval = setInterval(async () => {
      if (online) {
        await syncPendingData();
      }
    }, 60000); // Toutes les minutes

    return () => clearInterval(syncInterval);
  }, [online]);

  const loadData = async () => {
    try {
      const [messagesResult, pdfsResult] = await Promise.all([
        DataManager.getMessages(),
        DataManager.getPDFs(),
      ]);

      setMessages(messagesResult.messages);
      setPdfs(pdfsResult.pdfs);

      if (messagesResult.source === 'api' || pdfsResult.source === 'api') {
        showMessage('Données chargées depuis le serveur', 'success');
      } else {
        showMessage('Mode hors ligne - données locales', 'warning');
      }
    } catch (error) {
      showMessage('Erreur lors du chargement des données', 'error');
    }
  };

  const showMessage = (message: string, severity: 'success' | 'error' | 'info' | 'warning') => {
    setSnackbarMessage(message);
    setSnackbarSeverity(severity);
    setOpenSnackbar(true);
  };

  const handleSaveMessage = async () => {
    if (!text.trim()) {
      showMessage('Veuillez entrer un message', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      const result = await DataManager.saveMessage(text);

      setMessages((prev) => [result.local, ...prev]);
      setText('');

      showMessage(
        result.online
          ? 'Message sauvegardé en ligne'
          : 'Message sauvegardé localement (hors ligne)',
        result.online ? 'success' : 'info'
      );
    } catch (error) {
      showMessage('Erreur lors de la sauvegarde du message', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        showMessage('Veuillez sélectionner un fichier PDF', 'warning');
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        // 10MB limit
        showMessage('Le fichier est trop volumineux (max 10MB)', 'warning');
        return;
      }

      setPdfFile(file);

      // Créer un aperçu
      const reader = new FileReader();
      reader.onload = (e) => {
        setPdfPreview({
          id: 'preview',
          name: file.name,
          size: file.size,
          dataUrl: e.target?.result as string,
          timestamp: new Date().toISOString(),
          uploaded: false,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadPDF = async () => {
    if (!pdfFile) {
      showMessage('Veuillez sélectionner un fichier PDF', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      const result = await DataManager.savePDF(pdfFile);

      setPdfs((prev) => [result.local, ...prev]);
      setPdfFile(null);
      setPdfPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      showMessage(
        result.online ? 'PDF téléversé avec succès' : 'PDF sauvegardé localement (hors ligne)',
        result.online ? 'success' : 'info'
      );
    } catch (error) {
      showMessage('Erreur lors du téléversement du PDF', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePDF = async (id: string) => {
    try {
      // Dans un cas réel, vous devriez aussi supprimer de l'API
      setPdfs((prev) => prev.filter((pdf) => pdf.id !== id));
      showMessage('PDF supprimé', 'info');
    } catch (error) {
      showMessage('Erreur lors de la suppression', 'error');
    }
  };

  const syncPendingData = async () => {
    setIsSyncing(true);
    try {
      const result = await DataManager.syncPendingData();

      if (result.messagesSynced > 0 || result.pdfsSynced > 0) {
        showMessage(
          `Synchronisé: ${result.messagesSynced} messages, ${result.pdfsSynced} PDFs`,
          'success'
        );
        // Recharger les données
        await loadData();
      }

      if (result.errors.length > 0) {
        console.error('Erreurs de synchronisation:', result.errors);
      }
    } catch (error) {
      showMessage('Erreur lors de la synchronisation', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleManualSync = () => {
    if (!online) {
      showMessage('Pas de connexion pour synchroniser', 'warning');
      return;
    }
    syncPendingData();
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      {/* En-tête avec statut de connexion */}
      <Paper elevation={2} sx={{ p: 3, mb: 3, bgcolor: online ? '#e8f5e9' : '#ffebee' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h5" gutterBottom>
              Offline-First PWA Application
            </Typography>
            <Box display="flex" alignItems="center" gap={1}>
              <Chip
                icon={online ? <CloudDoneIcon /> : <CloudOffIcon />}
                label={online ? 'En ligne' : 'Hors ligne'}
                color={online ? 'success' : 'error'}
                variant="outlined"
              />
              {lastChecked && (
                <Typography variant="caption" color="text.secondary">
                  Dernière vérification: {new Date(lastChecked).toLocaleTimeString()}
                </Typography>
              )}
            </Box>
          </Box>

          <Button
            variant="contained"
            startIcon={<SyncIcon />}
            onClick={handleManualSync}
            disabled={isSyncing || !online}
          >
            {isSyncing ? <CircularProgress size={24} /> : 'Synchroniser'}
          </Button>
        </Box>
      </Paper>

      {/* Formulaire de message */}
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Ajouter un message
        </Typography>
        <TextField
          label="Votre message"
          fullWidth
          multiline
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          sx={{ mb: 2 }}
        />
        <Button
          variant="contained"
          onClick={handleSaveMessage}
          disabled={isSaving || !text.trim()}
          fullWidth
        >
          {isSaving ? <CircularProgress size={24} /> : 'Sauvegarder le message'}
        </Button>
      </Paper>

      {/* Upload de PDF */}
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Téléverser un PDF
        </Typography>

        <input
          type="file"
          accept=".pdf"
          onChange={handleFileSelect}
          ref={fileInputRef}
          style={{ display: 'none' }}
          id="pdf-upload"
        />

        <label htmlFor="pdf-upload">
          <Button
            variant="outlined"
            component="span"
            startIcon={<UploadIcon />}
            fullWidth
            sx={{ mb: 2 }}
          >
            Sélectionner un fichier PDF
          </Button>
        </label>

        {pdfPreview && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: '#f5f5f5' }}>
            <Box display="flex" alignItems="center" gap={2}>
              <PdfIcon color="error" />
              <Box flex={1}>
                <Typography variant="subtitle2">{pdfPreview.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {(pdfPreview.size / 1024).toFixed(2)} KB
                </Typography>
              </Box>
              <IconButton
                size="small"
                onClick={() => {
                  setPdfFile(null);
                  setPdfPreview(null);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
              >
                <DeleteIcon />
              </IconButton>
            </Box>
          </Paper>
        )}

        <Button
          variant="contained"
          startIcon={<UploadIcon />}
          onClick={handleUploadPDF}
          disabled={isSaving || !pdfFile}
          fullWidth
          color="secondary"
        >
          {isSaving ? <CircularProgress size={24} /> : 'Téléverser le PDF'}
        </Button>

        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          {online
            ? 'Le PDF sera téléversé sur le serveur'
            : 'Le PDF sera sauvegardé localement et synchronisé plus tard'}
        </Typography>
      </Paper>

      {/* Liste des messages */}
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Messages ({messages.length})
        </Typography>
        <List>
          {messages.map((message) => (
            <ListItem
              key={message.id}
              divider
              secondaryAction={
                <Chip
                  size="small"
                  label={message.uploaded ? 'En ligne' : 'Local'}
                  color={message.uploaded ? 'success' : 'default'}
                  variant="outlined"
                />
              }
            >
              <ListItemText
                primary={message.msg}
                secondary={new Date(message.date).toLocaleString()}
              />
            </ListItem>
          ))}
          {messages.length === 0 && (
            <ListItem>
              <ListItemText primary="Aucun message" secondary="Commencez par ajouter un message" />
            </ListItem>
          )}
        </List>
      </Paper>

      {/* Liste des PDFs */}
      <Paper elevation={2} sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Fichiers PDF ({pdfs.length})
        </Typography>
        <List>
          {pdfs.map((pdf) => (
            <ListItem
              key={pdf.id}
              divider
              secondaryAction={
                <Box display="flex" alignItems="center" gap={1}>
                  <Chip
                    size="small"
                    label={pdf.uploaded ? 'En ligne' : 'Local'}
                    color={pdf.uploaded ? 'success' : 'default'}
                    variant="outlined"
                  />
                  <IconButton size="small" onClick={() => handleDeletePDF(pdf.id)}>
                    <DeleteIcon />
                  </IconButton>
                </Box>
              }
            >
              <ListItemIcon>
                <PdfIcon color="error" />
              </ListItemIcon>
              <ListItemText
                primary={pdf.name}
                secondary={
                  <>
                    {new Date(pdf.timestamp).toLocaleString()}
                    <br />
                    <Typography component="span" variant="caption">
                      {(pdf.size / 1024).toFixed(2)} KB
                    </Typography>
                  </>
                }
              />
            </ListItem>
          ))}
          {pdfs.length === 0 && (
            <ListItem>
              <ListItemText primary="Aucun PDF" secondary="Téléversez votre premier fichier PDF" />
            </ListItem>
          )}
        </List>
      </Paper>

      {/* Snackbar pour les notifications */}
      <Snackbar
        open={openSnackbar}
        autoHideDuration={6000}
        onClose={() => setOpenSnackbar(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setOpenSnackbar(false)}
          severity={snackbarSeverity}
          sx={{ width: '100%' }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>

      {/* Instructions */}
      <Paper elevation={0} sx={{ p: 2, mt: 3, bgcolor: '#f5f5f5' }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Comment ça marche:
        </Typography>
        <Typography variant="body2" color="text.secondary">
          • <strong>En ligne:</strong> Les données sont sauvegardées directement sur le serveur
          <br />• <strong>Hors ligne:</strong> Les données sont stockées localement dans le
          navigateur
          <br />• <strong>Synchronisation:</strong> Les données locales sont automatiquement
          envoyées au serveur lors du retour en ligne
          <br />• Essayez de couper votre connexion internet pour tester le mode hors ligne
        </Typography>
      </Paper>
    </Container>
  );
}

export default App;
