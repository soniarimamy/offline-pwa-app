const KEY = 'messages';

export const saveMessage = (msg: string) => {
  const data = JSON.parse(localStorage.getItem(KEY) || '[]');
  data.push({ msg, date: new Date().toISOString() });
  localStorage.setItem(KEY, JSON.stringify(data));
};

export const getMessages = () => {
  return JSON.parse(localStorage.getItem(KEY) || '[]');
};
