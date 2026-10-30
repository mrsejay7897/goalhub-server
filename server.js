const express = require("express");
const Parser = require("rss-parser");

const app = express();
const parser = new Parser({
    customFields: {
        item: ["media:thumbnail", "media:content"]
    }
});

// GoalHub Head-to-Head fixture cache
const h2hFixtureCache = new Map();
const H2H_CACHE_TTL = 24 * 60 * 60 * 1000;

const PORT = process.env.PORT || 3000;
const BBC_FEED = "https://feeds.bbci.co.uk/sport/football/rss.xml";

// Allow GoalHub to request news
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});

// Test endpoint
app.get("/", (req, res) => {
    res.send("GoalHub news server is running!");
});

// BBC football news endpoint
app.get("/api/news", async (req, res) => {
    try {
        const feed = await parser.parseURL(BBC_FEED);

        const articles = feed.items.slice(0, 6).map((item) => ({
            title: item.title || "Football News",
            description: item.contentSnippet || "",
            link: item.link || "https://www.bbc.co.uk/sport/football",
            image:
                item.enclosure?.url ||
                item["media:thumbnail"]?.$.url ||
                ""
        }));

        res.json({
            status: "ok",
            articles
        });
    } catch (error) {
        console.error("BBC news error:", error.message);

        res.status(502).json({
            status: "error",
            message: "Unable to retrieve BBC football news."
        });
    }
});

// Zafronix Cup Fixtures
const ZAFRONIX_API_KEY = process.env.ZAFRONIX_API_KEY;

async function getCupFixtures(cup, season) {
    const allowedCups = {
        carabao: "carabaocup",
        fa: "facup"
    };

    const competition = allowedCups[cup];

    if (!competition) {
        throw new Error("Unknown cup competition");
    }

    if (!ZAFRONIX_API_KEY) {
        throw new Error("Zafronix API key is not configured");
    }

    const url =
        `https://api.zafronix.com/england/${competition}/v1/matches` +
        `?season=${encodeURIComponent(season)}`;

    const response = await fetch(url, {
        headers: {
            "X-API-Key": ZAFRONIX_API_KEY
        }
    });

    if (!response.ok) {
        throw new Error(
            `Zafronix returned HTTP ${response.status}`
        );
    }

    return await response.json();
}

// Carabao Cup fixtures
app.get("/api/carabao-cup", async (req, res) => {
    try {
        const season = req.query.season || "2026";
        const data = await getCupFixtures("carabao", season);

        res.json({
            status: "ok",
            competition: "Carabao Cup",
            ...data
        });
    } catch (error) {
        console.error("Carabao Cup error:", error.message);

        res.status(502).json({
            status: "error",
            message: "Unable to load Carabao Cup fixtures."
        });
    }
});

// FA Cup fixtures
app.get("/api/fa-cup", async (req, res) => {
    try {
        const season = req.query.season || "2026";
        const data = await getCupFixtures("fa", season);

        res.json({
            status: "ok",
            competition: "FA Cup",
            ...data
        });
    } catch (error) {
        console.error("FA Cup error:", error.message);

        res.status(502).json({
            status: "error",
            message: "Unable to load FA Cup fixtures."
        });
    }
});
// Check available Carabao Cup seasons
app.get("/api/carabao-seasons", async (req, res) => {
    try {
        const response = await fetch(
            "https://api.zafronix.com/england/carabaocup/v1/seasons",
            {
                headers: {
                    "X-API-Key": ZAFRONIX_API_KEY
                }
            }
        );

        const data = await response.json();

        res.status(response.status).json(data);
    } catch (error) {
        console.error("Carabao seasons error:", error.message);

        res.status(502).json({
            status: "error",
            message: "Unable to check available seasons."
        });
    }
});

// GoalHub Head-to-Head route
app.get("/api/head-to-head", async (req, res) => {
    const home = String(req.query.home || "").trim();
    const away = String(req.query.away || "").trim();

    if (!home || !away) {
        return res.status(400).json({
            status: "error",
            message: "Please provide both home and away teams."
        });
    }

    if (home.toLowerCase() === away.toLowerCase()) {
        return res.status(400).json({
            status: "error",
            message: "Please select two different teams."
        });
    }

    const normalize = (name) =>
        name.toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, " ")
            .trim();

    const homeKey = normalize(home);
    const awayKey = normalize(away);

    const toSlug = (name) =>
        name.toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");

    const teamSlug = toSlug(home);

    const today = new Date();
    const endDate = new Date(Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate()
    ));

    const startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - 364);

    const dates = [];

    for (
        let date = new Date(startDate);
        date <= endDate;
        date.setUTCDate(date.getUTCDate() + 1)
    ) {
        dates.push(date.toISOString().slice(0, 10));
    }

    const allMatches = [];
    let failedDays = 0;
    let nextIndex = 0;

    async function checkDate(date) {
        const cached = h2hFixtureCache.get(date);

        if (
            cached &&
            Date.now() - cached.timestamp < H2H_CACHE_TTL
        ) {
            return cached.fixtures;
        }

        const url =
            "https://sportscore.com/api/v1/fixtures/" +
            `?sport=football&date=${date}` +
            `&team=${encodeURIComponent(teamSlug)}` +
            "&status=finished&limit=200";

        const response = await fetch(url, {
            signal: AbortSignal.timeout(12000)
        });

        if (!response.ok) {
            throw new Error(`SportScore HTTP ${response.status}`);
        }

       const data = await response.json();
const fixtures = Array.isArray(data.matches)
    ? data.matches
    : [];

        h2hFixtureCache.set(date, {
            timestamp: Date.now(),
            fixtures
        });

        return fixtures;
    }

    async function worker() {
        while (nextIndex < dates.length) {
            const date = dates[nextIndex++];
            
            try {
                const fixtures = await checkDate(date);

                for (const match of fixtures) {
                    const matchHome = normalize(match.home || "");
                    const matchAway = normalize(match.away || "");

                    const isMeeting =
                        (matchHome === homeKey && matchAway === awayKey) ||
                        (matchHome === awayKey && matchAway === homeKey);

                    if (isMeeting) {
                        allMatches.push({
                            home: match.home,
                            away: match.away,
                            home_logo: match.home_logo || "",
                            away_logo: match.away_logo || "",
                            home_score: match.home_score,
                            away_score: match.away_score,
                            time: match.time || "",
                            competition: match.competition || "",
                            url: match.url || ""
                        });
                    }
                }
            } catch (error) {
                failedDays++;
                console.error(
                    `Head-to-Head error for ${date}:`,
                    error.message
                );
            }
        }
    }

    try {
        await Promise.all(
            Array.from({ length: 3 }, () => worker())
        );

        const uniqueMatches = [
            ...new Map(
                allMatches.map(match => [
                    `${match.time}|${normalize(match.home)}|${normalize(match.away)}`,
                    match
                ])
            ).values()
        ].sort((a, b) =>
            new Date(b.time || 0) - new Date(a.time || 0)
        );

        res.json({
            status: failedDays === dates.length ? "error" : "ok",
            home,
            away,
            periodDays: dates.length,
            failedDays,
            matches: uniqueMatches
        });
    } catch (error) {
        console.error("Head-to-Head error:", error.message);

        res.status(502).json({
            status: "error",
            message: "Unable to load Head-to-Head results."
        });
    }
});

app.listen(PORT, () => {
console.log(
"GoalHub news server running at http://localhost:${PORT}"
);
});