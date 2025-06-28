const { chromium } = require('playwright');

const launchOptions = {
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--single-process'
    ]
};

// ✅ Función mejorada para extraer propiedades
const extractData = async (page) => {
    const selector = 'script#ng-state';
    await page.waitForSelector(selector, { state: 'attached', timeout: 30000 });
    const content = await page.$eval(selector, el => el.textContent);
    
    let jsonData;
    try {
        jsonData = JSON.parse(content);
    } catch (e) {
        throw new Error('❌ No se pudo parsear como JSON');
    }

    const allDataEntries = [];

    for (const [key, value] of Object.entries(jsonData)) {
        const list = value?.b?.data?.data;
        if (Array.isArray(list) && list.length > 0 && list[0]?.title && list[0]?.slug) {
            allDataEntries.push({
                key,
                data: list
            });
        }
    }

    if (allDataEntries.length === 0) {
        throw new Error('❌ No se encontraron bloques válidos dentro de selector');
    }

    const mainBlock = allDataEntries.reduce((a, b) => (b.data.length > a.data.length ? b : a));

    console.log(`✅ selector: usando clave "${mainBlock.key}" con ${mainBlock.data.length} propiedades`);

    return mainBlock.data;
};

// 🚀 Obtener número total de páginas desde la clave que contiene ese dato
async function getMaxPages() {
    let browser;
    console.log('getMaxPages: Iniciando navegador efímero...');
    try {
        browser = await chromium.launch(launchOptions);
        const page = await browser.newPage({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
        });

        const firstPageUrl = `https://www.remax.com.ar/listings/buy?page=0&pageSize=24&sort=-createdAt&in:operationId=1&in:eStageId=0,1,2,3,4&locations=in:CF@%3Cb%3ECapital%3C%2Fb%3E%20%3Cb%3EFederal%3C%2Fb%3E::::::&landingPath=&filterCount=0&viewMode=listViewMode`;

        await page.goto(firstPageUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });

        // Esperamos el elemento que contiene el texto "Página X de Y"
        const paginatorSelector = '.p-container-paginator p';
        await page.waitForSelector(paginatorSelector, { timeout: 10000 });

        // Extraemos el texto, ej: "Página 1 de 174"
        const paginatorText = await page.$eval(paginatorSelector, el => el.innerText);
        console.log(`🔍 Texto del paginador: "${paginatorText}"`);

        // Extraemos el número de páginas
        const match = text.match(/de\s+(\d+)/i);
        if (match && match[1]) {
            const totalPages = parseInt(match[1], 10);
            console.log(`✅ Total de páginas detectado: ${totalPages}`);
            return totalPages;
        } else {
            console.warn('⚠️ No se pudo extraer el número total de páginas. Usando fallback.');
            return 775;
        }

    } catch (err) {
        console.warn(`⚠️ Error en getMaxPages: ${err.message}. Usando fallback.`);
        return 775;
    } finally {
        if (browser) {
            await browser.close();
            console.log('getMaxPages: Navegador efímero cerrado.');
        }
    }
};


// 🔍 Scrapeo robusto de propiedades página por página usando ng-state
async function scrapeRemax(startPage = 0, endPage) {
    let browser;
    console.log(`scrapeRemax: Iniciando navegador efímero para páginas ${startPage} a ${endPage}...`);
    try {
        browser = await chromium.launch(launchOptions);
        const page = await browser.newPage({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
        });

        let allProperties = [];

        for (let currentPage = startPage; currentPage <= endPage; currentPage++) {
            try {
                console.log(`🌐 Procesando página ${currentPage}...`);
                const url = `https://www.remax.com.ar/listings/buy?page=${currentPage}&pageSize=24&sort=-createdAt&in:operationId=1&in:eStageId=0,1,2,3,4&locations=in:CF@%3Cb%3ECapital%3C%2Fb%3E%20%3Cb%3EFederal%3C%2Fb%3E::::::&landingPath=&filterCount=0&viewMode=listViewMode`;

                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

                const propertiesData = await extractData(page);

                if (!propertiesData || propertiesData.length === 0) {
                    console.log(`  -> ⚠️ Página vacía. Finalizando.`);
                    break;
                }

                const pageProperties = propertiesData.map(prop => {
                    const price = prop.price ?? 0;
                    const currency = prop.currency?.value ?? '';
                    const formattedPrice = (price > 0 && currency) ? `${price} ${currency}` : 'Consultar';

                    return {
                        title: prop.title,
                        price: formattedPrice,
                        address: prop.displayAddress,
                        locality: prop.geoLabel,
                        latitude: prop.location?.coordinates?.[1] ?? 'No disponible',
                        longitude: prop.location?.coordinates?.[0] ?? 'No disponible',
                        brokers: prop.listBroker?.map(b => `${b.name} ${b.license}`).join(', ') ?? 'No disponible',
                        contactPerson: prop.associate?.name ?? 'No disponible',
                        office: prop.associate?.officeName ?? 'No disponible',
                        dimensionsLand: `${prop.dimensionLand} m²`,
                        m2Total: `${prop.dimensionTotalBuilt} m²`,
                        m2Cover: `${prop.dimensionCovered} m²`,
                        ambientes: prop.totalRooms > 0 ? `${prop.totalRooms} ambientes` : 'No disponible',
                        baños: prop.bathrooms > 0 ? `${prop.bathrooms} baños` : 'No disponible',
                        url: `https://www.remax.com.ar/listings/${prop.slug}`
                    };
                });

                console.log(`  -> ✅ ${pageProperties.length} propiedades extraídas.`);
                allProperties = allProperties.concat(pageProperties);

            } catch (error) {
                console.warn(`⚠️ Error al procesar la página ${currentPage}: ${error.message}. Continuando...`);
                continue;
            }
        }

        return allProperties;

    } catch (error) {
        console.error(`❌ Error fatal en scrapeRemax:`, error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
            console.log(`scrapeRemax: Navegador cerrado para lote ${startPage}-${endPage}.`);
        }
    }
}

module.exports = { getMaxPages, scrapeRemax };
