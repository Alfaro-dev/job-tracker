/**
 * LinkedIn Job Scraper for Job Tracker
 * Usage:
 *   node scraper-linkedin.js           # Normal run (headless)
 *   node scraper-linkedin.js --debug   # See browser (for testing)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const JOBS_FILE = path.join(__dirname, 'data', 'jobs.json');
const LOG_FILE = path.join(__dirname, 'logs', 'scraper.log');

const DEBUG = process.argv.includes('--debug');
const MAX_JOBS = 100;

function log(msg) {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
}

async function scrapeJobs(page) {
    // Use Carlos's specific search URL
    const searchUrl = 'https://www.linkedin.com/jobs/search/?currentJobId=4418148519&distance=25.0&f_TPR=r604800&geoId=91000011&keywords=flutter&origin=JOB_SEARCH_PAGE_JOB_FILTER&sortBy=DD';
    log(`Navigating to: ${searchUrl}`);
    
    await page.goto(searchUrl, { timeout: 30000 });
    await page.waitForTimeout(4000);
    
    // Scroll to load all jobs (LinkedIn lazy-loads with infinite scroll)
    for (let i = 0; i < 15; i++) {
        await page.evaluate(() => window.scrollBy(0, 600));
        await page.waitForTimeout(700);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(2000);
    
    const jobs = await page.evaluate(() => {
        const cards = document.querySelectorAll('.base-card');
        return Array.from(cards).map(card => {
            const lines = card.innerText.split('\n').filter(t => t.trim());
            const link = card.querySelector('.base-card__full-link')?.href;
            
            return {
                title: lines[0] || null,
                company: lines[2] || null,
                location: lines[3] || null,
                time: lines[4] || null,
                link: link
            };
        }).filter(j => j.title && j.link);
    });
    
    log(`Found ${jobs.length} job cards`);
    return jobs;
}

function parseTimeToDays(timeStr) {
    if (!timeStr) return 0;
    const t = timeStr.toLowerCase();
    if (t.includes('hoy') || t.includes('today') || t.includes('hour')) return 0;
    if (t.includes('yesterday') || t.includes('ayer')) return 1;
    const numMatch = timeStr.match(/(\d+)/);
    if (!numMatch) return 0;
    const num = parseInt(numMatch[1]);
    if (t.includes('semana') || t.includes('week')) return num * 7;
    if (t.includes('mes') || t.includes('month')) return num * 30;
    return num;
}

function mergeJobs(newJobs, existingData) {
    const existingUrls = new Set([
        ...(existingData.jobs || []).map(j => j.url),
        ...(existingData.closedJobs || []).map(j => j.url)
    ]);
    
    const now = new Date().toISOString().split('T')[0];
    const merged = [...(existingData.jobs || [])];
    let maxId = Math.max(0, ...(existingData.jobs || []).map(j => j.id || 0));
    
    for (const job of newJobs) {
        if (existingUrls.has(job.link)) continue;
        
        const loc = job.location || '';
        const isRemote = loc.toLowerCase().includes('remoto') || 
                        loc.toLowerCase().includes('remote') ||
                        loc.toLowerCase().includes('latin america') ||
                        loc === '';
        const modality = isRemote ? 'Remoto' : 'Presencial';
        
        const daysAgo = parseTimeToDays(job.time);
        const date = new Date(Date.now() - daysAgo * 86400000).toISOString().split('T')[0];
        
        maxId++;
        merged.push({
            id: maxId,
            title: job.title,
            company: job.company,
            url: job.link,
            salary: null,
            salaryMax: null,
            currency: 'USD',
            modality,
            location: job.location || 'LatAm',
            stack: detectStack(job.title),
            date,
            daysAgo,
            notes: 'Scrapeado de LinkedIn',
            isIdeal: false,
            applied: false,
            cvRequested: false
        });
    }
    
    return merged;
}

function detectStack(title) {
    const t = (title || '').toLowerCase();
    if (t.includes('flutter')) return ['Flutter'];
    if (t.includes('react native')) return ['React Native'];
    if (t.includes('swift') || t.includes('ios')) return ['iOS', 'Swift'];
    if (t.includes('kotlin') || t.includes('android')) return ['Android', 'Kotlin'];
    return ['Flutter'];
}

async function main() {
    log('=== LinkedIn Scraper Started ===');
    
    const browser = await chromium.launch({
        headless: !DEBUG,
        args: DEBUG ? [] : ['--no-sandbox', '--disable-dev-shm-usage']
    });
    
    try {
        const context = await browser.newContext({
            viewport: { width: 1400, height: 900 }
        });
        const page = await context.newPage();
        
        const jobs = await scrapeJobs(page);
        
        // Load existing data
        let existingData = { jobs: [], closedJobs: [] };
        if (fs.existsSync(JOBS_FILE)) {
            existingData = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
        }
        
        const merged = mergeJobs(jobs, existingData);
        const newCount = merged.length - existingData.jobs.length;
        
        existingData.jobs = merged;
        existingData.lastChecked = new Date().toISOString();
        existingData.lastUpdated = new Date().toISOString().split('T')[0];
        
        fs.writeFileSync(JOBS_FILE, JSON.stringify(existingData, null, 2));
        log(`Saved ${merged.length} total jobs (+${newCount} new)`);
        
    } finally {
        await browser.close();
    }
    
    log('=== Done ===');
}

main().catch(e => {
    log(`ERROR: ${e.message}`);
    console.error(e);
    process.exit(1);
});