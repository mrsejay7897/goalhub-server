const express = require("express");
const Parser = require("rss-parser");

const app = express();
const parser = new Parser();

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
