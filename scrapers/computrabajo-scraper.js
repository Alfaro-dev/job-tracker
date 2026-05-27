/**
 * Computrabajo Job Scraper - Bolsa de trabajo con presencia en Latinoamérica
 * Usa solo fetch de Node.js con retry y detección de bloqueos
 */

const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const API_URL = process.env.API_URL || 'http://localhost:3000/api/jobs';
const BASE_URL = 'https://www.computrabajo.com';
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
                if (attempt < retries) {
                    const waitTime = BASE_DELAY * Math.pow(2, attempt);
                    console.log(`[Computrabajo] Bloqueo ${res.status}. Reintentando en ${waitTime}ms...`);
                    await delay(waitTime);
                    continue;
                }
                throw new Error(`Bloqueo detectado (${res.status})`);
            }
            
            return res;
        } catch (err) {
            if (attempt === retries) throw err;
            const waitTime = BASE_DELAY * Math.pow(2, attempt);
            console.log(`[Computrabajo] Error: ${err.message}. Reintentando en ${waitTime}ms...`);
            await delay(waitTime);
        }
    }
}

/**
 * Realiza scraping de Computrabajo
 * Computrabajo es una plataforma grande con presencia en varios países de LatAm
 */
async function scrapeComputrabajo(searchQuery = 'desarrollador', country = 'sv') {
    console.log(`[Computrabajo] Iniciando scraping para: "${searchQuery}" en ${country}`);
    
    const jobs = [];
    
    // Computrabajo tiene APIs públicas para búsqueda de empleos
    const searchUrl = `${BASE_URL}/api/search/v1/jobs?q=${encodeURIComponent(searchQuery)}&country=${country}`;
    
    try {
        const response = await fetchWithRetry(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'es-ES,es;q=0.9',
                'Referer': `${BASE_URL}/`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.items) {
                for (const job of data.items.slice(0, 30)) {
                    jobs.push(parseJob(job));
                }
            } else if (Array.isArray(data)) {
                for (const job of data.slice(0, 30)) {
                    jobs.push(parseJob(job));
                }
            }
        }
    } catch (err) {
        console.log(`[Computrabajo] Error en API principal: ${err.message}`);
    }
    
    // Método alternativo: buscar en la página de resultados
    if (jobs.length === 0) {
        jobs.push(...await tryAlternative(searchQuery, country));
    }
    
    console.log(`[Computrabajo] Scraping completado: ${jobs.length} ofertas`);
    return jobs;
}

function parseJob(job) {
    return {
        title: job.title || job.name || job.position || job.titulo,
        company: job.company?.name || job.company || job.employer || job.empresa,
        location: job.location?.city ? `${job.location.city}, ${job.location.country}` : (job.location || job.ubicacion || 'Latinoamérica'),
        salary: job.salary?.min ? `${job.salary.min}-${job.salary.max}` : (job.salary || job.salario || null),
        url: job.url || job.link || `${BASE_URL}/job/${job.id}`,
        description: job.description || job.summary || job.descripcion || '',
        postedDate: job.publishedDate || job.created_at || job.fechaPublicacion || new Date().toISOString()
    };
}

async function tryAlternative(searchQuery, country) {
    const jobs = [];
    
    // Buscar en el catálogo público de Computrabajo
    const searchPage = `${BASE_URL}/trabajo-en-${country}?q=${encodeURIComponent(searchQuery)}`;
    
    try {
        const response = await fetchWithRetry(searchPage, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html',
                'Accept-Language': 'es-ES,es;q=0.9'
            }
        });
        
        if (response.ok) {
            const html = await response.text();
            
            // Computrabajo estructura sus resultados con clases específicas
            const jobBlocks = html.matchAll(/data-job-id="(\d+)"[^>]*>[\s\S]*?class="job[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
            
            for (const block of jobBlocks) {
                const id = block[1];
                const content = block[2];
                
                const titleMatch = content.match(/<h3[^>]*>([^<]+)<\/h3>/i);
                const companyMatch = content.match(/class="company"[^>]*>([^<]+)<\/span>/i);
                const locationMatch = content.match(/class="location"[^>]*>([^<]+)<\/span>/i);
                
                if (titleMatch) {
                    jobs.push({
                        title: titleMatch[1].trim(),
                        company: companyMatch ? companyMatch[1].trim() : 'No especificada',
                        location: locationMatch ? locationMatch[1].trim() : 'Latinoamérica',
                        salary: null,
                        url: `${BASE_URL}/job/view/${id}`,
                        description: '',
                        postedDate: new Date().toISOString()
                    });
                }
            }
        }
    } catch (err) {
        console.log(`[Computrabajo] Método alternativo falló: ${err.message}`);
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
                location: job.location || 'Latinoamérica',
                salary: job.salary,
                url: job.url,
                description: job.description || '',
                postedDate: job.postedDate ? new Date(job.postedDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                source: 'Computrabajo',
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
                console.log(`[Computrabajo] Nuevo: "${job.title}" en ${job.company}`);
            }
        } catch (err) {
            console.log(`[Computrabajo] Error: ${err.message}`);
        }
        
        await delay(600);
    }
    
    console.log(`[Computrabajo] Resumen: ${newCount} nuevos, ${duplicateCount} duplicados`);
    return { newCount, duplicateCount };
}

function detectModality(description) {
    const text = (description || '').toLowerCase();
    if (text.includes('remoto') || text.includes('remote') || text.includes('teletrabajo')) return 'Remoto';
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
        'javascript': ['JavaScript'],
        'typescript': ['TypeScript'],
        'vue': ['Vue.js']
    };
    
    for (const [key, value] of Object.entries(stackMap)) {
        if (t.includes(key)) stacks.push(...value);
    }
    
    return stacks.length > 0 ? [...new Set(stacks)] : ['General'];
}

async function main() {
    console.log('[Computrabajo] === Scraper iniciado ===');
    
    const searchQuery = process.argv[2] || 'desarrollador';
    const country = process.argv[3] || 'sv';
    
    try {
        const jobs = await scrapeComputrabajo(searchQuery, country);
        if (jobs.length > 0) {
            await postJobs(jobs);
        }
    } catch (err) {
        console.error('[Computrabajo] Error fatal:', err.message);
    }
    
    console.log('[Computrabajo] === Scraper finalizado ===');
}

module.exports = { scrapeComputrabajo };

if (require.main === module) {
    main();
}