import { Snackbar, Alert } from '@mui/material';
// import { useOnlineStatus } from './services/useOnlineStatus';
import { useEffect, useState, type SetStateAction } from 'react';
import { saveMessage, getMessages } from './services/localStorage';
import { Button, TextField, Typography, Container, List, ListItem } from '@mui/material';

function App() {
  const [text, setText] = useState('');
  // const online = useOnlineStatus();
  const [open, setOpen] = useState(false);
  const [offline, setOffline] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    setOpen(true);
    setMessages(getMessages());
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'NETWORK_STATUS') {
          setOffline(event.data.status === 'offline');
          setOpen(true);
        }
      });
    }
  }, []);

  const handleSave = () => {
    saveMessage(text);
    setMessages(getMessages());
    setText('');
  };

  return (
    <Container sx={{ mt: 4 }}>
     <Snackbar
        open={open}
        autoHideDuration={3000}
        onClose={() => setOpen(false)}
      >
        <Alert severity={offline ? 'warning' : 'success'}>
          {offline
            ? 'Vous êtes en mode offline'
            : 'Vous êtes revenu en mode online'}
        </Alert>
      </Snackbar>
      <Typography variant="h4">Offline First</Typography>

      <TextField
        label="Message"
        fullWidth
        value={text}
        onChange={(e: { target: { value: SetStateAction<string> } }) => setText(e.target.value)}
        sx={{ my: 2 }}
      />

      <Button variant="contained" onClick={handleSave}>
        Sauvegarder localement
      </Button>

      <List>
        {messages.map((m, i) => (
          <ListItem key={i}>{m.msg}</ListItem>
        ))}
      </List>
    </Container>
  );
}

export default App;
