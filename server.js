require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const AIService = require('./ai-service');
const CVParser = require('./cv-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'jobs.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Multer para subir CVs (PDF y DOCX, max 5MB)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Solo PDF o DOCX'));
    }
});

// Inicializar servicio de IA
const aiService = new AIService(process.env.MINIMAX_API_KEY);

// GET - Obtener todas las ofertas
app.get('/api/jobs', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Error leyendo datos' });
    }
});

// POST - Agregar nueva oferta (o actualizar si ya existe por URL)
app.post('/api/jobs', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        
        const newJob = req.body;
        
        // Validar campos requeridos
        if (!newJob.title || !newJob.company) {
            return res.status(400).json({ error: 'title y company son requeridos' });
        }
        
        // Deduplicar por URL — si ya existe, actualizar en vez de crear duplicado
        if (newJob.url) {
            const existingIdx = data.jobs.findIndex(j => j.url === newJob.url);
            if (existingIdx !== -1) {
                // Merge: preservar id original y campos del usuario (applied, cvRequested, isIdeal, notes)
                const existing = data.jobs[existingIdx];
                const merged = {
                    ...existing,
                    ...newJob,
                    id: existing.id,  // no cambiar id
                    applied: newJob.applied !== undefined ? newJob.applied : existing.applied,
                    cvRequested: newJob.cvRequested !== undefined ? newJob.cvRequested : existing.cvRequested,
                    isIdeal: newJob.isIdeal !== undefined ? newJob.isIdeal : existing.isIdeal,
                    notes: newJob.notes || existing.notes
                };
                data.jobs[existingIdx] = merged;
                data.lastUpdated = new Date().toISOString().split('T')[0];
                data.lastChecked = new Date().toISOString();
                fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
                return res.status(200).json({ success: true, job: merged, updated: true });
            }
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

// PUT - Actualizar oferta por ID
app.put('/api/jobs/:id', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        const id = parseInt(req.params.id);
        
        const jobIdx = data.jobs.findIndex(job => job.id === id);
        if (jobIdx === -1) {
            return res.status(404).json({ error: 'Oferta no encontrada' });
        }
        
        const updates = req.body;
        // Merge: preservar campos existentes que no vienen en updates
        const current = data.jobs[jobIdx];
        data.jobs[jobIdx] = {
            ...current,
            ...updates,
            id: current.id  // no cambiar id
        };
        
        data.lastUpdated = new Date().toISOString().split('T')[0];
        data.lastChecked = new Date().toISOString();
        
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        
        res.json({ success: true, job: data.jobs[jobIdx] });
    } catch (err) {
        res.status(500).json({ error: 'Error actualizando: ' + err.message });
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

// ─────────────────────────────────────────────
// RUTAS DE IA (RF 2.x - Análisis de ofertas)
// ─────────────────────────────────────────────

// POST /api/jobs/:id/ai-analysis - Análisis completo de una oferta
app.post('/api/jobs/:id/ai-analysis', async (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        const id = parseInt(req.params.id);
        const job = data.jobs.find(j => j.id === id);

        if (!job) return res.status(404).json({ error: 'Oferta no encontrada' });

        let analysis = {};

        // RF 2.1 - Resumen ejecutivo
        try {
            analysis.summary = await aiService.summarizeJob(job.description || job.title + ' ' + job.company);
        } catch (err) {
            console.error('Error en summarizeJob:', err.message);
            analysis.summary = null;
        }

        // RF 2.2 - Auditoría de seniority
        try {
            analysis.seniority = await aiService.auditSeniority(job.description || '');
        } catch (err) {
            console.error('Error en auditSeniority:', err.message);
            analysis.seniority = null;
        }

        // RF 2.3 - Ficha técnica estructurada
        try {
            analysis.techSpec = await aiService.extractJobTechSpec(job);
        } catch (err) {
            console.error('Error en extractJobTechSpec:', err.message);
            analysis.techSpec = null;
        }

        // Si todos fallaron, retornar error
        if (!analysis.summary && !analysis.seniority && !analysis.techSpec) {
            return res.status(500).json({ error: 'No se pudo completar el análisis IA. Intenta más tarde.' });
        }

        // Guardar en la oferta
        job.aiAnalysis = analysis;
        job.aiAnalyzedAt = new Date().toISOString();
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

        res.json({ success: true, analysis });
    } catch (err) {
        res.status(500).json({ error: 'Error en análisis IA: ' + err.message });
    }
});

// ─────────────────────────────────────────────
// RUTAS DE USUARIO / CV (RF 4.x - Onboarding)
// ─────────────────────────────────────────────

// POST /api/users/register - Registro vía CV (RF 4.1, 4.2)
app.post('/api/users/register', upload.single('cv'), async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'email y password son requeridos' });
        }

        // Cargar usuarios existentes
        let users = { users: [] };
        if (fs.existsSync(USERS_FILE)) {
            users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        }

        // Verificar si el email ya existe
        if (users.users.find(u => u.email === email)) {
            return res.status(409).json({ error: 'El email ya está registrado' });
        }

        // RF 4.2 - Parsear CV con IA si se subió archivo
        let profile = {
            email,
            registeredAt: new Date().toISOString(),
            skills: [],
            experiencia: [],
            historialLaboral: []
        };

        if (req.file) {
            try {
                const cvText = await CVParser.extractText(req.file.buffer, req.file.mimetype);
                const parsed = await aiService.parseCV(cvText);

                // Normalizar campos del CV parseado
                profile = {
                    ...profile,
                    contacto: parsed.contacto || {},
                    skills: parsed.habilidades || [],
                    habilidades: parsed.habilidades || [],
                    experiencia: parsed.historialLaboral || [],
                    historialLaboral: parsed.historialLaboral || [],
                    resumen: parsed.resumen || {},
                    seniority: parsed.seniority || 'Mid',
                    cvProvided: true
                };
            } catch (cvErr) {
                console.error('Error parseando CV:', cvErr.message);
                // No fallar el registro, solo continuar sin CV parseado
                profile.cvProvided = false;
                profile.cvError = 'CV no pudo ser procesado';
            }
        }

        // Crear usuario
        const newUser = {
            id: users.users.length + 1,
            email,
            password, // En producción: hash!
            profile,
            createdAt: new Date().toISOString()
        };

        users.users.push(newUser);
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

        res.status(201).json({ success: true, user: { id: newUser.id, email: newUser.email, profile: newUser.profile } });
    } catch (err) {
        res.status(500).json({ error: 'Error en registro: ' + err.message });
    }
});

