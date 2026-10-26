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

app.listen(PORT, () => {
    console.log(
        `GoalHub news server running at http://localhost:${PORT}`
    );
});