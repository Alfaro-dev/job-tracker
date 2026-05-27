/**
 * Tecoloco Job Scraper - Bolsa de trabajo para El Salvador y Centroamérica
 * Usa solo fetch de Node.js con retry y detección de bloqueos
 */

const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const API_URL = process.env.API_URL || 'http://localhost:3000/api/jobs';
const BASE_URL = 'https://www.tecoloco.com';
const MAX_RETRIES = 3;
const BASE_DELAY = 1500;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms + Math.random() * 500));
}

async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, options);
            
            if (res.status === 403 || res.status === 429) {
                const body = await res.text();
                if (attempt < retries) {
                    const waitTime = BASE_DELAY * Math.pow(2, attempt);
                    console.log(`[Tecoloco] Bloqueo ${res.status}. Reintentando en ${waitTime}ms...`);
                    await delay(waitTime);
                    continue;
                }
                throw new Error(`Bloqueo detectado (${res.status})`);
            }
            
            return res;
        } catch (err) {
            if (attempt === retries) throw err;
            const waitTime = BASE_DELAY * Math.pow(2, attempt);
            console.log(`[Tecoloco] Error: ${err.message}. Reintentando en ${waitTime}ms...`);
            await delay(waitTime);
        }
    }
}

/**
 * Realiza scraping de Tecoloco
 * Busca ofertas en la categoría de tecnología y desarrollo
 */
async function scrapeTecoloco(searchQuery = 'desarrollador') {
    console.log(`[Tecoloco] Iniciando scraping para: "${searchQuery}"`);
    
    const jobs = [];
    
    // Tecoloco tiene estructura típica de.job board.尝试不同的端点
    const searchUrl = `${BASE_URL}/api/jobs/search?q=${encodeURIComponent(searchQuery)}&country=SV`;
    
    try {
        const response = await fetchWithRetry(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'es-ES,es;q=0.9',
                'Origin': BASE_URL,
                'Referer': `${BASE_URL}/`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (Array.isArray(data)) {
                for (const job of data.slice(0, 30)) {
                    jobs.push(parseJob(job));
                }
            } else if (data.jobs) {
                for (const job of data.jobs.slice(0, 30)) {
                    jobs.push(parseJob(job));
                }
            }
        }
    } catch (err) {
        console.log(`[Tecoloco] Error en API principal: ${err.message}`);
    }
    
    // Si no hay resultados, intentar método alternativo
    if (jobs.length === 0) {
        jobs.push(...await tryAlternative(searchQuery));
    }
    
    console.log(`[Tecoloco] Scraping completado: ${jobs.length} ofertas`);
    return jobs;
}

function parseJob(job) {
    return {
        title: job.title || job.name || job.position,
        company: job.company?.name || job.company || job.employer,
        location: job.location?.city ? `${job.location.city}, ${job.location.country}` : (job.location || 'El Salvador'),
        salary: job.salary?.min ? `${job.salary.min}-${job.salary.max}` : (job.salary || null),
        url: job.url || job.link || `${BASE_URL}/job/${job.id}`,
        description: job.description || job.summary || '',
        postedDate: job.publishedDate || job.created_at || job.date
    };
}

async function tryAlternative(searchQuery) {
    const jobs = [];
    
    // Tecoloco permite búsqueda pública sin API
    const searchPage = `${BASE_URL}/buscar-trabajo?q=${encodeURIComponent(searchQuery)}&country=SV`;
    
    try {
        const response = await fetchWithRetry(searchPage, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'es-ES,es;q=0.9'
            }
        });
        
        if (response.ok) {
            const html = await response.text();
            
            // Parsear resultados del HTML
            const jobMatches = html.matchAll(/class="job-card"[^>]*>[\s\S]*?href="([^"]+)"[\s\S]*?<h3[^>]*>([^<]+)<\/h3>[\s\S]*?company[^>]*>([^<]+)<\/div>/gi);
            
            for (const match of jobMatches) {
                jobs.push({
                    title: match[2].trim(),
                    company: match[3].trim(),
                    location: 'El Salvador',
                    salary: null,
                    url: match[1].startsWith('http') ? match[1] : BASE_URL + match[1],
                    description: '',
                    postedDate: new Date().toISOString()
                });
            }
        }
    } catch (err) {
        console.log(`[Tecoloco] Método alternativo falló: ${err.message}`);
    }
    
    return jobs;
}

async function postJobs(jobs) {
    let newCount = 0;
    let duplicateCount = 0;
    
    for (const job of jobs) {
        try {
            const jobData = {
                title: job.title,
                company: job.company,
                location: job.location || 'El Salvador',
                salary: job.salary,
                url: job.url,
                description: job.description || '',
                postedDate: job.postedDate ? new Date(job.postedDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                source: 'Tecoloco',
                modality: detectModality(job.description),
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
                console.log(`[Tecoloco] Nuevo: "${job.title}" en ${job.company}`);
            }
        } catch (err) {
            console.log(`[Tecoloco] Error: ${err.message}`);
        }
        
        await delay(600);
    }
    
    console.log(`[Tecoloco] Resumen: ${newCount} nuevos, ${duplicateCount} duplicados`);
    return { newCount, duplicateCount };
}

function detectModality(description) {
    const text = (description || '').toLowerCase();
    if (text.includes('remoto') || text.includes('remote')) return 'Remoto';
    if (text.includes('híbrido') || text.includes('hybrid')) return 'Híbrido';
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
        'react': ['React'],
        'angular': ['Angular'],
        'node': ['Node.js'],
        'python': ['Python'],
        'java': ['Java'],
        'php': ['PHP'],
        'laravel': ['Laravel'],
        'sql': ['SQL'],
        'javascript': ['JavaScript']
    };
    
    for (const [key, value] of Object.entries(stackMap)) {
        if (t.includes(key)) stacks.push(...value);
    }
    
    return stacks.length > 0 ? [...new Set(stacks)] : ['General'];
}

async function main() {
    console.log('[Tecoloco] === Scraper iniciado ===');
    
    const searchQuery = process.argv[2] || 'desarrollador';
    
    try {
        const jobs = await scrapeTecoloco(searchQuery);
        if (jobs.length > 0) {
            await postJobs(jobs);
        }
    } catch (err) {
        console.error('[Tecoloco] Error fatal:', err.message);
    }
    
    console.log('[Tecoloco] === Scraper finalizado ===');
}

module.exports = { scrapeTecoloco };

if (require.main === module) {
    main();
}