/**
 * LinkedIn Job Scraper - Versión mejorada para el sistema centralizado
 * Usa solo fetch de Node.js (sin Playwright) con retry y detección de bloqueos
 */

const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const API_URL = process.env.API_URL || 'http://localhost:3000/api/jobs';
const LOG_FILE = '/tmp/job-tracker/logs/linkedin-scraper.log';
const MAX_RETRIES = 3;
const BASE_DELAY = 1000;

// Retardo aleatorio para evitar detección
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms + Math.random() * 500));
}

// Retry con exponential backoff
async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, options);
            
            // Detectar bloqueo
            if (res.status === 403 || res.status === 429) {
                const body = await res.text();
                if (attempt < retries) {
                    const waitTime = BASE_DELAY * Math.pow(2, attempt);
                    console.log(`[LinkedIn] Bloqueo ${res.status} detectado. Reintentando en ${waitTime}ms...`);
                    await delay(waitTime);
                    continue;
                }
                throw new Error(`Bloqueo detectado (${res.status}): ${body.substring(0, 200)}`);
            }
            
            return res;
        } catch (err) {
            if (attempt === retries) throw err;
            const waitTime = BASE_DELAY * Math.pow(2, attempt);
            console.log(`[LinkedIn] Error: ${err.message}. Reintentando en ${waitTime}ms...`);
            await delay(waitTime);
        }
    }
}

/**
 * Realiza scraping de LinkedIn Jobs usando la API de búsqueda
 * LinkedIn tiene protección anti-scraping fuerte, así que usamos un enfoque
 * que simula peticiones móviles para evitar bloqueos
 */
async function scrapeLinkedIn(searchQuery = 'flutter', location = 'Latin America') {
    console.log(`[LinkedIn] Iniciando scraping para: "${searchQuery}" en "${location}"`);
    
    const jobs = [];
    
    // LinkedIn tiene protección muy fuerte, intentamos con la API semi-pública
    // Primero intentamos obtener tokens de sesión válidos
    const searchUrl = `https://www.linkedin.com/jobs-guest/api/typeaheadHit?q=${encodeURIComponent(searchQuery)}&types=jobs&query=${encodeURIComponent(searchQuery)}`;
    
    try {
        // Intentar acceder a la API de búsqueda de LinkedIn
        const response = await fetchWithRetry(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
                'Accept': 'application/json',
                'Accept-Language': 'es-ES,es;q=0.9',
                'Referer': 'https://www.linkedin.com/jobs/search/?keywords=' + encodeURIComponent(searchQuery)
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log(`[LinkedIn] Respuesta recibida, procesando resultados...`);
            
            // La API de LinkedIn devuelve resultados en formato específico
            if (data.elements) {
                for (const element of data.elements.slice(0, 30)) {
                    jobs.push({
                        title: element.title || element.jobPostingTitle,
                        company: element.companyName || element.employerName,
                        location: element.location || element.formattedLocation,
                        salary: element.salary ?? null,
                        url: element.jobPostingRequestUrl || `https://www.linkedin.com/jobs/view/${element.jobPostingId}`,
                        description: element.description?.snippet || element.formattedDescription || '',
                        postedDate: element.postedDate?.date || element.createdAt
                    });
                }
            }
        }
    } catch (err) {
        console.log(`[LinkedIn] Error en API principal: ${err.message}`);
    }
    
    // Si falló la API, intentamos un approach alternativo usando la búsqueda pública
    if (jobs.length === 0) {
        console.log('[LinkedIn] Intentando método alternativo...');
        jobs.push(...await tryAlternativeMethod(searchQuery));
    }
    
    console.log(`[LinkedIn] Scraping completado: ${jobs.length} ofertas encontradas`);
    return jobs;
}

/**
 * Método alternativo para cuando la API principal falla
 * Usa sitios proxy o APIs alternativas
 */
async function tryAlternativeMethod(searchQuery) {
    const jobs = [];
    
    // Intentar con una API proxy de scraping social
    const proxyUrl = `https://api.jooble.org/api/${encodeURIComponent(searchQuery)}?sid=job-tracker`;
    
    try {
        const response = await fetch(proxyUrl, {
            headers: {
                'User-Agent': 'Job-Tracker/2.0'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.jobs) {
                for (const job of data.jobs.slice(0, 20)) {
                    jobs.push({
                        title: job.title,
                        company: job.company,
                        location: job.location,
                        salary: job.salary || null,
                        url: job.link,
                        description: job.snippet || '',
                        postedDate: job.updated || new Date().toISOString()
                    });
                }
            }
        }
    } catch (err) {
        console.log(`[LinkedIn] Método alternativo también falló: ${err.message}`);
    }
    
    return jobs;
}

// Enviar trabajos al servidor
async function postJobs(jobs, source = 'LinkedIn') {
    let newCount = 0;
    let duplicateCount = 0;
    
    for (const job of jobs) {
        try {
            const jobData = {
                title: job.title,
                company: job.company,
                location: job.location || 'LatAm',
                salary: job.salary,
                url: job.url,
                description: job.description || '',
                postedDate: job.postedDate ? new Date(job.postedDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                source: source,
                modality: detectModality(job.location, job.description),
                stack: detectStack(job.title + ' ' + job.description)
            };
            
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(jobData)
            });
            
            if (response.status === 409) {
                duplicateCount++;
            } else if (response.ok) {
                newCount++;
                console.log(`[LinkedIn] Nuevo job: "${job.title}" en ${job.company}`);
            }
        } catch (err) {
            console.log(`[LinkedIn] Error enviando job: ${err.message}`);
        }
        
        await delay(500); // Pausa entre requests para no saturar
    }
    
    console.log(`[LinkedIn] Resumen: ${newCount} nuevos, ${duplicateCount} duplicados`);
    return { newCount, duplicateCount };
}

function detectModality(location, description) {
    const text = ((location || '') + ' ' + (description || '')).toLowerCase();
    if (text.includes('remoto') || text.includes('remote') || text.includes('100% remote')) return 'Remoto';
    if (text.includes('híbrido') || text.includes('hybrid') || text.includes('presencial')) return 'Híbrido';
    return 'Presencial';
}

function detectStack(text) {
    const t = (text || '').toLowerCase();
    const stacks = [];
    
    const stackMap = {
        'flutter': ['Flutter'],
        'react native': ['React Native'],
        'swift': ['Swift', 'iOS'],
        'kotlin': ['Kotlin', 'Android'],
        'react': ['React', 'React.js'],
        'angular': ['Angular'],
        'vue': ['Vue.js'],
        'node': ['Node.js'],
        'python': ['Python'],
        'java': ['Java'],
        'go': ['Go'],
        'rust': ['Rust']
    };
    
    for (const [key, value] of Object.entries(stackMap)) {
        if (t.includes(key)) stacks.push(...value);
    }
    
    return stacks.length > 0 ? [...new Set(stacks)] : ['General'];
}

// Función principal
async function main() {
    console.log('[LinkedIn] === Scraper iniciado ===');
    
    const searchQuery = process.argv[2] || 'flutter developer';
    
    try {
        const jobs = await scrapeLinkedIn(searchQuery);
        if (jobs.length > 0) {
            await postJobs(jobs, 'LinkedIn');
        }
    } catch (err) {
        console.error('[LinkedIn] Error fatal:', err.message);
    }
    
    console.log('[LinkedIn] === Scraper finalizado ===');
}

module.exports = { scrapeLinkedIn };

if (require.main === module) {
    main();
}