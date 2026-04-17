const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data', 'jobs.json');

app.use(cors());
app.use(express.json());

// Servir archivos estáticos del frontend
app.use(express.static(__dirname));

// GET - Obtener todas las ofertas
app.get('/api/jobs', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Error leyendo datos' });
    }
});

// POST - Agregar nueva oferta
app.post('/api/jobs', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        
        const newJob = req.body;
        
        // Validar campos requeridos
        if (!newJob.title || !newJob.company) {
            return res.status(400).json({ error: 'title y company son requeridos' });
        }
        
        // Generar ID único
        const maxId = data.jobs.reduce((max, job) => Math.max(max, job.id), 0);
        newJob.id = maxId + 1;
        
        // Valores por defecto
        newJob.applied = newJob.applied || false;
        newJob.cvRequested = newJob.cvRequested || false;
        newJob.isIdeal = newJob.isIdeal || false;
        
        data.jobs.push(newJob);
        data.lastUpdated = new Date().toISOString().split('T')[0];
        data.lastChecked = new Date().toISOString();
        
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        
        res.status(201).json({ success: true, job: newJob });
    } catch (err) {
        res.status(500).json({ error: 'Error guardando: ' + err.message });
    }
});

// DELETE - Eliminar oferta por ID
app.delete('/api/jobs/:id', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        const id = parseInt(req.params.id);
        
        const initialLength = data.jobs.length;
        data.jobs = data.jobs.filter(job => job.id !== id);
        
        if (data.jobs.length === initialLength) {
            return res.status(404).json({ error: 'Oferta no encontrada' });
        }
        
        data.lastUpdated = new Date().toISOString().split('T')[0];
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Error eliminando' });
    }
});

// Catch-all para servir index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Job Tracker corriendo en http://localhost:${PORT}`);
});
