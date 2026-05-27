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
async function scrapeOne(name, query) {
    const scraper = SCRAPERS[name.toLowerCase()];
    if (!scraper) {
        console.log(`[Scraper] Scrapers disponibles: ${Object.keys(SCRAPERS).join(', ')}`);
        return { name, success: false, error: `Scraper "${name}" no encontrado` };
    }
    
    try {
        console.log(`[Scraper] Ejecutando ${name} con query: "${query}"`);
        const jobs = await scraper(query);
        return { name, success: true, count: jobs.length };
    } catch (err) {
        console.error(`[Scraper] Error en ${name}: ${err.message}`);
        return { name, success: false, error: err.message };
    }
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
    const query = args[0] || 'desarrollador';
    const specific = args[1];
    
    if (specific) {
        scrapeSome(specific.split(','), query).then(() => process.exit(0));
    } else {
        scrapeAll(query).then(() => process.exit(0));
    }
}