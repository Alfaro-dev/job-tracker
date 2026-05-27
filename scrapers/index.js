/**
 * Job Tracker - Scraper Index
 * Unifica todos los scrapers y exporta scrapeAll() para ejecución combinada
 */

const { scrapeLinkedIn } = require('./linkedin-scraper');
const { scrapeTecoloco } = require('./tecoloco-scraper');
const { scrapeComputrabajo } = require('./computrabajo-scraper');
const { scrapeBuscojobs } = require('./buscojobs-scraper');

// Map de scrapers disponibles
const SCRAPERS = {
    linkedin: scrapeLinkedIn,
    tecoloco: scrapeTecoloco,
    computrabajo: scrapeComputrabajo,
    buscojobs: scrapeBuscojobs
};

/**
 * Ejecuta un scraper específico por nombre
 * @param {string} name - Nombre del scraper (linkedin, tecoloco, computrabajo, buscojobs)
 * @param {string} query - Término de búsqueda
 * @returns {Promise<Object>} Resultado del scraping
 */
/**
 * Ejecuta un scraper específico y retorna los jobs
 * @param {string} name - Nombre del scraper
 * @param {string} query - Término de búsqueda
 * @returns {Promise<Array>} Array de jobs encontrados
 */
async function scrapeOne(name, query = 'desarrollador flutter laravel') {
    const scraper = SCRAPERS[name.toLowerCase()];
    if (!scraper) {
        console.log(`[Scraper] Scrapers disponibles: ${Object.keys(SCRAPERS).join(', ')}`);
        return [];
    }

    try {
        console.log(`[Scraper] Ejecutando ${name} con query: "${query}"`);
        const jobs = await scraper(query);
        console.log(`[Scraper] ${name}: ${jobs.length} jobs encontrados`);
        return jobs;
    } catch (err) {
        console.error(`[Scraper] Error en ${name}: ${err.message}`);
        return [];
    }
}

/**
 * Ejecuta todos los scrapers y retorna jobs combinados (sin duplicados por URL)
 * @param {string} query - Término de búsqueda
 * @returns {Promise<Array>} Jobs de todas las fuentes, deduplicados
 */
async function scrapeAll(query = 'desarrollador flutter laravel') {
    console.log('[Scraper] === Iniciando scraping de todas las fuentes ===');
    console.log(`[Scraper] Query: "${query}"`);

    // Ejecutar todos en paralelo
    const allResults = await Promise.all(
        Object.keys(SCRAPERS).map(name => scrapeOne(name, query))
    );

    // Flatten y deduplicar por URL
    const seen = new Set();
    const unique = [];

    for (const jobs of allResults) {
        for (const job of jobs) {
            if (job.url && !seen.has(job.url)) {
                seen.add(job.url);
                unique.push(job);
            }
        }
    }

    console.log(`[Scraper] === Total jobs únicos: ${unique.length} ===`);
    return unique;
}

/**
 * Ejecuta todos los scrapers
 * @param {string} query - Término de búsqueda para todos los scrapers
 * @returns {Promise<Array>} Resultados de todos los scrapers
 */
async function scrapeAll(query = 'desarrollador') {
    console.log('[Scraper] === Iniciando scraping de todas las fuentes ===');
    console.log(`[Scraper] Query: "${query}"`);
    
    const results = [];
    
    for (const name of Object.keys(SCRAPERS)) {
        const result = await scrapeOne(name, query);
        results.push(result);
        
        // Pausa entre scrapers para evitar bloqueos
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('[Scraper] === Scraping completado ===');
    console.log('Resumen:');
    
    for (const r of results) {
        if (r.success) {
            console.log(`  ✓ ${r.name}: ${r.count} ofertas`);
        } else {
            console.log(`  ✗ ${r.name}: ${r.error}`);
        }
    }
    
    return results;
}

/**
 * Ejecuta scrapers específicos (no todos)
 * @param {Array<string>} names - Array de nombres de scrapers
 * @param {string} query - Término de búsqueda
 */
async function scrapeSome(names, query) {
    console.log(`[Scraper] Ejecutando scrapers específicos: ${names.join(', ')}`);
    
    const results = [];
    for (const name of names) {
        const result = await scrapeOne(name, query);
        results.push(result);
        await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    return results;
}

module.exports = {
    scrapeAll,
    scrapeOne,
    scrapeSome,
    SCRAPERS
};

// Si se ejecuta directamente
if (require.main === module) {
    const args = process.argv.slice(2);
    const query = args[0] || 'desarrollador flutter laravel';

    scrapeAll(query).then(jobs => {
        console.log(`\nTotal jobs únicos collected: ${jobs.length}`);
        process.exit(0);
    }).catch(err => {
        console.error('Error fatal:', err.message);
        process.exit(1);
    });
}