// POST /api/users/login - Login simple
app.post('/api/users/login', (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'email y password requeridos' });

        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        const user = users.users.find(u => u.email === email && u.password === password);

        if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

        res.json({ success: true, user: { id: user.id, email: user.email, profile: user.profile } });
    } catch (err) {
        res.status(500).json({ error: 'Error en login: ' + err.message });
    }
});

// GET /api/users/:id/profile - Obtener perfil
app.get('/api/users/:id/profile', (req, res) => {
    try {
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        const user = users.users.find(u => u.id === parseInt(req.params.id));
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json({ profile: user.profile });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────
// RUTAS DE CV HARVARD (RF 6.x)
// ─────────────────────────────────────────────

// GET /api/users/:id/cv-harvard - Descargar CV en formato Harvard
app.get('/api/users/:id/cv-harvard', (req, res) => {
    try {
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        const user = users.users.find(u => u.id === parseInt(req.params.id));

        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        const html = CVParser.generateHarvardHTML(user.profile);

        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Disposition', `attachment; filename="CV_${user.profile.name || user.email}.html"`);
        res.send(html);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/users/:id/cv-harvard - Generar y obtener HTML
app.post('/api/users/:id/cv-harvard', (req, res) => {
    try {
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        const user = users.users.find(u => u.id === parseInt(req.params.id));

        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        const html = CVParser.generateHarvardHTML(user.profile);
        res.json({ success: true, html });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────
// RUTAS DE MATCHING (RF 5.x)
// ─────────────────────────────────────────────

// GET /api/jobs/matched/:userId - Jobs ordenados por compatibilidad
app.get('/api/jobs/matched/:userId', async (req, res) => {
    try {
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        const user = users.users.find(u => u.id === parseInt(req.params.userId));

        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        // Normalizar perfil: parseCV retorna historialLaboral, calculateCompatibility espera experiencia
        const normalizedProfile = {
            ...user.profile,
            experiencia: user.profile.experiencia || user.profile.historialLaboral || [],
            habilidades: user.profile.habilidades || []
        };

        // Si el perfil está muy incompleto, retornar error claro
        if (!normalizedProfile.habilidades.length && !normalizedProfile.experiencia.length) {
            return res.status(400).json({
                error: 'Perfil incompleto',
                message: 'Sube tu CV para ver ofertas compatibles'
            });
        }

        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

        // Calcular compatibilidad para cada job
        const jobsWithMatch = await Promise.all(
            data.jobs.map(async job => {
                try {
                    const match = await aiService.calculateCompatibility(normalizedProfile, job);
                    return { ...job, compatibility: match };
                } catch (err) {
                    console.error(`Error calculando compatibilidad para job ${job.id}: ${err.message}`);
                    return { ...job, compatibility: null };
                }
            })
        );

        // Ordenar por compatibilidad (mayor primero)
        jobsWithMatch.sort((a, b) => {
            if (!a.compatibility) return 1;
            if (!b.compatibility) return -1;
            const scoreA = a.compatibility.porcentaje || a.compatibility.score || 0;
            const scoreB = b.compatibility.porcentaje || b.compatibility.score || 0;
            return scoreB - scoreA;
        });

        res.json({ jobs: jobsWithMatch });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────
// RUTAS DE SCRAPING (RF 1.x)
// ─────────────────────────────────────────────

// POST /api/scrape - Ejecutar scrapers
app.post('/api/scrape', async (req, res) => {
    try {
        const { source } = req.body; // 'linkedin', 'tecoloco', 'computrabajo', 'buscojobs', o 'all'
        const { scrapeAll, scrapeOne } = require('./scrapers/index');

        // scrapeAll retorna array de {success, name, count} o {success, name, error}
        // scrapeOne retorna array de jobs directamente
        const scrapeResults = source && source !== 'all'
            ? await scrapeOne(source)
            : await scrapeAll();

        // Si es array de jobs (scrapeOne) usar directo, si es summary (scrapeAll) extraer jobs
        let jobs = [];
        if (scrapeResults.length > 0 && scrapeResults[0] && scrapeResults[0].url) {
            // Es array de jobs (de scrapeOne)
            jobs = scrapeResults;
        } else if (scrapeResults.length > 0 && scrapeResults[0] && (scrapeResults[0].count !== undefined || scrapeResults[0].error)) {
            // Es array de summaries (de scrapeAll) - no hay jobs directos, solo resumen
            // El scraping real se hace vía scrapeSome o individual
            jobs = [];
        }

        // Guardar jobs nuevos en la DB
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        let added = 0;

        for (const job of jobs) {
            const existing = data.jobs.find(j => j.url === job.url);
            if (!existing) {
                job.id = Math.max(...data.jobs.map(j => j.id), 0) + 1;
                data.jobs.push(job);
                added++;
            }
        }

        data.lastChecked = new Date().toISOString();
        data.lastUpdated = new Date().toISOString().split('T')[0];
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

        res.json({ success: true, total: jobs.length, added, source: source || 'all' });
    } catch (err) {
        res.status(500).json({ error: 'Error en scraping: ' + err.message });
    }
});

// ─────────────────────────────────────────────
// RUTAS DE EXTRACCIÓN DE CONTACTOS (RF 1.3)
// ─────────────────────────────────────────────

// POST /api/jobs/:id/extract-contacts - Extraer emails de reclutador de la descripción
app.post('/api/jobs/:id/extract-contacts', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        const job = data.jobs.find(j => j.id === parseInt(req.params.id));

        if (!job) return res.status(404).json({ error: 'Oferta no encontrada' });

        const description = job.description || '';
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const emails = [...new Set(description.match(emailRegex) || [])];

        // Buscar patrones de envío de CV
        const cvSendPattern = /(?:env(?:í|i)a(?:r)?|send|submi(?:t|r)).{0,50}?(?:cv|currículum|curriculum).{0,100}?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
        const cvEmails = [];
        let match;
        while ((match = cvSendPattern.exec(description)) !== null) {
            cvEmails.push(match[1]);
        }

        const contacts = {
            emails,
            cvSendEmails: [...new Set(cvEmails)],
            source: job.url
        };

        // Guardar en el job
        job.contacts = contacts;
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

        res.json({ success: true, contacts });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────
// RUTAS DE DEDUPLICACIÓN (RF 1.4)
// ─────────────────────────────────────────────

// POST /api/jobs/deduplicate - Unificar duplicados por empresa+title
app.post('/api/jobs/deduplicate', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        const originalCount = data.jobs.length;

        const seen = new Map();
        const unique = [];

        for (const job of data.jobs) {
            const key = (job.company || '').toLowerCase() + '|' + (job.title || '').toLowerCase();
            if (!seen.has(key)) {
                seen.set(key, job);
                unique.push(job);
            } else {
                // Merge: agregar url adicional al existente
                const existing = seen.get(key);
                if (job.url && !existing.sources?.includes(job.url)) {
                    existing.sources = existing.sources || [existing.url];
                    existing.sources.push(job.url);
                }
            }
        }

        data.jobs = unique;
        data.lastUpdated = new Date().toISOString().split('T')[0];
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

        res.json({ success: true, original: originalCount, unique: unique.length, removed: originalCount - unique.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Catch-all para servir index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Job Tracker corriendo en http://localhost:${PORT}`);
});
