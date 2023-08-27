// Since this will be on a serverless app (cyclic), no cache/package.json etc will be served.

const { request } = require("undici");
const Cheerio = require("cheerio");

const fastify = require("fastify").default({ logger: false});
const PORT = process.env.PORT || 3000, devMode = false;

fastify.route({
    method: 'GET', 
    url: '/image',
    schema: {
        querystring: {
            path: { type: 'string' }
        }
    },
    handler: async (req, reply) => {
        const quick404 = (error='') => { return reply.code(400).header('Content-Type', 'application/json').send({ error }); }

        if (!req.query['path']) return quick404("Missing path querystring.");
        if (!['.png'].some(file => req.query['path'].toLowerCase().endsWith(file.toLowerCase()))) return quick404("Recognised file type only: PNG"); //!req.query['path'].endsWith(".png"))
        if (['http', '/', 'ws', '.', 'file:', 'file'].some(indicator => req.query['path'].toLowerCase().startsWith(indicator))) return quick404("The path must be the file name, like this for example: 'Nightwraith.png' (excluding the quotation mark)");

        /**
         * @type {string}
         */
        const path = req.query['path'];
        const redirect = (req.query['redirect'] === 'true') ? true : false; // ik but oh well shush.

        let result = await fetchImageLinkFromSource(path);

        if (result.error) return quick404(result.error);

        if (redirect) return reply.redirect(result.link);

        let image = await fetchImageFromLink(result.link);

        if (image.error) return quick404(image.error);

        if (image.statusCode >= 200 && image.statusCode < 300) return reply.status(200).header("Content-Disposition", 'attachment; filename="npc.png"').send(image.body);
        else return quick404("Unexpected result was given from the server.");
    }
});

/**
 * @param {string} path (relative, when i say path I mean something like 'nightwraith.png' or 'titan.png', basically a file name)
 * @returns {Promise<{link: string}|{error: "Page doesn't exist."|"Errored trying to fetch/parse the image source's page."}>}
 */
async function fetchImageLinkFromSource(path) {
    try {
        const { body, statusCode } = await request("https://epicduelwiki.com/w/File:" + path, {method: "GET", headersTimeout: 1000 * 60 * 5, bodyTimeout: 0});

        if (statusCode === 404) return {error: "Page doesn't exist."};

        let html = Cheerio.load(await body.text());

        let imageLink = html(".fullImageLink img").attr('src');

        if (imageLink.startsWith("//")) imageLink = "https://" + imageLink;

        return {link: imageLink}
    } catch (err) {
        console.log(err);
        return {error: "Errored trying to fetch/parse the image source's page."};
    }
}

/**
 * Fetches the raw image
 * @param {string} link (full link)
 * @returns {Promise<{success: true, body: any, statusCode: number}|{error: "Page doesn't exist."}>}
 */
async function fetchImageFromLink(link) {
    const { body, statusCode } = await request(link, { headersTimeout: 1000 * 60 * 5, bodyTimeout: 0});

    if (statusCode === 404) return {error: "Page doesn't exist."};

    return { success: true, body, statusCode };
}

fastify.setErrorHandler((error, req, res) => {
    if (error) console.log(error); //idk
});

fastify.listen({
    port: PORT, host: (devMode) ? '127.0.0.1' : '0.0.0.0'
}).then(() => console.log("Listening to " + ((devMode) ? '127.0.0.1' : '0.0.0.0') + ":" + PORT), console.log);