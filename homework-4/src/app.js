const express = require('express');
const path = require('path');
const notesRouter = require('./routes/notes');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/notes', notesRouter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = app;
