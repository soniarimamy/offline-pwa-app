import { Button, TextField, Typography, Container, List, ListItem } from '@mui/material';
import { useEffect, useState, type SetStateAction } from 'react';
import { saveMessage, getMessages } from './services/localStorage';

function App() {
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    setMessages(getMessages());
  }, []);

  const handleSave = () => {
    saveMessage(text);
    setMessages(getMessages());
    setText('');
  };

  return (
    <Container sx={{ mt: 4 }}>
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
