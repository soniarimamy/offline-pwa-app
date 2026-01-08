import {
  Snackbar,
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
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  AlertTitle,
  Alert,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Delete as DeleteIcon,
  PictureAsPdf as PdfIcon,
  CloudDone as CloudDoneIcon,
  CloudOff as CloudOffIcon,
  Sync as SyncIcon,
  SyncProblem as SyncProblemIcon,
  Warning as WarningIcon,
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
  const [openConflictDialog, setOpenConflictDialog] = useState(false);
  const [conflictStrategy, setConflictStrategy] = useState<'server-wins' | 'client-wins'>(
    'server-wins'
  );
  const [showNotificationRequest, setShowNotificationRequest] = useState(false);

  const {
    online,
    lastChecked,
    pendingSync,
    pendingSyncCount,
    triggerManualSync,
    requestNotificationPermission,
  } = useOnlineStatus();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();

    const syncInterval = setInterval(async () => {
      if (online) {
        await syncPendingData();
      }
    }, 60000);

    const notificationCheck = async () => {
      if ('Notification' in window && Notification.permission === 'default') {
        setShowNotificationRequest(true);
      }
    };

    notificationCheck();

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
        showMessage('Data loaded from server', 'success');
      } else {
        showMessage('Offline mode - local data', 'warning');
      }
    } catch (error) {
      showMessage('Error loading data', 'error');
    }
  };

  const showMessage = (message: string, severity: 'success' | 'error' | 'info' | 'warning') => {
    setSnackbarMessage(message);
    setSnackbarSeverity(severity);
    setOpenSnackbar(true);
  };

  const handleSaveMessage = async () => {
    if (!text.trim()) {
      showMessage('Please enter a message', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      const result = await DataManager.saveMessage(text);

      setMessages((prev) => [result.local, ...prev]);
      setText('');

      if (result.online) {
        showMessage('Message saved online', 'success');
        showNotification('Message saved', 'Your message has been saved to the server');
      } else {
        showMessage('Message saved locally (offline)', 'info');
        showNotification('Message saved offline', 'Will sync when back online');
      }
    } catch (error) {
      showMessage('Error saving message', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        showMessage('Please select a PDF file', 'warning');
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        showMessage('File is too large (max 10MB)', 'warning');
        return;
      }

      setPdfFile(file);

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
      showMessage('Please select a PDF file', 'warning');
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

      if (result.online) {
        showMessage('PDF uploaded successfully', 'success');
        showNotification('PDF uploaded', 'Your PDF has been uploaded to the server');
      } else {
        showMessage('PDF saved locally (offline)', 'info');
        showNotification('PDF saved offline', 'Will sync when back online');
      }
    } catch (error) {
      showMessage('Error uploading PDF', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePDF = async (id: string) => {
    try {
      setPdfs((prev) => prev.filter((pdf) => pdf.id !== id));
      showMessage('PDF deleted', 'info');
    } catch (error) {
      showMessage('Error deleting', 'error');
    }
  };

  const syncPendingData = async () => {
    setIsSyncing(true);
    try {
      const result = await DataManager.syncPendingData();

      if (result.messagesSynced > 0 || result.pdfsSynced > 0) {
        const message = `Synced: ${result.messagesSynced} messages, ${result.pdfsSynced} PDFs`;
        showMessage(message, 'success');
        showNotification('Sync complete', message);
        await loadData();
      }

      if (result.errors.length > 0) {
        console.error('Sync errors:', result.errors);
        showMessage(`${result.errors.length} sync errors`, 'warning');
      }
    } catch (error) {
      showMessage('Error during sync', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleManualSync = () => {
    if (!online) {
      showMessage('No connection to sync', 'warning');
      return;
    }
    syncPendingData();
    triggerManualSync();
  };

  const showNotification = (title: string, body: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body: body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: 'app-notification',
      });
    }
  };

  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission();
    if (granted) {
      showMessage('Notifications enabled', 'success');
      setShowNotificationRequest(false);
    } else {
      showMessage('Notifications not enabled', 'warning');
    }
  };

  const handleMergeData = async () => {
    try {
      await DataManager.mergeServerData();
      await loadData();
      showMessage('Data merged with server', 'success');
    } catch (error) {
      showMessage('Error merging data', 'error');
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Paper elevation={2} sx={{ p: 3, mb: 3, bgcolor: online ? '#e8f5e9' : '#ffebee' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h5" gutterBottom>
              Offline-First PWA Application
            </Typography>
            <Box display="flex" alignItems="center" gap={1}>
              <Chip
                icon={online ? <CloudDoneIcon /> : <CloudOffIcon />}
                label={online ? 'Online' : 'Offline'}
                color={online ? 'success' : 'error'}
                variant="outlined"
              />
              {pendingSync && (
                <Tooltip title={`${pendingSyncCount} items pending sync`}>
                  <Chip
                    icon={<SyncProblemIcon />}
                    label="Pending sync"
                    color="warning"
                    variant="outlined"
                  />
                </Tooltip>
              )}
              {lastChecked && (
                <Typography variant="caption" color="text.secondary">
                  Last check: {new Date(lastChecked).toLocaleTimeString()}
                </Typography>
              )}
            </Box>
          </Box>

          <Box display="flex" gap={1}>
            <Button
              variant="contained"
              startIcon={<SyncIcon />}
              onClick={handleManualSync}
              disabled={isSyncing || !online}
            >
              {isSyncing ? <CircularProgress size={24} /> : 'Sync'}
            </Button>
          </Box>
        </Box>
      </Paper>

      {showNotificationRequest && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <AlertTitle>Enable notifications</AlertTitle>
          Get notified when sync completes
          <Button size="small" onClick={handleEnableNotifications} sx={{ ml: 2 }}>
            Enable
          </Button>
        </Alert>
      )}

      {pendingSync && online && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <AlertTitle>Pending synchronization</AlertTitle>
          {pendingSyncCount} items waiting to sync with server
          <Button size="small" onClick={handleManualSync} sx={{ ml: 2 }}>
            Sync now
          </Button>
        </Alert>
      )}

      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Add a message
        </Typography>
        <TextField
          label="Your message"
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
          {isSaving ? <CircularProgress size={24} /> : 'Save message'}
        </Button>
      </Paper>

      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Upload PDF
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
            Select PDF file
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
          {isSaving ? <CircularProgress size={24} /> : 'Upload PDF'}
        </Button>

        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          {online ? 'PDF will be uploaded to server' : 'PDF will be saved locally and synced later'}
        </Typography>
      </Paper>

      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">Messages ({messages.length})</Typography>
          <Button size="small" onClick={handleMergeData} disabled={!online}>
            Merge with server
          </Button>
        </Box>
        <List>
          {messages.map((message) => (
            <ListItem
              key={message.id}
              divider
              secondaryAction={
                <Box display="flex" alignItems="center" gap={1}>
                  <Chip
                    size="small"
                    label={message.uploaded ? 'Online' : 'Local'}
                    color={message.uploaded ? 'success' : 'default'}
                    variant="outlined"
                  />
                  {!message.uploaded && !online && <WarningIcon color="warning" fontSize="small" />}
                </Box>
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
              <ListItemText primary="No messages" secondary="Start by adding a message" />
            </ListItem>
          )}
        </List>
      </Paper>

      <Paper elevation={2} sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          PDF Files ({pdfs.length})
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
                    label={pdf.uploaded ? 'Online' : 'Local'}
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
                      {!pdf.uploaded && !online && ' (Offline)'}
                    </Typography>
                  </>
                }
              />
            </ListItem>
          ))}
          {pdfs.length === 0 && (
            <ListItem>
              <ListItemText primary="No PDFs" secondary="Upload your first PDF file" />
            </ListItem>
          )}
        </List>
      </Paper>

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

      <Dialog open={openConflictDialog} onClose={() => setOpenConflictDialog(false)}>
        <DialogTitle>Conflict Resolution</DialogTitle>
        <DialogContent>
          <DialogContentText>
            A conflict was detected between local and server data. Choose how to resolve it:
          </DialogContentText>
          <FormControl component="fieldset" sx={{ mt: 2 }}>
            <FormLabel component="legend">Resolution Strategy</FormLabel>
            <RadioGroup
              value={conflictStrategy}
              onChange={(e) => setConflictStrategy(e.target.value as 'server-wins' | 'client-wins')}
            >
              <FormControlLabel
                value="server-wins"
                control={<Radio />}
                label="Server wins (use server version)"
              />
              <FormControlLabel
                value="client-wins"
                control={<Radio />}
                label="Client wins (use local version)"
              />
            </RadioGroup>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenConflictDialog(false)}>Cancel</Button>
          <Button onClick={() => setOpenConflictDialog(false)} variant="contained">
            Apply
          </Button>
        </DialogActions>
      </Dialog>

      <Paper elevation={0} sx={{ p: 2, mt: 3, bgcolor: '#f5f5f5' }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          How it works:
        </Typography>
        <Typography variant="body2" color="text.secondary">
          • <strong>Online:</strong> Data saved directly to server
          <br />• <strong>Offline:</strong> Data stored locally in browser
          <br />• <strong>Background Sync:</strong> Local data automatically sent to server when
          back online
          <br />• <strong>Notifications:</strong> Get notified when sync completes
          <br />• Try disconnecting internet to test offline mode
        </Typography>
      </Paper>
    </Container>
  );
}

export default App;
