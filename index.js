const { existsSync, createReadStream, createWriteStream, writeFileSync } = require("fs");
const { resolve } = require("path");
const { request } = require("undici");
const { pipeline } = require("stream/promises");
const Cheerio = require("cheerio");
const Location = require("./cache/location.json");

const fastify = require("fastify").default({logger: true});
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
        function quick404(error='') {
            return reply.code(400).header('Content-Type', 'application/json').send({ error });
        }

        if (!req.query['path']) return quick404("Missing path querystring. ");

        if (!['.png'].some(file => req.query['path'].endsWith(file))) return quick404("Recognised file type only: PNG"); //!req.query['path'].endsWith(".png"))

        if (['http', '/', 'ws', '.', 'file:', 'file'].some(indicator => req.query['path'].toLowerCase().startsWith(indicator))) return quick404("The path must be the file name, like this for example: 'Nightwraith.png' (excluding the quotation mark)");

        /**
         * @type {string}
         */
        const path = req.query['path']//(req.query['path'].startsWith("/")) ? req.query['path'] : '/' + req.query['path'];
        const redirect = (req.query['redirect'] === 'true') ? true : false; // ik but oh well shush.

        // Check if it is already stored in cache.
        if (redirect && Location[path]) return reply.redirect(Location[path]);

        if (existsSync(resolve(__dirname + '/cache/' + path))) return reply.header("Content-Disposition", 'attachment; filename="poggus.png"').send(createReadStream(resolve(__dirname + '/cache/' + path)));

        // If we made it here, looks like we're gonna have to fetch it! ^.^

        // Checks if we already have the image source, but as we're here, this means we dont have the file downloaded.

        try {
            if (Location[path]) {
                let img = await downloadImageFromLink(Location[path], resolve(__dirname + '/cache/' + path));

                //console.log(redirect, req.query.redirect);
                if (redirect) return reply.redirect(Location[path]);
                if (img.success) return reply.header("Content-Disposition", 'attachment; filename="poggus.png"').send(createReadStream(resolve(__dirname + '/cache/' + path)));

                return quick404(img.error);
            }

            // We made it here? so it didn't exist in the cache... sad sussy.

            let link = await fetchImageLinkFromSource(path);

            if (link.link) {
                Location[path] = link.link;
                writeFileSync(resolve(__dirname + '/cache/location.json'), JSON.stringify(Location)); // yes this will be problematic if we get like 50 links and a bunch of requests all at once, but I hugely doubt this API will require futureproofing.

                console.log(link);
                if (redirect) return reply.redirect(link.link);

                let imgA = await downloadImageFromLink(link.link, resolve(__dirname + '/cache/' + path));

                if (imgA.success) return reply.header("Content-Disposition", 'attachment; filename="poggus.png"').send(createReadStream(resolve(__dirname + '/cache/' + path)));

                return quick404(imgA.error);
            }

            return quick404(link.error);


        } catch (err) {
            return quick404("There has been a problem either downloading or fetching the image");
        }
        
    }
});

/**
 * @param {string} link (relative, when i say link I mean something like 'nightwraith.png' or 'titan.png', basically file names)
 * @returns {Promise<{link?: string, error?: "Page doesn't exist."|"Errored trying to fetch/parse the image source's page."}>}
 */
async function fetchImageLinkFromSource(link) {
    try {
        const { body, statusCode } = await request("https://epicduelwiki.com/w/File:" + link, {method: "GET" });

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
 * Downloads the image content
 * @param {string} link (full link)
 * @param {string} finalPath path to where the file downloaded should be at (and also its name)
 * @returns {Promise<{success: true, error: "Page doesn't exist."|"Errored trying to download the image."}>}
 */
async function downloadImageFromLink(link, finalPath) {
    try {
        const { body, statusCode } = await request(link);

        if (statusCode === 404) return {error: "Page doesn't exist."};

        //let piping = body.pipe(createWriteStream(finalPath));

        await pipeline(body, createWriteStream(finalPath));

        return { success: true }
    } catch (err) {
        console.log(err);
        return {error: "Errored trying to download the image."};
    }
}

fastify.setErrorHandler((error, req, res) => {
    if (error) console.log(error); //idk
})

fastify.listen(PORT, (devMode) ? '127.0.0.1' : '0.0.0.0').then(() => {
    console.log("Listening to " + ((devMode) ? '127.0.0.1' : '0.0.0.0') + ":" + PORT);
}, console.log);